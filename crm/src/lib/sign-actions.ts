"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { SignField, SignSigner } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTemplate, agencyTemplates } from "@/lib/agency-templates";
import { scholarshipOffer } from "@/lib/consent-templates";
import { clientSession } from "@/lib/client-auth";
import { recommendFor, type TemplatePick } from "@/lib/consent-rank";
import { agencyTag } from "@/lib/data";
import { fileBytes, putFile, safeName } from "@/lib/files";
import { requireCap, requireRole } from "@/lib/session";
import { consentVars, responsibleAgent } from "@/lib/sign";
import { emailClient, emailOther, ev, hashToken, newToken, pendingSigners, recordSignature, signersOf } from "@/lib/sign-core";
import { detectSignFields } from "@/lib/sign-detect";
import { type ExtraSigner, renderBundle, sha256 } from "@/lib/sign-pdf";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const MAX_PDF = 20 * 1024 * 1024;

const fieldSchema = z.object({
  id: z.string().max(20),
  page: z.number().int().min(1).max(500),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  w: z.number().min(0.005).max(1),
  h: z.number().min(0.005).max(1),
  type: z.enum(["signature", "initials", "date", "name", "text", "checkbox"]),
  label: z.string().max(120),
  required: z.boolean(),
  source: z.enum(["template", "detected", "ai", "manual"]).optional(),
  signer: z.string().max(20).optional(),
});

export type SignerInput = { others: { label: string; name: string; email: string }[]; agentCountersign: boolean };
export type SignDraft = { id: string; fields: SignField[]; pages: number; method: string; title: string; signers: SignSigner[]; formFields?: number };

const otherSchema = z.array(z.object({ label: z.string().trim().min(2).max(40), name: z.string().trim().min(2).max(120), email: z.string().trim().email("Enter a valid email for each extra signer.").max(200) })).max(4);

async function meta() {
  const h = await headers();
  return { ip: (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null, agent: h.get("user-agent")?.slice(0, 300) ?? null };
}

/**
 * Staff: start a signature request. The source is one consent template, several as one pack, a PDF
 * just uploaded, or a PDF already in the client's documents. Sets up the signers, finds the fields
 * and returns a draft for the agent to check before sending.
 */
export async function createSignDraft(input: { clientId: string; matterId?: string | null; origin: "template" | "upload" | "file"; templateKey?: string; templateKeys?: string[]; documentId?: string; upload?: { key: string; name: string }; ai?: boolean; signers?: SignerInput; extraVars?: Record<string, string>; title?: string }): Promise<ActionResult & { draft?: SignDraft }> {
  try {
    const ctx = await requireCap("clients");
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, input.clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    let matterId = input.matterId || null;
    let assignedTo: string | null = null;
    if (matterId) {
      const [m] = await db.select({ id: s.matters.id, assignedTo: s.matters.assignedTo }).from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId), eq(s.matters.clientId, c.id)));
      if (!m) matterId = null;
      assignedTo = m?.assignedTo ?? null;
    }
    const clientName = `${c.firstName} ${c.lastName}`;
    const others = otherSchema.parse(input.signers?.others ?? []);
    const agent = input.signers?.agentCountersign ? await responsibleAgent(ctx.agencyId, assignedTo, ctx.userId) : null;
    const signers: SignSigner[] = [
      { id: "client", role: "client", label: "Client", name: clientName, email: c.email, status: "pending" },
      ...others.map((o, i) => ({ id: `s${i + 2}`, role: "other" as const, label: o.label, name: o.name, email: o.email, status: "pending" as const })),
      ...(agent ? [{ id: "agent", role: "agent" as const, label: "Registered migration agent", name: agent.name, email: null, userId: agent.userId, status: "pending" as const }] : []),
    ];
    const extra: ExtraSigner[] = signers.filter((x) => x.role !== "client").map((x) => ({ id: x.id, role: x.role as "other" | "agent", label: x.label, name: x.name, marn: x.role === "agent" ? agent?.marn : null }));

    let bytes: Uint8Array;
    let title: string;
    let fields: SignField[];
    let pages: number;
    let method: string;
    let formFields = 0;
    let sourceDocumentId: string | null = null;
    let bundle: string[] | null = null;
    if (input.origin === "template") {
      const keys = (input.templateKeys?.length ? input.templateKeys : [input.templateKey ?? ""]).slice(0, 12);
      const list = (await Promise.all(keys.map(async (k) => (k === scholarshipOffer.key ? scholarshipOffer : agencyTemplate(ctx.agencyId, k))))).filter((t): t is NonNullable<typeof t> => Boolean(t));
      if (!list.length) return { ok: false, error: "Template not found." };
      // Letters made from student data (e.g. a scholarship offer) add their own values.
      const vars = { ...(await consentVars(ctx.agencyId, c.id, matterId, ctx.userId)), ...(input.extraVars ?? {}) };
      // The agent countersigns only the forms that call for it.
      const r = await renderBundle(list, vars, extra, (t) => Boolean(t.countersign));
      bytes = r.bytes;
      fields = r.fields;
      pages = r.pages;
      title = input.title ? input.title.slice(0, 200) : list.length === 1 ? list[0].title : keys.join(",") === NEW_CLIENT_PACK.join(",") ? "New client pack" : `${list.length} consent forms`;
      if (list.length > 1) bundle = list.map((t) => t.key);
      method = "template";
    } else {
      let key: string;
      if (input.origin === "file") {
        const [d] = await db.select().from(s.documents).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.id, input.documentId ?? ""), eq(s.documents.clientId, c.id)));
        if (!d?.storageKey) return { ok: false, error: "Document not found in this client's files." };
        if (!(d.mimeType === "application/pdf" || /\.pdf$/i.test(d.name))) return { ok: false, error: "Only PDFs can be sent for signature." };
        key = d.storageKey;
        title = d.name.replace(/\.pdf$/i, "");
        sourceDocumentId = d.id;
      } else {
        if (!input.upload?.key.startsWith(`agency/${ctx.agencyId}/`)) return { ok: false, error: "Upload not found." };
        if (!/\.pdf$/i.test(input.upload.name)) return { ok: false, error: "Only PDFs can be sent for signature." };
        key = input.upload.key;
        title = input.upload.name.replace(/\.pdf$/i, "");
      }
      const buf = await fileBytes(key);
      if (buf.byteLength > MAX_PDF) return { ok: false, error: "PDFs must be 20 MB or smaller." };
      if (buf.subarray(0, 5).toString() !== "%PDF-") return { ok: false, error: "This file isn't a valid PDF." };
      bytes = new Uint8Array(buf);
      const r = await detectSignFields(bytes, { clientName, useAi: input.ai !== false });
      fields = r.fields.map((f) => ({ ...f, signer: "client" }));
      pages = r.pages;
      method = r.method;
      formFields = await countTextFields(bytes);
    }
    // A signer with nothing to sign on these forms (e.g. no form in the pack needs the agent) is dropped.
    if (input.origin === "template") signers.splice(0, signers.length, ...signers.filter((x) => x.role === "client" || fields.some((f) => f.signer === x.id)));
    // Freeze a copy of exactly what will be signed.
    const stored = await putFile(`agency/${ctx.agencyId}/client/${c.id}/signing/${safeName(title)}.pdf`, Buffer.from(bytes), "application/pdf");
    const [row] = await db
      .insert(s.signRequests)
      .values({ agencyId: ctx.agencyId, clientId: c.id, matterId, title: title.slice(0, 200), origin: input.origin, templateKey: input.origin === "template" ? (bundle ? null : (input.templateKeys?.[0] ?? input.templateKey)) : null, bundle, sourceDocumentId, sourceKey: stored.pathname, sourceHash: sha256(bytes), pages, fields, signers, status: "draft", events: [ev("created", ctx.name, method)], sentBy: ctx.userId, sentByName: ctx.name })
      .returning({ id: s.signRequests.id });
    return { ok: true, id: row.id, draft: { id: row.id, fields, pages, method, title, signers, formFields } };
  } catch (e) {
    return fail(e);
  }
}

/** The forms most agencies send at engagement, as one pack. */
const NEW_CLIENT_PACK = ["privacy", "authority-to-act", "consumer-guide", "fee-estimate", "electronic-communication"];

async function countTextFields(bytes: Uint8Array) {
  try {
    const { PDFDocument, PDFTextField } = await import("pdf-lib");
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    return pdf.getForm().getFields().filter((f) => f instanceof PDFTextField).length;
  } catch {
    return 0;
  }
}

/** Staff: re-run field detection on a draft (e.g. with the AI after a plain pass). */
export async function redetectFields(id: string): Promise<ActionResult & { fields?: SignField[]; method?: string }> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id), eq(s.signRequests.status, "draft")));
    if (!r) return { ok: false, error: "Draft not found." };
    const [c] = await db.select({ f: s.clients.firstName, l: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, r.clientId));
    const out = await detectSignFields(new Uint8Array(await fileBytes(r.sourceKey)), { clientName: `${c.f} ${c.l}`, useAi: true });
    const fields = out.fields.map((f) => ({ ...f, signer: "client" }));
    await db.update(s.signRequests).set({ fields }).where(eq(s.signRequests.id, id));
    return { ok: true, fields, method: out.method };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: send a checked draft. The client gets a portal link; other signers their own links; the agent countersigns in Lodgely. */
export async function sendSignRequest(id: string, input: { title: string; message?: string; fields: SignField[]; dueAt?: string | null; invoiceId?: string | null }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id)));
    if (!r) return { ok: false, error: "Request not found." };
    if (r.status !== "draft") return { ok: false, error: "This request was already sent." };
    const [c] = await db.select().from(s.clients).where(eq(s.clients.id, r.clientId));
    let signers = signersOf(r, `${c.firstName} ${c.lastName}`);
    const ids = new Set(signers.map((x) => x.id));
    const fields = z.array(fieldSchema).min(1, "Add at least one field.").max(200).parse(input.fields).filter((f) => f.page <= r.pages).map((f) => ({ ...f, signer: f.signer && ids.has(f.signer) ? f.signer : "client" }));
    // A countersign with no fields placed (e.g. on an uploaded PDF) is dropped rather than blocking the send.
    signers = signers.filter((x) => x.role !== "agent" || fields.some((f) => f.signer === x.id));
    for (const sg of signers) {
      const mine = fields.filter((f) => f.signer === sg.id);
      if (!mine.some((f) => f.type === "signature" || f.type === "initials")) return { ok: false, error: `Add a signature field for ${sg.label === "Client" ? "the client" : sg.label.toLowerCase()} (${sg.name}).` };
    }
    if (!c.email) return { ok: false, error: "Add the client's email first so they can sign in to the portal." };
    let invoiceId: string | null = null;
    if (input.invoiceId) {
      const [inv] = await db.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, input.invoiceId), eq(s.invoices.clientId, c.id)));
      invoiceId = inv?.id ?? null;
    }
    const title = input.title.trim().slice(0, 200) || r.title;
    const dueAt = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? input.dueAt : null;
    // Personal links for other signers (only the hash is stored).
    const tokens = new Map<string, string>();
    const withTokens = signers.map((x) => {
      if (x.role !== "other") return x;
      const t = newToken();
      tokens.set(x.id, t);
      return { ...x, tokenHash: hashToken(t) };
    });
    const [sent] = await db
      .update(s.signRequests)
      .set({ title, message: input.message?.trim().slice(0, 2000) || null, fields, signers: withTokens, dueAt, invoiceId, status: "sent", events: sql`${s.signRequests.events} || ${JSON.stringify([ev("sent", ctx.name)])}::jsonb`, sentBy: ctx.userId, sentByName: ctx.name, createdAt: new Date() })
      .where(and(eq(s.signRequests.id, id), eq(s.signRequests.status, "draft")))
      .returning();
    if (!sent) return { ok: false, error: "This request was already sent." };
    await db.update(s.clients).set({ portalEnabled: true }).where(eq(s.clients.id, c.id));
    const emailed = await emailClient(sent, { agencyName: ctx.agencyName, byUserId: ctx.userId });
    let othersEmailed = 0;
    for (const x of withTokens.filter((y) => y.role === "other")) if (await emailOther(sent, x, tokens.get(x.id)!, { agencyName: ctx.agencyName, clientName: `${c.firstName} ${c.lastName}` })) othersEmailed++;
    const who = withTokens.filter((x) => x.role !== "client").map((x) => `${x.label} (${x.name})`);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: c.id, matterId: r.matterId, kind: "document", title: `Sent to sign: ${title}`, body: `${fields.length} field${fields.length === 1 ? "" : "s"}${dueAt ? `, due ${dueAt}` : ""}.${emailed ? " Emailed to the client with a sign-in link." : " Waiting in the client portal."}${who.length ? ` Also signing: ${who.join(", ")}${othersEmailed < withTokens.filter((y) => y.role === "other").length ? " (copy their links from E-sign: email isn't set up)" : ""}.` : ""}`, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "sign_request", entityId: id, detail: { title, fields: fields.length, signers: withTokens.length } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: emailed ? "emailed" : "portal" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: a fresh personal link for another signer (to copy and send yourself, or re-email). */
export async function otherSignerLink(id: string, signerId: string, email: boolean): Promise<ActionResult & { url?: string }> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id), inArray(s.signRequests.status, ["sent", "viewed"])));
    if (!r) return { ok: false, error: "Only unsigned requests have links." };
    const sg = signersOf(r).find((x) => x.id === signerId && x.role === "other");
    if (!sg || sg.status === "signed") return { ok: false, error: "That signer has already signed." };
    const t = newToken();
    const { appUrl } = await import("@/lib/client-auth");
    // Email first: the old link keeps working if the email can't be sent.
    if (email) {
      const [c] = await db.select({ f: s.clients.firstName, l: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, r.clientId));
      if (!(await emailOther(r, sg, t, { agencyName: ctx.agencyName, clientName: `${c.f} ${c.l}`, reminder: true }))) return { ok: false, error: "Email isn't set up for this agency. Copy the link instead." };
    }
    await db.update(s.signRequests).set({ signers: signersOf(r).map((x) => (x.id === signerId ? { ...x, tokenHash: hashToken(t) } : x)) }).where(eq(s.signRequests.id, id));
    return { ok: true, url: `${appUrl()}/sign/${t}` };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: remind everyone who hasn't signed yet. */
export async function remindSignRequest(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id), inArray(s.signRequests.status, ["sent", "viewed"])));
    if (!r) return { ok: false, error: "Only unsigned requests can be resent." };
    const left = pendingSigners(r);
    let n = 0;
    if (left.some((x) => x.role === "client") && (await emailClient(r, { agencyName: ctx.agencyName, byUserId: ctx.userId, reminder: "nudge" }))) n++;
    for (const x of left.filter((y) => y.role === "other")) if ((await otherSignerLink(id, x.id, true)).ok) n++;
    if (!n) return { ok: false, error: left.every((x) => x.role === "agent") ? "Only your countersignature is left: open the request to sign." : "Email isn't set up for this agency or client. The request is waiting in their portal." };
    await db.update(s.signRequests).set({ events: sql`${s.signRequests.events} || ${JSON.stringify([ev("reminded", ctx.name)])}::jsonb` }).where(eq(s.signRequests.id, id));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "email", title: `Reminder to sign: ${r.title}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: withdraw an unsigned request, or discard a draft. */
export async function voidSignRequest(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id)));
    if (!r) return { ok: false, error: "Request not found." };
    if (r.status === "draft") {
      await db.delete(s.signRequests).where(eq(s.signRequests.id, id));
    } else if (r.status === "sent" || r.status === "viewed") {
      await db.update(s.signRequests).set({ status: "void", events: sql`${s.signRequests.events} || ${JSON.stringify([ev("void", ctx.name)])}::jsonb` }).where(eq(s.signRequests.id, id));
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "document", title: `Signature request withdrawn: ${r.title}`, actorId: ctx.userId, actorName: ctx.name });
    } else return { ok: false, error: "Signed requests can't be withdrawn." };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type SignInput = { name: string; values: { id: string; value: string }[]; agree: boolean };

/** Client (portal): complete their fields and sign. */
export async function submitSignature(id: string, input: SignInput): Promise<ActionResult> {
  try {
    const c = await clientSession();
    if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.id, id), eq(s.signRequests.clientId, c.client.id)));
    if (!r) return { ok: false, error: "Document not found." };
    const out = await recordSignature(r, "client", { ...input, expectLastName: c.client.lastName }, { ...(await meta()), email: c.client.email });
    if ("error" in out) return { ok: false, error: out.error };
    updateTag(agencyTag(r.agencyId));
    return { ok: true, id: out.done ? (out.documentId ?? "done") : "waiting" };
  } catch (e) {
    return fail(e);
  }
}

/** Another signer (emailed link, no account). */
export async function submitLinkSignature(token: string, input: SignInput): Promise<ActionResult> {
  try {
    const h = hashToken(token);
    const [r] = await db.select().from(s.signRequests).where(sql`${s.signRequests.signers} @> ${JSON.stringify([{ tokenHash: h }])}::jsonb`);
    const sg = r ? signersOf(r).find((x) => x.tokenHash === h) : null;
    if (!r || !sg) return { ok: false, error: "This link is no longer valid. Ask the agency for a new one." };
    const out = await recordSignature(r, sg.id, { ...input, expectLastName: sg.name.split(" ").pop() ?? null }, { ...(await meta()), email: sg.email });
    if ("error" in out) return { ok: false, error: out.error };
    updateTag(agencyTag(r.agencyId));
    return { ok: true, id: out.done ? "done" : "waiting" };
  } catch (e) {
    return fail(e);
  }
}

/** The registered migration agent countersigns (signed in to Lodgely as that agent, or an admin). */
export async function submitAgentSignature(id: string, input: SignInput): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id)));
    if (!r) return { ok: false, error: "Request not found." };
    const sg = signersOf(r).find((x) => x.role === "agent");
    if (!sg) return { ok: false, error: "This request has no countersignature." };
    if (sg.userId && sg.userId !== ctx.userId && !["admin", "owner"].includes(ctx.role)) return { ok: false, error: `Only ${sg.name} (or an agency admin) can countersign.` };
    const out = await recordSignature(r, "agent", input, { ...(await meta()), email: ctx.email });
    if ("error" in out) return { ok: false, error: out.error };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: out.done ? "done" : "waiting" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: the consent forms this client's case needs now, most relevant first. */
export async function recommendTemplates(clientId: string, matterId: string | null): Promise<{ ok: true; picks: TemplatePick[]; done: string[]; method: "ai" | "rules" } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("clients");
    const keys = new Set((await agencyTemplates(ctx.agencyId)).map((t) => t.key));
    const r = await recommendFor(ctx.agencyId, clientId, matterId);
    return { ok: true, ...r, picks: r.picks.filter((p) => keys.has(p.key)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Staff: fill the PDF form's text boxes from the client record (rules, then AI), on a draft. */
export async function prefillDraft(id: string): Promise<ActionResult & { filled?: { name: string; value: string; by: "rule" | "ai" }[]; fields?: SignField[] }> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id), eq(s.signRequests.status, "draft")));
    if (!r) return { ok: false, error: "Draft not found." };
    const [c] = await db.select().from(s.clients).where(eq(s.clients.id, r.clientId));
    const dmy = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);
    const { prefillPdf } = await import("@/lib/form-prefill");
    const out = await prefillPdf(new Uint8Array(await fileBytes(r.sourceKey)), {
      familyName: c.lastName,
      givenNames: c.firstName,
      fullName: `${c.firstName} ${c.lastName}`,
      dateOfBirth: dmy(c.dateOfBirth),
      passportNumber: c.passportNumber,
      passportExpiry: dmy(c.passportExpiry),
      countryOfBirth: c.countryOfBirth,
      nationality: c.nationality,
      email: c.email,
      phone: c.phone,
      address: c.address,
      city: c.city,
      state: c.state,
      gender: c.gender,
      currentVisa: c.currentVisa,
      occupation: c.occupation,
    }, r.fields);
    if (!out.filled.length) return { ok: false, error: "No form boxes could be filled from the client record." };
    const stored = await putFile(`agency/${ctx.agencyId}/client/${c.id}/signing/${safeName(r.title)} (prefilled).pdf`, Buffer.from(out.bytes), "application/pdf");
    await db.update(s.signRequests).set({ sourceKey: stored.pathname, sourceHash: sha256(out.bytes), fields: out.fields, events: sql`${s.signRequests.events} || ${JSON.stringify([ev("created", ctx.name, `prefilled ${out.filled.length} boxes`)])}::jsonb` }).where(eq(s.signRequests.id, id));
    return { ok: true, filled: out.filled, fields: out.fields };
  } catch (e) {
    return fail(e);
  }
}
