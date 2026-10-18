"use server";

import { and, eq, inArray } from "drizzle-orm";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { buildAgreement, DEFAULT_TERMS, hashContent } from "@/lib/agreement";
import { agreementPdf } from "@/lib/agreement-pdf";
import { clientSession, createMagicLink } from "@/lib/client-auth";
import { agencyTag } from "@/lib/data";
import { agencyLogo } from "@/lib/brand";
import { putFile } from "@/lib/files";
import { mailEnabled, sendMail } from "@/lib/mail";
import { notifyStaff } from "@/lib/notify";
import { memberCtx, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/** Staff: freeze the agreement for this matter and email the client a link to sign it in the portal. */
export async function sendAgreement(matterId: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const content = await buildAgreement(ctx.agencyId, matterId);
    if (!content) return { ok: false, error: "Matter not found." };
    const [m] = await db.select({ clientId: s.matters.clientId, signed: s.matters.agreementSignedAt }).from(s.matters).where(eq(s.matters.id, matterId));
    if (m.signed) return { ok: false, error: "This matter already has a signed agreement. Clear it first to send a new one." };
    const [c] = await db.select().from(s.clients).where(eq(s.clients.id, m.clientId));
    if (!c.email) return { ok: false, error: "Add the client's email first." };
    if (!content.fees.length) return { ok: false, error: "Add the professional fee (and the visa charge) on the matter first, so the agreement has a fee estimate." };
    // Only one open agreement per matter.
    await db.update(s.serviceAgreements).set({ status: "void" }).where(and(eq(s.serviceAgreements.agencyId, ctx.agencyId), eq(s.serviceAgreements.matterId, matterId), inArray(s.serviceAgreements.status, ["sent", "viewed"])));
    const [row] = await db
      .insert(s.serviceAgreements)
      .values({ agencyId: ctx.agencyId, matterId, clientId: c.id, content, contentHash: hashContent(content), sentBy: ctx.userId, sentByName: ctx.name })
      .returning({ id: s.serviceAgreements.id });
    await db.update(s.clients).set({ portalEnabled: true }).where(eq(s.clients.id, c.id));
    // The link signs them in and opens the agreement; valid for 3 days, once.
    const url = await createMagicLink(c.id, ctx.agencyId, ctx.userId, `/client/agreements/${row.id}`, 72 * 60);
    const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared")));
    let emailed = false;
    if (box && mailEnabled() && !c.email.endsWith(".test")) {
      await sendMail({
        agencyId: ctx.agencyId,
        from: { address: box.address, name: ctx.agencyName },
        to: [c.email],
        subject: `Please sign your service agreement (${content.matter.reference})`,
        html: `<p>Hi ${c.firstName},</p><p>Your service agreement for the ${content.matter.visa} application is ready. It sets out what we'll do, the fee estimate and your rights. Please read it and sign on your phone or computer.</p>
<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Read and sign</a></p>
<p style="color:#71717a;font-size:13px">This button signs you in to your client portal and works once in the next 3 days. After that, sign in to the portal with your email to find the agreement.</p>`,
        clientId: c.id,
        matterId,
        footer: `Sent by ${ctx.agencyName} via Lodgely`,
      });
      emailed = true;
    }
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: c.id, matterId, kind: "document", title: emailed ? "Service agreement sent to sign" : "Service agreement ready to sign in the portal", actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "service_agreement", entityId: row.id, detail: { matterId } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: emailed ? "emailed" : "portal" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: withdraw an agreement that hasn't been signed. */
export async function voidAgreement(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [a] = await db.update(s.serviceAgreements).set({ status: "void" }).where(and(eq(s.serviceAgreements.agencyId, ctx.agencyId), eq(s.serviceAgreements.id, id), inArray(s.serviceAgreements.status, ["sent", "viewed"]))).returning();
    if (a) await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: a.clientId, matterId: a.matterId, kind: "document", title: "Service agreement withdrawn", actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Admin: the agency's own agreement wording (blank restores Lodgely's template). */
export async function saveAgreementTerms(text: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const clean = text.trim();
    await db.update(s.agencyProfile).set({ agreementTerms: !clean || clean === DEFAULT_TERMS.trim() ? null : clean.slice(0, 40000) }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agreement_terms", entityId: ctx.agencyId });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/** Client: sign in the portal. Stores the signature, makes the signed PDF and marks the matter signed. */
export async function signAgreement(id: string, input: { name: string; signature: string; guide: boolean; agree: boolean }): Promise<ActionResult> {
  try {
    const c = await clientSession();
    if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
    const [a] = await db.select().from(s.serviceAgreements).where(and(eq(s.serviceAgreements.id, id), eq(s.serviceAgreements.clientId, c.client.id)));
    if (!a) return { ok: false, error: "Agreement not found." };
    if (a.status === "signed") return { ok: true };
    if (a.status === "void") return { ok: false, error: "This agreement was withdrawn. Your agent will send a new one." };
    if (!input.agree || !input.guide) return { ok: false, error: "Tick both boxes to sign." };
    const name = input.name.trim().replace(/\s+/g, " ");
    if (name.length < 3 || !norm(name).includes(norm(c.client.lastName))) return { ok: false, error: `Type your full name as it appears on your passport (${c.client.firstName} ${c.client.lastName}).` };
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.signature) || input.signature.length > 400_000) return { ok: false, error: "Draw your signature in the box." };
    if (hashContent(a.content) !== a.contentHash) return { ok: false, error: "This agreement couldn't be verified. Ask your agent to send it again." };
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim() || null;
    const agent = h.get("user-agent")?.slice(0, 300) ?? null;
    const signedAt = new Date();
    const pdf = await agreementPdf(a.content, { id: a.id, contentHash: a.contentHash, sentByName: a.sentByName, sentAt: a.createdAt, viewedAt: a.viewedAt, signedAt, signerName: name, signerEmail: c.client.email, signerIp: ip, signerAgent: agent, guideAcknowledged: input.guide, signaturePng: input.signature }, await agencyLogo(a.agencyId));
    const fileName = `Service agreement ${a.content.matter.reference} (signed).pdf`;
    const blob = await putFile(`agency/${a.agencyId}/client/${a.clientId}/agreements/${fileName}`, Buffer.from(pdf), "application/pdf").catch((e) => {
      console.error("agreement pdf store", e);
      throw new Error("We couldn't save your signed copy just now. Please try again in a minute.");
    });
    const [doc] = await db
      .insert(s.documents)
      .values({ agencyId: a.agencyId, clientId: a.clientId, matterId: a.matterId, name: fileName, category: "Agreement", mimeType: "application/pdf", sizeBytes: pdf.byteLength, storageKey: blob.pathname, uploadedBy: name, source: "portal" })
      .returning({ id: s.documents.id });
    const updated = await db
      .update(s.serviceAgreements)
      .set({ status: "signed", signedAt, signerName: name, signerEmail: c.client.email, signerIp: ip, signerAgent: agent, signature: input.signature, guideAcknowledged: input.guide, documentId: doc.id })
      .where(and(eq(s.serviceAgreements.id, id), inArray(s.serviceAgreements.status, ["sent", "viewed"])))
      .returning({ id: s.serviceAgreements.id });
    if (!updated.length) return { ok: true }; // signed twice at once: the first one counts
    const today = signedAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const [m] = await db.select({ guide: s.matters.consumerGuideAt, assignedTo: s.matters.assignedTo }).from(s.matters).where(eq(s.matters.id, a.matterId));
    await db.update(s.matters).set({ agreementSignedAt: today, ...(m?.guide ? {} : { consumerGuideAt: today }) }).where(eq(s.matters.id, a.matterId));
    await db.insert(s.activities).values({ agencyId: a.agencyId, clientId: a.clientId, matterId: a.matterId, kind: "document", title: "Service agreement signed", body: `${name} signed in the client portal.`, actorName: name });
    await db.insert(s.auditLog).values({ agencyId: a.agencyId, actorId: null, actorName: name, action: "sign", entity: "service_agreement", entityId: a.id, detail: { ip } });
    const tell = [...new Set([a.sentBy, m?.assignedTo].filter((x): x is string => Boolean(x)))];
    const emails = (await Promise.all(tell.map((u) => memberCtx(a.agencyId, u)))).filter(Boolean).map((x) => x!.email);
    await notifyStaff(emails, `Signed: service agreement for ${a.content.client.name}`, { heading: `${a.content.client.name} signed the service agreement`, lines: [`${a.content.matter.visa} · ${a.content.matter.reference}.`, "The signed PDF is in the client's documents and the matter is marked signed."], cta: { label: "Open the matter", path: `/app/matters/${a.matterId}` } });
    updateTag(agencyTag(a.agencyId));
    return { ok: true, id: doc.id };
  } catch (e) {
    return fail(e);
  }
}
