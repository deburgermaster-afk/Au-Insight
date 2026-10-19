"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { dmy, todayIso } from "@/lib/format";
import { runKeyDates } from "@/lib/key-dates";
import { requireCap, requireRole } from "@/lib/session";
import { eventLabel, notifyByFor, SPONSOR_EVENTS } from "@/lib/sponsor-shared";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form.") : e instanceof Error ? e.message : String(e) });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const settings = z.object({
  birthdays: z.enum(["off", "task", "greet"]),
  birthdayMessage: z.string().trim().max(1000),
  anniversaries: z.enum(["off", "task"]),
  sponsor: z.boolean(),
});

export async function saveKeyDates(input: z.input<typeof settings>): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const v = settings.parse(input);
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, keyDates: v }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { keyDates: v, updatedAt: new Date() } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "key_date_settings", detail: { birthdays: v.birthdays, anniversaries: v.anniversaries, sponsor: v.sponsor } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Runs today's checks for this agency now (they also run every morning). */
export async function checkKeyDatesNow(): Promise<ActionResult & { made?: number }> {
  try {
    const ctx = await requireRole("admin");
    const r = await runKeyDates([ctx.agencyId]);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, made: r.birthdays + r.anniversaries + r.sponsor };
  } catch (e) {
    return fail(e);
  }
}

const event = z.object({
  employerId: z.string().min(1),
  kind: z.enum(Object.keys(SPONSOR_EVENTS) as [keyof typeof SPONSOR_EVENTS]),
  clientId: z.string().nullable(),
  occurredOn: isoDate,
  notes: z.string().trim().max(2000).nullable(),
});

/** Records a notifiable change and makes a task to tell Home Affairs within 28 days. */
export async function recordSponsorEvent(input: z.input<typeof event>): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const v = event.parse(input);
    if (v.occurredOn > todayIso()) return { ok: false, error: "The date can't be in the future." };
    if (SPONSOR_EVENTS[v.kind].needsWorker && !v.clientId) return { ok: false, error: "Choose the worker." };
    const [emp] = await db.select({ name: s.employers.name }).from(s.employers).where(and(eq(s.employers.agencyId, ctx.agencyId), eq(s.employers.id, v.employerId)));
    if (!emp) return { ok: false, error: "Employer not found." };
    let worker: string | null = null;
    if (v.clientId) {
      const [c] = await db.select({ first: s.clients.firstName, last: s.clients.lastName }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, v.clientId)));
      if (!c) return { ok: false, error: "Worker not found." };
      worker = `${c.first} ${c.last}`;
    }
    const notifyBy = notifyByFor(v.occurredOn);
    const [task] = await db
      .insert(s.tasks)
      .values({
        agencyId: ctx.agencyId,
        title: `Tell Home Affairs by ${dmy(notifyBy)}: ${emp.name}${worker ? `, ${worker}` : ""}`.slice(0, 200),
        description: `${eventLabel(v.kind)} on ${dmy(v.occurredOn)}. Sponsors must notify Home Affairs within 28 days (Sponsor notification form in ImmiAccount). Record it on the sponsor's page when done.\n\nSponsor: /app/employers/${v.employerId}`,
        priority: "urgent",
        clientId: v.clientId,
        assignedTo: ctx.userId,
        createdBy: ctx.userId,
        dueAt: new Date(`${notifyBy}T09:00:00+10:00`),
      })
      .returning({ id: s.tasks.id });
    const [row] = await db.insert(s.sponsorEvents).values({ agencyId: ctx.agencyId, employerId: v.employerId, clientId: v.clientId, kind: v.kind, occurredOn: v.occurredOn, notifyBy, notes: v.notes, taskId: task.id, createdBy: ctx.userId }).returning({ id: s.sponsorEvents.id });
    if (v.clientId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: v.clientId, actorId: ctx.userId, kind: "system", title: `${emp.name}: ${eventLabel(v.kind).toLowerCase()}`, body: `On ${dmy(v.occurredOn)}. Home Affairs to be told by ${dmy(notifyBy)}.` });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "sponsor_event", entityId: row.id, detail: { kind: v.kind, occurredOn: v.occurredOn } });
    updateTag(agencyTag(ctx.agencyId));
    revalidatePath(`/app/employers/${v.employerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const notified = z.object({ id: z.string().min(1), notifiedOn: isoDate, reference: z.string().trim().max(80).nullable() });

/** Marks the notification as made, and closes its task. */
export async function markSponsorNotified(input: z.input<typeof notified>): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const v = notified.parse(input);
    if (v.notifiedOn > todayIso()) return { ok: false, error: "The date can't be in the future." };
    const [e] = await db.select().from(s.sponsorEvents).where(and(eq(s.sponsorEvents.agencyId, ctx.agencyId), eq(s.sponsorEvents.id, v.id)));
    if (!e) return { ok: false, error: "Not found." };
    await db.update(s.sponsorEvents).set({ notifiedOn: v.notifiedOn, reference: v.reference, updatedAt: new Date() }).where(eq(s.sponsorEvents.id, e.id));
    if (e.taskId) await db.update(s.tasks).set({ status: "done", updatedAt: new Date() }).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.id, e.taskId)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "sponsor_event", entityId: e.id, detail: { notifiedOn: v.notifiedOn, reference: v.reference, late: v.notifiedOn > e.notifyBy } });
    updateTag(agencyTag(ctx.agencyId));
    revalidatePath(`/app/employers/${e.employerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSponsorEvent(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const [e] = await db.select().from(s.sponsorEvents).where(and(eq(s.sponsorEvents.agencyId, ctx.agencyId), eq(s.sponsorEvents.id, id)));
    if (!e) return { ok: false, error: "Not found." };
    await db.delete(s.sponsorEvents).where(eq(s.sponsorEvents.id, id));
    if (e.taskId && !e.notifiedOn) await db.delete(s.tasks).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.id, e.taskId), eq(s.tasks.status, "todo")));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "sponsor_event", entityId: id, detail: { kind: e.kind, occurredOn: e.occurredOn } });
    updateTag(agencyTag(ctx.agencyId));
    revalidatePath(`/app/employers/${e.employerId}`);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
