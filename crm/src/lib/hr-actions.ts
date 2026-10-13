"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import type { Position } from "@/lib/permissions";
import { actionCtx, requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const v = (f: FormData, k: string) => {
  const x = f.get(k);
  const t = typeof x === "string" ? x.trim() : "";
  return t === "" ? null : t;
};

async function profileId(agencyId: string, userId: string) {
  const [p] = await db.select({ id: s.staffProfiles.id }).from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, userId)));
  if (p) return p.id;
  const [n] = await db.insert(s.staffProfiles).values({ agencyId, userId }).returning({ id: s.staffProfiles.id });
  return n.id;
}

/** Admin/HR edit of a staff member's position, registration, employment and pay. */
export async function saveStaff(userId: string, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team", "Only admins and HR can change staff records.");
    const id = await profileId(ctx.agencyId, userId);
    await db
      .update(s.staffProfiles)
      .set({
        position: (v(f, "position") ?? "consultant") as Position,
        title: v(f, "title"),
        phone: v(f, "phone"),
        marn: v(f, "marn"),
        marnExpiry: v(f, "marnExpiry"),
        qeac: v(f, "qeac"),
        employment: v(f, "employment") ?? "full_time",
        startDate: v(f, "startDate"),
        payType: v(f, "payType") ?? "salary",
        payRate: v(f, "payRate"),
        hoursPerWeek: v(f, "hoursPerWeek") ?? "38",
        superRate: v(f, "superRate") ?? "12",
        managerId: v(f, "managerId"),
      })
      .where(eq(s.staffProfiles.id, id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "staff_profile", entityId: userId });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Fields everyone may change about themselves. */
export async function saveMyDetails(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const id = await profileId(ctx.agencyId, ctx.userId);
    await db
      .update(s.staffProfiles)
      .set({ phone: v(f, "phone"), superFund: v(f, "superFund"), bankBsb: v(f, "bankBsb"), bankAccount: v(f, "bankAccount"), taxFreeThreshold: f.get("taxFreeThreshold") === "on" })
      .where(eq(s.staffProfiles.id, id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function requestLeave(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const start = v(f, "startDate");
    const end = v(f, "endDate") ?? start;
    const hours = Number(v(f, "hours"));
    if (!start || !end || !(hours > 0)) return { ok: false, error: "Add dates and hours." };
    if (end < start) return { ok: false, error: "The end date is before the start." };
    await db.insert(s.leaveRequests).values({ agencyId: ctx.agencyId, userId: ctx.userId, kind: v(f, "kind") ?? "annual", startDate: start, endDate: end, hours: String(hours), note: v(f, "note") });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function decideLeave(id: string, approve: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can approve leave.");
    const [l] = await db.select().from(s.leaveRequests).where(and(eq(s.leaveRequests.agencyId, ctx.agencyId), eq(s.leaveRequests.id, id)));
    if (!l || l.status !== "pending") return { ok: false, error: "Already decided." };
    await db.update(s.leaveRequests).set({ status: approve ? "approved" : "declined", decidedBy: ctx.name }).where(eq(s.leaveRequests.id, id));
    if (approve && (l.kind === "annual" || l.kind === "personal")) {
      const col = l.kind === "annual" ? s.staffProfiles.annualLeaveHours : s.staffProfiles.personalLeaveHours;
      await db
        .update(s.staffProfiles)
        .set(l.kind === "annual" ? { annualLeaveHours: sql`${col} - ${l.hours}` } : { personalLeaveHours: sql`${col} - ${l.hours}` })
        .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, l.userId)));
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function logTime(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const date = v(f, "date");
    const hours = Number(v(f, "hours"));
    if (!date || !(hours > 0 && hours <= 24)) return { ok: false, error: "Add a date and between 0 and 24 hours." };
    await db.insert(s.timeEntries).values({ agencyId: ctx.agencyId, userId: ctx.userId, date, hours: String(hours), note: v(f, "note"), matterId: v(f, "matterId"), billable: f.get("billable") === "on" });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addCpd(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const activity = v(f, "activity");
    const points = Number(v(f, "points"));
    if (!activity || !(points > 0)) return { ok: false, error: "Describe the activity and its points." };
    await db.insert(s.cpdRecords).values({ agencyId: ctx.agencyId, userId: ctx.userId, date: v(f, "date") ?? new Date().toISOString().slice(0, 10), activity, provider: v(f, "provider"), points: String(points) });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
