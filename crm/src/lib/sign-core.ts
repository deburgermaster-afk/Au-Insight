import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { SignEvent, SignField, SignSigner } from "@/db/crm-schema";
import { appUrl, createMagicLink } from "@/lib/client-auth";
import { fileBytes, putFile, safeName } from "@/lib/files";
import { mailEnabled, sendMail } from "@/lib/mail";
import { notifyStaff } from "@/lib/notify";
import { memberCtx } from "@/lib/session";
import { sha256, stampSignedPdf } from "@/lib/sign-pdf";

// Signing shared by the client portal, emailed links for other signers, the agent's countersign,
// reminders and the cron: who signs what, recording one signer's part, and finishing the request
// (stamped PDF, documents, timeline, notifications) once everyone has signed.

export type SignRequest = typeof s.signRequests.$inferSelect;

export const ev = (kind: SignEvent["kind"], by: string | null, detail?: string): SignEvent => ({ at: new Date().toISOString(), kind, by, ...(detail ? { detail } : {}) });
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");
const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** Signers of a request; requests made before multi-signer support are client-only. */
export function signersOf(r: Pick<SignRequest, "signers">, clientName = "Client"): SignSigner[] {
  return r.signers?.length ? r.signers : [{ id: "client", role: "client", label: "Client", name: clientName, email: null, status: "pending" }];
}
export const fieldSigner = (f: SignField) => f.signer ?? "client";
export const fieldsFor = (r: Pick<SignRequest, "fields">, signerId: string) => r.fields.filter((f) => fieldSigner(f) === signerId);
export const pendingSigners = (r: Pick<SignRequest, "signers">) => signersOf(r).filter((x) => x.status !== "signed");

async function sharedBox(agencyId: string) {
  if (!mailEnabled()) return null;
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, agencyId), eq(s.mailboxes.kind, "shared")));
  return box ?? null;
}

const button = (url: string, label: string) => `<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">${label}</a></p>`;

/** Emails the client a one-time portal sign-in link straight to the document. */
export async function emailClient(r: SignRequest, opts: { agencyName: string; byUserId?: string | null; reminder?: "due-soon" | "overdue" | "nudge" | null }) {
  const [c] = await db.select().from(s.clients).where(eq(s.clients.id, r.clientId));
  if (!c?.email || c.email.endsWith(".test")) return false;
  const box = await sharedBox(r.agencyId);
  if (!box) return false;
  const url = await createMagicLink(c.id, r.agencyId, opts.byUserId ?? undefined, `/client/signatures/${r.id}`, 72 * 60);
  const lead = opts.reminder === "overdue" ? `<b>${esc(r.title)}</b> was due on ${esc(r.dueAt ?? "")} and still needs your signature.` : opts.reminder === "due-soon" ? `A reminder that <b>${esc(r.title)}</b> needs your signature by ${esc(r.dueAt ?? "")}.` : opts.reminder === "nudge" ? `A reminder that <b>${esc(r.title)}</b> is still waiting for your signature.` : `${esc(opts.agencyName)} has sent you <b>${esc(r.title)}</b> to sign${r.dueAt ? ` by ${esc(r.dueAt)}` : ""}.`;
  await sendMail({
    agencyId: r.agencyId,
    from: { address: box.address, name: opts.agencyName },
    to: [c.email],
    subject: opts.reminder ? `Reminder: please sign ${r.title}` : `Please sign: ${r.title}`,
    html: `<p>Hi ${esc(c.firstName)},</p><p>${lead}</p>${!opts.reminder && r.message ? `<p style="white-space:pre-line">${esc(r.message)}</p>` : ""}
<p>We'll guide you to each place to sign, one at a time. It takes about a minute on your phone.</p>${button(url, "Review and sign")}
<p style="color:#71717a;font-size:13px">This button signs you in to your client portal and works once in the next 3 days. After that, sign in to the portal with your email.</p>`,
    clientId: c.id,
    matterId: r.matterId ?? undefined,
    footer: `Sent by ${opts.agencyName} via Lodgely`,
  });
  return true;
}

/** Emails another signer (sponsor, second parent…) their own link. Returns false when mail isn't set up. */
export async function emailOther(r: SignRequest, signer: SignSigner, token: string, opts: { agencyName: string; clientName: string; reminder?: boolean }) {
  if (!signer.email || signer.email.endsWith(".test")) return false;
  const box = await sharedBox(r.agencyId);
  if (!box) return false;
  await sendMail({
    agencyId: r.agencyId,
    from: { address: box.address, name: opts.agencyName },
    to: [signer.email],
    subject: opts.reminder ? `Reminder: please sign ${r.title}` : `Please sign: ${r.title}`,
    html: `<p>Hi ${esc(signer.name.split(" ")[0] ?? signer.name)},</p><p>${esc(opts.agencyName)} is preparing ${esc(opts.clientName)}'s immigration matter and needs you to sign <b>${esc(r.title)}</b> as ${esc(signer.label.toLowerCase())}${r.dueAt ? ` by ${esc(r.dueAt)}` : ""}.</p>
<p>We'll guide you to each place to sign. No account is needed.</p>${button(`${appUrl()}/sign/${token}`, "Review and sign")}
<p style="color:#71717a;font-size:13px">This link is personal to you. Don't forward it.</p>`,
    clientId: r.clientId,
    matterId: r.matterId ?? undefined,
    footer: `Sent by ${opts.agencyName} via Lodgely`,
  });
  return true;
}

const norm = (v: string) => v.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Records one signer's part: checks their fields, stores the values and who/when/where, and finishes
 * the request when they were the last to sign. Returns an error message, or null when done.
 */
export async function recordSignature(r: SignRequest, signerId: string, input: { name: string; values: { id: string; value: string }[]; agree: boolean; expectLastName?: string | null }, meta: { ip: string | null; agent: string | null; email: string | null }): Promise<{ error: string } | { done: boolean; documentId?: string }> {
  if (r.status === "signed") return { done: true };
  if (r.status === "void") return { error: "This request was withdrawn." };
  if (r.status === "draft") return { error: "Document not found." };
  const signers = signersOf(r);
  const me = signers.find((x) => x.id === signerId);
  if (!me) return { error: "You're not a signer on this document." };
  if (me.status === "signed") return { done: false };
  if (!input.agree) return { error: "Tick the box to agree to sign electronically." };
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3 || (input.expectLastName && !norm(name).includes(norm(input.expectLastName)))) return { error: `Type your full name${input.expectLastName ? " as it appears on your ID" : ""}.` };
  const given = new Map(input.values.filter((v) => typeof v.value === "string").map((v) => [v.id, v.value]));
  const mine: { id: string; value: string }[] = [];
  for (const f of fieldsFor(r, signerId)) {
    const v = (given.get(f.id) ?? "").trim();
    if (f.type === "signature" || f.type === "initials") {
      if (v && (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(v) || v.length > 400_000)) return { error: `Sign again in "${f.label}".` };
    } else if (v.length > 300) return { error: `"${f.label}" is too long.` };
    if (f.required && (!v || (f.type === "checkbox" && v !== "yes"))) return { error: `Complete "${f.label}" (page ${f.page}).` };
    if (v) mine.push({ id: f.id, value: f.type === "checkbox" ? (v === "yes" ? "yes" : "") : v });
  }
  const now = new Date().toISOString();
  const nextSigners = signers.map((x) => (x.id === signerId ? { ...x, status: "signed" as const, signedAt: now, signedName: name, ip: meta.ip, agent: meta.agent, email: x.email ?? meta.email } : x));
  const values = [...(r.values ?? []).filter((v) => !mine.some((m) => m.id === v.id)), ...mine];
  // Only move forward if nobody else signed as this signer in the meantime.
  const updated = await db
    .update(s.signRequests)
    .set({ signers: nextSigners, values, status: "viewed", events: sql`${s.signRequests.events} || ${JSON.stringify([ev("signed", `${name} (${me.label})`, meta.ip ?? undefined)])}::jsonb` })
    .where(and(eq(s.signRequests.id, r.id), inArray(s.signRequests.status, ["sent", "viewed"]), sql`not (${s.signRequests.signers} @> ${JSON.stringify([{ id: signerId, status: "signed" }])}::jsonb)`))
    .returning();
  if (!updated.length) return { done: false };
  const fresh = updated[0];
  const left = pendingSigners(fresh);
  await db.insert(s.activities).values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "document", title: `${me.label} signed: ${r.title}`, body: left.length ? `${name} signed. Waiting for ${left.map((x) => `${x.label} (${x.name})`).join(", ")}.` : `${name} signed.`, actorName: name });
  if (left.length) return { done: false };
  const documentId = await finalize(fresh);
  return { done: true, documentId };
}

/** Everyone has signed: stamp the PDF, file it, mark the request signed and tell the agent. */
async function finalize(r: SignRequest) {
  const source = await fileBytes(r.sourceKey);
  if (sha256(source) !== r.sourceHash) throw new Error("This document couldn't be verified. Ask your agent to send it again.");
  const [[c], [org]] = await Promise.all([db.select().from(s.clients).where(eq(s.clients.id, r.clientId)), db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, r.agencyId))]);
  const signers = signersOf(r);
  const client = signers.find((x) => x.role === "client") ?? signers[0];
  const signedAt = new Date();
  const pdf = await stampSignedPdf(new Uint8Array(source), r.fields, r.values ?? [], {
    id: r.id,
    title: r.title,
    agency: org?.name ?? "",
    clientName: `${c.firstName} ${c.lastName}`,
    sourceHash: r.sourceHash,
    sentByName: r.sentByName,
    sentAt: r.createdAt,
    viewedAt: r.viewedAt,
    signedAt,
    signerName: client.signedName ?? client.name,
    signerEmail: client.email ?? c.email,
    signerIp: client.ip ?? null,
    signerAgent: client.agent ?? null,
    signers,
  });
  const fileName = `${r.title} (signed).pdf`;
  const blob = await putFile(`agency/${r.agencyId}/client/${r.clientId}/signed/${safeName(fileName)}`, Buffer.from(pdf), "application/pdf");
  const [doc] = await db
    .insert(s.documents)
    .values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, name: fileName, category: "Signed", mimeType: "application/pdf", sizeBytes: pdf.byteLength, storageKey: blob.pathname, uploadedBy: client.signedName ?? client.name, source: "portal" })
    .returning({ id: s.documents.id });
  await db.update(s.signRequests).set({ status: "signed", signedAt, signerName: client.signedName ?? client.name, signerEmail: client.email ?? c.email, signerIp: client.ip ?? null, signerAgent: client.agent ?? null, documentId: doc.id }).where(eq(s.signRequests.id, r.id));
  // Templates that satisfy Code of Conduct steps update the matter.
  const keys = [r.templateKey, ...(r.bundle ?? [])].filter(Boolean);
  if (r.matterId && keys.includes("consumer-guide")) {
    const today = signedAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    await db.update(s.matters).set({ consumerGuideAt: today }).where(and(eq(s.matters.id, r.matterId), sql`${s.matters.consumerGuideAt} is null`));
  }
  await db.insert(s.activities).values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "document", title: `Signed by everyone: ${r.title}`, body: `${signers.map((x) => `${x.label}: ${x.signedName ?? x.name}`).join(" · ")}. The signed PDF is in the client's documents.`, actorName: client.signedName ?? client.name });
  await db.insert(s.auditLog).values({ agencyId: r.agencyId, actorId: null, actorName: client.signedName ?? client.name, action: "sign", entity: "sign_request", entityId: r.id, detail: { signers: signers.map((x) => ({ label: x.label, ip: x.ip })) } });
  const [m] = r.matterId ? await db.select({ assignedTo: s.matters.assignedTo }).from(s.matters).where(eq(s.matters.id, r.matterId)) : [];
  const tell = [...new Set([r.sentBy, m?.assignedTo].filter((x): x is string => Boolean(x)))];
  const emails = (await Promise.all(tell.map((u) => memberCtx(r.agencyId, u)))).filter(Boolean).map((x) => x!.email);
  await notifyStaff(emails, `Signed: ${r.title} (${c.firstName} ${c.lastName})`, { heading: `${r.title} is signed`, lines: [`Signed by ${signers.map((x) => x.signedName ?? x.name).join(", ")}.`, "The signed PDF, with its signing record, is in the client's documents."], cta: { label: "Open e-sign", path: `/app/sign/${r.id}` } });
  return doc.id;
}
