"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { sendMail } from "@/lib/mail";
import { canAtLeast, requireCap } from "@/lib/session";
import { cleanFilters, type SegmentFilters } from "@/lib/segments";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const ids = z.array(z.string().min(1)).min(1, "Select at least one client.").max(2000);

const filtersSchema = z.object({
  q: z.string().max(120).optional(),
  stages: z.array(z.string().max(40)).max(10).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  tagMode: z.enum(["any", "all"]).optional(),
  visas: z.array(z.string().max(20)).max(40).optional(),
  sources: z.array(z.string().max(60)).max(30).optional(),
  nationalities: z.array(z.string().max(60)).max(40).optional(),
  location: z.enum(["onshore", "offshore"]).optional(),
  expiryDays: z.number().int().min(0).max(3650).optional(),
  assignedTo: z.array(z.string().max(80)).max(40).optional(),
});

export async function saveSegment(input: { id?: string | null; name: string; filters: SegmentFilters }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const name = z.string().trim().min(1, "Name the segment.").max(60).parse(input.name);
    const filters = cleanFilters(filtersSchema.parse(input.filters) as SegmentFilters);
    if (input.id) {
      const [row] = await db
        .update(s.clientSegments)
        .set({ name, filters, updatedAt: new Date() })
        .where(and(eq(s.clientSegments.agencyId, ctx.agencyId), eq(s.clientSegments.id, input.id)))
        .returning({ id: s.clientSegments.id });
      if (!row) return { ok: false, error: "Segment not found." };
      updateTag(agencyTag(ctx.agencyId));
      return { ok: true, id: row.id };
    }
    const [row] = await db.insert(s.clientSegments).values({ agencyId: ctx.agencyId, name, filters, createdBy: ctx.userId, createdByName: ctx.name }).returning({ id: s.clientSegments.id });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "segment", entityId: row.id, detail: { name } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the segment." };
    return fail(e);
  }
}

export async function deleteSegment(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [row] = await db.delete(s.clientSegments).where(and(eq(s.clientSegments.agencyId, ctx.agencyId), eq(s.clientSegments.id, id))).returning({ name: s.clientSegments.name });
    if (!row) return { ok: false, error: "Segment not found." };
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "segment", entityId: id, detail: { name: row.name } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Adds or removes a tag on many clients at once. */
export async function bulkTag(clientIds: string[], tag: string, mode: "add" | "remove"): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const list = ids.parse(clientIds);
    const t = z.string().trim().min(1, "Enter a tag.").max(60).parse(tag);
    const where = and(eq(s.clients.agencyId, ctx.agencyId), inArray(s.clients.id, list));
    const rows =
      mode === "add"
        ? await db
            .update(s.clients)
            .set({ tags: sql`(select array(select distinct unnest(${s.clients.tags} || array[${t}]::text[])))`, updatedAt: new Date() })
            .where(and(where, sql`not (${t} = any(${s.clients.tags}))`))
            .returning({ id: s.clients.id })
        : await db
            .update(s.clients)
            .set({ tags: sql`array_remove(${s.clients.tags}, ${t})`, updatedAt: new Date() })
            .where(and(where, sql`${t} = any(${s.clients.tags})`))
            .returning({ id: s.clients.id });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "client_tags", detail: { tag: t, mode, clients: rows.length } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: String(rows.length) };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the tag." };
    return fail(e);
  }
}

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Emails each selected client separately (never one email with everyone on it), so addresses stay
 * private. {firstName}, {lastName} and {name} in the subject or message are filled in per client.
 */
export async function emailClients(input: { clientIds: string[]; fromId: string; subject: string; message: string }): Promise<ActionResult & { sent?: number; skipped?: number }> {
  try {
    const ctx = await requireCap("clients");
    if (!canAtLeast(ctx.role, "staff")) return { ok: false, error: "Your role can't send email." };
    const list = ids.max(300, "Send to 300 clients or fewer at a time.").parse(input.clientIds);
    const subject = z.string().trim().min(1, "Add a subject.").max(200).parse(input.subject);
    const message = z.string().trim().min(1, "Write a message.").max(20000).parse(input.message);
    const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.id, input.fromId), eq(s.mailboxes.agencyId, ctx.agencyId)));
    if (!box) return { ok: false, error: "Choose a mailbox to send from." };
    if (box.kind === "personal" && box.userId !== ctx.userId && !canAtLeast(ctx.role, "admin")) return { ok: false, error: "You can't send from someone else's mailbox." };
    const clients = await db
      .select({ id: s.clients.id, firstName: s.clients.firstName, lastName: s.clients.lastName, email: s.clients.email })
      .from(s.clients)
      .where(and(eq(s.clients.agencyId, ctx.agencyId), inArray(s.clients.id, list)));
    let sent = 0;
    let skipped = 0;
    for (const c of clients) {
      if (!c.email || !z.string().email().safeParse(c.email).success) {
        skipped++;
        continue;
      }
      const fill = (t: string) => t.replaceAll("{firstName}", c.firstName).replaceAll("{lastName}", c.lastName).replaceAll("{name}", `${c.firstName} ${c.lastName}`);
      const html = fill(esc(message))
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      const r = await sendMail({
        agencyId: ctx.agencyId,
        from: { address: box.address, name: box.kind === "shared" ? ctx.agencyName : box.name },
        to: [c.email],
        subject: fill(subject),
        html,
        clientId: c.id,
        footer: `Sent by ${ctx.agencyName} with Lodgely`,
      });
      if (r.sent) sent++;
      else skipped++;
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: c.id, kind: "email", title: `Email sent: ${fill(subject)}`, actorId: ctx.userId, actorName: ctx.name });
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "bulk_email", detail: { subject, sent, skipped } });
    updateTag(agencyTag(ctx.agencyId));
    if (!sent && skipped) return { ok: false, error: clients.some((c) => c.email) ? "Nothing was sent: connect a mail domain in Settings." : "None of these clients has an email address." };
    return { ok: true, sent, skipped };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the email." };
    return fail(e);
  }
}
