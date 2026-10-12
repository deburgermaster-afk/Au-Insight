"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { MailAttachment } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { emailShell, ensureMailboxes, mailEnabled, sendMail } from "@/lib/mail";
import { actionCtx, canAtLeast, requireRole } from "@/lib/session";
import { visaByCode } from "@/lib/visas";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const emails = z.array(z.string().trim().email("One of the addresses isn't valid"));
const split = (v?: string | null) => (v ?? "").split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
const attachment = z.object({ name: z.string(), size: z.number(), type: z.string(), key: z.string() });

/** The mailboxes the signed-in user may send from: their own, shared ones, and (admins) all. */
export async function myMailboxes() {
  const ctx = await actionCtx();
  const boxes = await ensureMailboxes(ctx);
  const admin = canAtLeast(ctx.role, "admin");
  return {
    agencyId: ctx.agencyId,
    enabled: mailEnabled(),
    boxes: boxes
      .filter((b) => admin || b.kind === "shared" || b.userId === ctx.userId)
      .sort((a, b) => Number(b.userId === ctx.userId) - Number(a.userId === ctx.userId))
      .map((b) => ({ id: b.id, address: b.address, name: b.name, kind: b.kind, mine: b.userId === ctx.userId, signature: b.signature })),
  };
}

export async function composeMail(input: {
  fromId: string;
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments: MailAttachment[];
  inReplyTo?: string | null;
  threadKey?: string | null;
  clientId?: string | null;
  matterId?: string | null;
}): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.id, input.fromId), eq(s.mailboxes.agencyId, ctx.agencyId)));
    if (!box) return { ok: false, error: "Choose a mailbox to send from." };
    if (box.kind === "personal" && box.userId !== ctx.userId && !canAtLeast(ctx.role, "admin")) return { ok: false, error: "You can't send from someone else's mailbox." };
    const to = emails.parse(split(input.to));
    if (!to.length) return { ok: false, error: "Add a recipient." };
    const cc = emails.parse(split(input.cc));
    const bcc = emails.parse(split(input.bcc));
    const files = z.array(attachment).parse(input.attachments);
    if (files.some((f) => !f.key.startsWith(`agency/${ctx.agencyId}/`))) return { ok: false, error: "Attachment not found." };
    if (files.reduce((a, f) => a + f.size, 0) > 35 * 1024 * 1024) return { ok: false, error: "Attachments are over the 35 MB limit." };
    // File the message to the client it's addressed to, if they're on record.
    let clientId = input.clientId ?? null;
    if (!clientId) {
      const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), inArray(s.clients.email, to)));
      clientId = c?.id ?? null;
    }
    const subject = input.subject.trim() || "(no subject)";
    const r = await sendMail({
      agencyId: ctx.agencyId,
      from: { address: box.address, name: box.kind === "shared" ? ctx.agencyName : box.name },
      to,
      cc,
      bcc,
      subject,
      html: input.html,
      attachments: files,
      inReplyTo: input.inReplyTo,
      threadKey: input.threadKey ?? undefined,
      clientId,
      matterId: input.matterId,
      footer: `Sent by ${ctx.agencyName} with Lodgely`,
    });
    if (clientId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, matterId: input.matterId ?? null, kind: "email", title: `Email sent: ${subject}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return r.sent ? { ok: true, id: r.id } : { ok: false, error: "Saved to Sent, but sending is off: connect a mail domain in Settings." };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the addresses." };
    return fail(e);
  }
}

/** Records uploaded files (already in Blob storage) as client documents. */
export async function registerDocuments(
  files: MailAttachment[],
  link: { clientId?: string | null; matterId?: string | null; checklistItemId?: string | null; category?: string | null; source?: string; folderId?: string | null },
): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const list = z.array(attachment).parse(files);
    if (list.some((f) => !f.key.startsWith(`agency/${ctx.agencyId}/`))) return { ok: false, error: "File not found." };
    if (!list.length) return { ok: true };
    await db.insert(s.documents).values(
      list.map((f) => ({
        agencyId: ctx.agencyId,
        clientId: link.clientId ?? null,
        matterId: link.matterId ?? null,
        checklistItemId: link.checklistItemId ?? null,
        folderId: link.folderId ?? null,
        name: f.name,
        category: link.category ?? null,
        mimeType: f.type,
        sizeBytes: f.size,
        storageKey: f.key,
        uploadedBy: ctx.name,
        source: link.source ?? "upload",
      })),
    );
    if (link.checklistItemId) {
      await db.update(s.checklistItems).set({ status: "received" }).where(and(eq(s.checklistItems.agencyId, ctx.agencyId), eq(s.checklistItems.id, link.checklistItemId)));
    }
    if (link.clientId) {
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: link.clientId, matterId: link.matterId ?? null, kind: "document", title: `${list.length} document${list.length > 1 ? "s" : ""} added`, body: list.map((f) => f.name).join("\n"), actorId: ctx.userId, actorName: ctx.name });
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Emails the client a document checklist with a private upload link, and marks the items requested. */
export async function sendChecklist(input: { matterId: string; itemIds: string[]; note?: string; dueAt?: string | null; fromId?: string | null; days?: number }): Promise<ActionResult & { link?: string }> {
  try {
    const ctx = await requireRole("staff");
    const [row] = await db
      .select({ matter: s.matters, client: s.clients })
      .from(s.matters)
      .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, input.matterId)));
    if (!row) return { ok: false, error: "Matter not found." };
    if (!row.client.email) return { ok: false, error: `Add an email address for ${row.client.firstName} first.` };
    const items = await db
      .select()
      .from(s.checklistItems)
      .where(and(eq(s.checklistItems.matterId, input.matterId), inArray(s.checklistItems.id, input.itemIds.length ? input.itemIds : ["-"])));
    if (!items.length) return { ok: false, error: "Choose at least one document." };

    const token = randomBytes(24).toString("base64url");
    const days = input.days ?? 30;
    await db.insert(s.portalLinks).values({
      agencyId: ctx.agencyId,
      token,
      matterId: row.matter.id,
      clientId: row.client.id,
      note: input.note ?? null,
      itemIds: items.map((i) => i.id),
      dueAt: input.dueAt || null,
      expiresAt: new Date(Date.now() + days * 864e5),
      createdBy: ctx.name,
    });
    await db.update(s.checklistItems).set({ status: "requested" }).where(and(inArray(s.checklistItems.id, items.map((i) => i.id)), inArray(s.checklistItems.status, ["needed", "rejected"])));

    const base = process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";
    const url = `${base}/portal/${token}`;
    const visa = visaByCode(row.matter.visaCode);
    const groups = new Map<string, typeof items>();
    for (const i of items) groups.set(i.category, [...(groups.get(i.category) ?? []), i]);
    const list = [...groups.entries()]
      .map(
        ([cat, rows]) =>
          `<p style="margin:18px 0 6px;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#71717a">${esc(cat)}</p>` +
          rows.map((r) => `<div style="padding:9px 12px;border:1px solid #e4e4e7;border-radius:10px;margin-bottom:6px">☐&nbsp; ${esc(r.label)}${r.required ? "" : ' <span style="color:#a1a1aa">(if applicable)</span>'}</div>`).join(""),
      )
      .join("");
    const html = `<p>Hi ${esc(row.client.firstName)},</p>
<p>To prepare your <strong>${esc(visa?.name ?? row.matter.title)}${visa ? ` (subclass ${esc(visa.code)})` : ""}</strong> application, please send us the documents below${input.dueAt ? ` by <strong>${esc(new Date(input.dueAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }))}</strong>` : ""}.</p>
${input.note ? `<p style="padding:12px 14px;background:#fafafa;border-radius:10px;border:1px solid #f0f0f0">${esc(input.note).replace(/\n/g, "<br>")}</p>` : ""}
${list}
<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Upload your documents</a></p>
<p style="color:#71717a;font-size:13px">The link is private to you and works for ${days} days. Clear scans or photos are fine; PDFs are best for multi-page documents. Reference: ${esc(row.matter.reference)}.</p>
<p>Kind regards,<br>${esc(ctx.name)}<br>${esc(ctx.agencyName)}</p>`;

    const boxes = await ensureMailboxes(ctx);
    const box = boxes.find((b) => b.id === input.fromId) ?? boxes.find((b) => b.userId === ctx.userId) ?? boxes[0];
    if (box) {
      await sendMail({
        agencyId: ctx.agencyId,
        from: { address: box.address, name: box.kind === "shared" ? ctx.agencyName : box.name },
        to: [row.client.email],
        subject: `Documents needed for your ${visa ? `subclass ${visa.code} ` : ""}application (${row.matter.reference})`,
        html,
        clientId: row.client.id,
        matterId: row.matter.id,
        footer: `${ctx.agencyName} · sent with Lodgely`,
      });
    }
    await db.insert(s.activities).values({
      agencyId: ctx.agencyId,
      clientId: row.client.id,
      matterId: row.matter.id,
      kind: "email",
      title: `Document checklist sent (${items.length} items)`,
      body: `Upload link valid for ${days} days`,
      actorId: ctx.userId,
      actorName: ctx.name,
    });
    updateTag(agencyTag(ctx.agencyId));
    void emailShell;
    return { ok: true, link: url };
  } catch (e) {
    return fail(e);
  }
}
