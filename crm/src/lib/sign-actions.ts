"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { SignEvent, SignField } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { clientSession, createMagicLink } from "@/lib/client-auth";
import { consentByKey } from "@/lib/consent-templates";
import { agencyTag } from "@/lib/data";
import { fileBytes, putFile, safeName } from "@/lib/files";
import { mailEnabled, sendMail } from "@/lib/mail";
import { notifyStaff } from "@/lib/notify";
import { memberCtx, requireCap } from "@/lib/session";
import { consentVars } from "@/lib/sign";
import { detectSignFields } from "@/lib/sign-detect";
import { renderConsentPdf, sha256, stampSignedPdf } from "@/lib/sign-pdf";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const ev = (kind: SignEvent["kind"], by: string | null, detail?: string): SignEvent => ({ at: new Date().toISOString(), kind, by, ...(detail ? { detail } : {}) });
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
});

export type SignDraft = { id: string; fields: SignField[]; pages: number; method: string; title: string };

/**
 * Staff: start a signature request. The source is a consent template (rendered and filled in now),
 * a PDF just uploaded, or a PDF already in the client's documents. Finds the signing fields and
 * returns a draft for the agent to check before sending.
 */
export async function createSignDraft(input: { clientId: string; matterId?: string | null; origin: "template" | "upload" | "file"; templateKey?: string; documentId?: string; upload?: { key: string; name: string }; ai?: boolean }): Promise<ActionResult & { draft?: SignDraft }> {
  try {
    const ctx = await requireCap("clients");
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, input.clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    let matterId = input.matterId || null;
    if (matterId) {
      const [m] = await db.select({ id: s.matters.id }).from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId), eq(s.matters.clientId, c.id)));
      if (!m) matterId = null;
    }
    const clientName = `${c.firstName} ${c.lastName}`;
    let bytes: Uint8Array;
    let title: string;
    let fields: SignField[];
    let pages: number;
    let method: string;
    let sourceDocumentId: string | null = null;
    if (input.origin === "template") {
      const t = consentByKey(input.templateKey ?? "");
      if (!t) return { ok: false, error: "Template not found." };
      const vars = await consentVars(ctx.agencyId, c.id, matterId, ctx.userId);
      const r = await renderConsentPdf(t, vars);
      bytes = r.bytes;
      fields = r.fields;
      pages = r.pages;
      title = t.title;
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
      fields = r.fields;
      pages = r.pages;
      method = r.method;
    }
    // Freeze a copy of exactly what the client will sign.
    const stored = await putFile(`agency/${ctx.agencyId}/client/${c.id}/signing/${safeName(title)}.pdf`, Buffer.from(bytes), "application/pdf");
    const [row] = await db
      .insert(s.signRequests)
      .values({ agencyId: ctx.agencyId, clientId: c.id, matterId, title: title.slice(0, 200), origin: input.origin, templateKey: input.origin === "template" ? input.templateKey : null, sourceDocumentId, sourceKey: stored.pathname, sourceHash: sha256(bytes), pages, fields, status: "draft", events: [ev("created", ctx.name, method)], sentBy: ctx.userId, sentByName: ctx.name })
      .returning({ id: s.signRequests.id });
    return { ok: true, id: row.id, draft: { id: row.id, fields, pages, method, title } };
  } catch (e) {
    return fail(e);
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
    await db.update(s.signRequests).set({ fields: out.fields }).where(eq(s.signRequests.id, id));
    return { ok: true, fields: out.fields, method: out.method };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: send a checked draft to the client (email with a sign-in link, and in the portal). */
export async function sendSignRequest(id: string, input: { title: string; message?: string; fields: SignField[]; dueAt?: string | null }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id)));
    if (!r) return { ok: false, error: "Request not found." };
    if (r.status !== "draft") return { ok: false, error: "This request was already sent." };
    const fields = z.array(fieldSchema).min(1, "Add at least one field for the client.").max(120).parse(input.fields).filter((f) => f.page <= r.pages);
    if (!fields.some((f) => f.type === "signature" || f.type === "initials")) return { ok: false, error: "Add a signature field." };
    const [c] = await db.select().from(s.clients).where(eq(s.clients.id, r.clientId));
    if (!c.email) return { ok: false, error: "Add the client's email first so they can sign in to the portal." };
    const title = input.title.trim().slice(0, 200) || r.title;
    const dueAt = input.dueAt && /^\d{4}-\d{2}-\d{2}$/.test(input.dueAt) ? input.dueAt : null;
    await db
      .update(s.signRequests)
      .set({ title, message: input.message?.trim().slice(0, 2000) || null, fields, dueAt, status: "sent", events: sql`${s.signRequests.events} || ${JSON.stringify([ev("sent", ctx.name)])}::jsonb`, sentBy: ctx.userId, sentByName: ctx.name, createdAt: new Date() })
      .where(eq(s.signRequests.id, id));
    await db.update(s.clients).set({ portalEnabled: true }).where(eq(s.clients.id, c.id));
    const emailed = await emailLink(ctx, c, id, title, input.message ?? null, dueAt);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: c.id, matterId: r.matterId, kind: "document", title: `Sent to sign: ${title}`, body: `${fields.length} field${fields.length === 1 ? "" : "s"} to complete${dueAt ? `, due ${dueAt}` : ""}.${emailed ? " Emailed with a sign-in link." : " Waiting in the client portal."}`, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "sign_request", entityId: id, detail: { title, fields: fields.length } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: emailed ? "emailed" : "portal" };
  } catch (e) {
    return fail(e);
  }
}

async function emailLink(ctx: { agencyId: string; agencyName: string; userId: string }, c: typeof s.clients.$inferSelect, id: string, title: string, message: string | null, dueAt: string | null) {
  if (!c.email || c.email.endsWith(".test") || !mailEnabled()) return false;
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared")));
  if (!box) return false;
  const url = await createMagicLink(c.id, ctx.agencyId, ctx.userId, `/client/signatures/${id}`, 72 * 60);
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  await sendMail({
    agencyId: ctx.agencyId,
    from: { address: box.address, name: ctx.agencyName },
    to: [c.email],
    subject: `Please sign: ${title}`,
    html: `<p>Hi ${esc(c.firstName)},</p><p>${esc(ctx.agencyName)} has sent you <b>${esc(title)}</b> to sign${dueAt ? ` by ${esc(dueAt)}` : ""}.</p>${message ? `<p style="white-space:pre-line">${esc(message)}</p>` : ""}
<p>We'll guide you to each place to sign, one at a time. It takes about a minute on your phone.</p>
<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Review and sign</a></p>
<p style="color:#71717a;font-size:13px">This button signs you in to your client portal and works once in the next 3 days. After that, sign in to the portal with your email.</p>`,
    clientId: c.id,
    footer: `Sent by ${ctx.agencyName} via Lodgely`,
  });
  return true;
}

/** Staff: email the client again with a fresh link. */
export async function remindSignRequest(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id), inArray(s.signRequests.status, ["sent", "viewed"])));
    if (!r) return { ok: false, error: "Only unsigned requests can be resent." };
    const [c] = await db.select().from(s.clients).where(eq(s.clients.id, r.clientId));
    const ok = await emailLink(ctx, c, id, r.title, r.message, r.dueAt);
    if (!ok) return { ok: false, error: "Email isn't set up for this agency or client. The request is waiting in their portal." };
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

const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/** Client: complete every field and sign. Stamps the PDF, files it in their documents and tells the agent. */
export async function submitSignature(id: string, input: { name: string; values: { id: string; value: string }[]; agree: boolean }): Promise<ActionResult> {
  try {
    const c = await clientSession();
    if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
    const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.id, id), eq(s.signRequests.clientId, c.client.id)));
    if (!r || r.status === "draft") return { ok: false, error: "Document not found." };
    if (r.status === "signed") return { ok: true };
    if (r.status === "void") return { ok: false, error: "This request was withdrawn. Your agent will send a new one if needed." };
    if (!input.agree) return { ok: false, error: "Tick the box to agree to sign electronically." };
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 3 || !norm(name).includes(norm(c.client.lastName))) return { ok: false, error: `Type your full name as it appears on your passport (${c.client.firstName} ${c.client.lastName}).` };
    const given = new Map(input.values.filter((v) => typeof v.value === "string").map((v) => [v.id, v.value]));
    const values: { id: string; value: string }[] = [];
    for (const f of r.fields) {
      const v = (given.get(f.id) ?? "").trim();
      if (f.type === "signature" || f.type === "initials") {
        if (v && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 400_000)) return { ok: false, error: `Sign again in "${f.label}".` };
      } else if (v.length > 300) return { ok: false, error: `"${f.label}" is too long.` };
      if (f.required && (!v || (f.type === "checkbox" && v !== "yes"))) return { ok: false, error: `Complete "${f.label}" (page ${f.page}).` };
      if (v) values.push({ id: f.id, value: f.type === "checkbox" ? (v === "yes" ? "yes" : "") : v });
    }
    const source = await fileBytes(r.sourceKey);
    if (sha256(source) !== r.sourceHash) return { ok: false, error: "This document couldn't be verified. Ask your agent to send it again." };
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
    const agent = h.get("user-agent")?.slice(0, 300) ?? null;
    const signedAt = new Date();
    const [org] = await db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, r.agencyId));
    const pdf = await stampSignedPdf(new Uint8Array(source), r.fields, values, { id: r.id, title: r.title, agency: org?.name ?? "", clientName: `${c.client.firstName} ${c.client.lastName}`, sourceHash: r.sourceHash, sentByName: r.sentByName, sentAt: r.createdAt, viewedAt: r.viewedAt, signedAt, signerName: name, signerEmail: c.client.email, signerIp: ip, signerAgent: agent });
    const fileName = `${r.title} (signed).pdf`;
    const blob = await putFile(`agency/${r.agencyId}/client/${r.clientId}/signed/${safeName(fileName)}`, Buffer.from(pdf), "application/pdf").catch((e) => {
      console.error("signed pdf store", e);
      throw new Error("We couldn't save your signed copy just now. Please try again in a minute.");
    });
    const [doc] = await db
      .insert(s.documents)
      .values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, name: fileName, category: "Signed", mimeType: "application/pdf", sizeBytes: pdf.byteLength, storageKey: blob.pathname, uploadedBy: name, source: "portal" })
      .returning({ id: s.documents.id });
    const updated = await db
      .update(s.signRequests)
      .set({ status: "signed", signedAt, signerName: name, signerEmail: c.client.email, signerIp: ip, signerAgent: agent, values, documentId: doc.id, events: sql`${s.signRequests.events} || ${JSON.stringify([ev("signed", name, ip ?? undefined)])}::jsonb` })
      .where(and(eq(s.signRequests.id, id), inArray(s.signRequests.status, ["sent", "viewed"])))
      .returning({ id: s.signRequests.id });
    if (!updated.length) return { ok: true };
    // Templates that satisfy Code of Conduct steps update the matter.
    if (r.matterId && r.templateKey === "consumer-guide") {
      const today = signedAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      await db.update(s.matters).set({ consumerGuideAt: today }).where(and(eq(s.matters.id, r.matterId), sql`${s.matters.consumerGuideAt} is null`));
    }
    await db.insert(s.activities).values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "document", title: `Signed: ${r.title}`, body: `${name} signed in the client portal. The signed PDF is in the client's documents.`, actorName: name });
    await db.insert(s.auditLog).values({ agencyId: r.agencyId, actorId: null, actorName: name, action: "sign", entity: "sign_request", entityId: r.id, detail: { ip } });
    const [m] = r.matterId ? await db.select({ assignedTo: s.matters.assignedTo }).from(s.matters).where(eq(s.matters.id, r.matterId)) : [];
    const tell = [...new Set([r.sentBy, m?.assignedTo].filter((x): x is string => Boolean(x)))];
    const emails = (await Promise.all(tell.map((u) => memberCtx(r.agencyId, u)))).filter(Boolean).map((x) => x!.email);
    await notifyStaff(emails, `Signed: ${r.title} (${c.client.firstName} ${c.client.lastName})`, { heading: `${c.client.firstName} ${c.client.lastName} signed ${r.title}`, lines: ["The signed PDF, with its signing record, is in the client's documents."], cta: { label: "Open e-sign", path: `/app/sign` } });
    updateTag(agencyTag(r.agencyId));
    return { ok: true, id: doc.id };
  } catch (e) {
    return fail(e);
  }
}
