"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { clientSession, createMagicLink, endClientSession } from "@/lib/client-auth";
import { agencyTag } from "@/lib/data";
import { mailEnabled, sendMail } from "@/lib/mail";
import { requireRole } from "@/lib/session";

const sharedBox = async (agencyId: string) => {
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, agencyId), eq(s.mailboxes.kind, "shared")));
  return box ?? null;
};

async function mailLink(client: { id: string; agencyId: string; firstName: string; email: string | null }, url: string, intro: string) {
  const box = await sharedBox(client.agencyId);
  const [org] = await db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, client.agencyId));
  if (!box || !client.email || !mailEnabled() || client.email.endsWith(".test")) return false;
  await sendMail({
    agencyId: client.agencyId,
    from: { address: box.address, name: org?.name ?? box.name },
    to: [client.email],
    subject: `Your ${org?.name ?? "client"} portal`,
    html: `<p>Hi ${client.firstName},</p><p>${intro}</p>
<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Open my portal</a></p>
<p style="color:#71717a;font-size:13px">This button signs you in and works once, for the next hour. If you didn't ask for it, you can ignore this email.</p>`,
    footer: `Sent by ${org?.name ?? "your agent"} via Lodgely`,
  });
  return true;
}

/** Client sign-in: emails a link to every agency portal this address has. Never says whether it exists. */
export async function requestClientLink(email: string): Promise<ActionResult> {
  const e = email.trim().toLowerCase();
  if (!z.string().email().safeParse(e).success) return { ok: false, error: "Enter a valid email." };
  const rows = await db.select().from(s.clients).where(and(sql`lower(${s.clients.email}) = ${e}`, eq(s.clients.portalEnabled, true)));
  for (const c of rows.slice(0, 5)) {
    const url = await createMagicLink(c.id, c.agencyId);
    await mailLink(c, url, "Here's your secure link to see your case, upload documents and pay invoices.");
  }
  return { ok: true };
}

/** Staff: turn on a client's portal and email them a sign-in link. */
export async function inviteClientToPortal(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    if (!c.email) return { ok: false, error: "Add the client's email first." };
    await db.update(s.clients).set({ portalEnabled: true }).where(eq(s.clients.id, c.id));
    const url = await createMagicLink(c.id, c.agencyId);
    const sent = await mailLink(c, url, `${ctx.name} has set up your client portal. Track your application, upload documents, see invoices and message us in one place.`);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: sent ? "Invited to the client portal" : "Client portal turned on", actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: sent ? "sent" : "enabled" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Staff: a one-time link to see the portal exactly as the client does. */
export async function viewAsClient(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    return { ok: true, id: await createMagicLink(c.id, ctx.agencyId, ctx.userId) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function clientSignOut() {
  await endClientSession();
}

const file = z.object({ name: z.string().max(200), size: z.number().max(25 * 1024 * 1024), type: z.string(), key: z.string() });

/** After a client's upload finishes: file it on their case and tick the checklist item. */
export async function clientAttach(matterId: string | null, itemId: string | null, input: z.infer<typeof file>): Promise<ActionResult> {
  const c = await clientSession();
  if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
  const f = file.parse(input);
  const { agencyId, id: clientId } = c.client;
  if (!f.key.startsWith(`agency/${agencyId}/client/${clientId}/`)) return { ok: false, error: "Upload not found." };
  let item: typeof s.checklistItems.$inferSelect | undefined;
  if (matterId) {
    const [m] = await db.select({ id: s.matters.id }).from(s.matters).where(and(eq(s.matters.id, matterId), eq(s.matters.clientId, clientId)));
    if (!m) return { ok: false, error: "That case isn't yours." };
    if (itemId) {
      [item] = await db.select().from(s.checklistItems).where(and(eq(s.checklistItems.id, itemId), eq(s.checklistItems.matterId, matterId)));
      if (!item) return { ok: false, error: "That document isn't on your checklist." };
    }
  }
  const who = `${c.client.firstName} ${c.client.lastName}`;
  await db.insert(s.documents).values({ agencyId, clientId, matterId, checklistItemId: item?.id ?? null, name: f.name, category: item?.category ?? "Client upload", mimeType: f.type, sizeBytes: f.size, storageKey: f.key, uploadedBy: who, source: "portal" });
  if (item && ["needed", "requested", "rejected"].includes(item.status)) await db.update(s.checklistItems).set({ status: "received" }).where(eq(s.checklistItems.id, item.id));
  await db.insert(s.activities).values({ agencyId, clientId, matterId, kind: "document", title: `Uploaded ${item ? item.label : f.name}`, body: f.name, actorName: who });
  updateTag(agencyTag(agencyId));
  return { ok: true };
}

/** A message from the client lands in the agency's shared inbox, linked to them (and the case). */
export async function clientMessage(f: FormData): Promise<ActionResult> {
  const c = await clientSession();
  if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
  const body = String(f.get("body") ?? "").trim();
  if (!body) return { ok: false, error: "Write a message first." };
  const subject = String(f.get("subject") ?? "").trim() || "Message from the client portal";
  const matterId = String(f.get("matterId") ?? "") || null;
  const { agencyId, id: clientId } = c.client;
  if (matterId) {
    const [m] = await db.select({ id: s.matters.id }).from(s.matters).where(and(eq(s.matters.id, matterId), eq(s.matters.clientId, clientId)));
    if (!m) return { ok: false, error: "That case isn't yours." };
  }
  const box = await sharedBox(agencyId);
  const who = `${c.client.firstName} ${c.client.lastName}`;
  const esc = body.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
  await db.insert(s.messages).values({
    agencyId,
    threadKey: crypto.randomUUID(),
    folder: "inbox",
    mailbox: box?.address ?? "portal",
    fromAddress: c.client.email ?? "portal",
    fromName: who,
    toAddresses: [box?.address ?? "portal"],
    subject,
    bodyText: body,
    bodyHtml: `<p>${esc.replace(/\n/g, "<br>")}</p>`,
    clientId,
    matterId,
    status: "portal",
  });
  await db.insert(s.activities).values({ agencyId, clientId, matterId, kind: "email", title: `Message: ${subject}`, body: body.slice(0, 280), actorName: who });
  updateTag(agencyTag(agencyId));
  return { ok: true };
}

/** Clients keep their own contact details current. */
export async function clientUpdateDetails(f: FormData): Promise<ActionResult> {
  const c = await clientSession();
  if (!c) return { ok: false, error: "Your session has ended. Sign in again." };
  const v = (k: string) => String(f.get(k) ?? "").trim() || null;
  await db.update(s.clients).set({ phone: v("phone"), address: v("address"), city: v("city"), state: v("state") }).where(eq(s.clients.id, c.client.id));
  await db.insert(s.activities).values({ agencyId: c.client.agencyId, clientId: c.client.id, kind: "system", title: "Client updated their contact details in the portal", actorName: `${c.client.firstName} ${c.client.lastName}` });
  updateTag(agencyTag(c.client.agencyId));
  return { ok: true };
}
