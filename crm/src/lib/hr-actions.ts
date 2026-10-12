"use server";

import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { ensureMailboxes, mailEnabled, sendMail } from "@/lib/mail";
import { calcPay, type Frequency } from "@/lib/payroll";
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

/** Drafts a pay run: one payslip per employee with a pay rate, from salary or logged hours. */
export async function createPayRun(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can run payroll.");
    const periodStart = v(f, "periodStart");
    const periodEnd = v(f, "periodEnd");
    const payDate = v(f, "payDate") ?? periodEnd;
    const frequency = (v(f, "frequency") ?? "fortnightly") as Frequency;
    if (!periodStart || !periodEnd || !payDate) return { ok: false, error: "Set the pay period." };
    const staff = await db
      .select({ profile: s.staffProfiles, name: s.user.name })
      .from(s.staffProfiles)
      .innerJoin(s.user, eq(s.user.id, s.staffProfiles.userId))
      .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), sql`${s.staffProfiles.payRate} is not null`));
    if (!staff.length) return { ok: false, error: "Add a pay rate to at least one staff member first (HR → Staff)." };
    const time = await db
      .select({ userId: s.timeEntries.userId, hours: sql<string>`sum(${s.timeEntries.hours})` })
      .from(s.timeEntries)
      .where(and(eq(s.timeEntries.agencyId, ctx.agencyId), gte(s.timeEntries.date, periodStart), lte(s.timeEntries.date, periodEnd), isNull(s.timeEntries.payRunId)))
      .groupBy(s.timeEntries.userId);
    const [run] = await db.insert(s.payRuns).values({ agencyId: ctx.agencyId, periodStart, periodEnd, payDate, frequency, createdBy: ctx.name }).returning();
    let gross = 0;
    let tax = 0;
    let sup = 0;
    let net = 0;
    for (const { profile: p, name } of staff) {
      const logged = time.find((t) => t.userId === p.userId);
      const pay = calcPay({
        employment: p.employment,
        payType: p.payType,
        payRate: Number(p.payRate),
        hoursPerWeek: Number(p.hoursPerWeek),
        superRate: Number(p.superRate),
        taxFreeThreshold: p.taxFreeThreshold,
        frequency,
        loggedHours: logged ? Number(logged.hours) : null,
      });
      await db.insert(s.payslips).values({
        agencyId: ctx.agencyId,
        payRunId: run.id,
        userId: p.userId,
        name,
        hours: String(pay.hours),
        gross: String(pay.gross),
        tax: String(pay.tax),
        superAmount: String(pay.super),
        net: String(pay.net),
        annualAccrued: String(pay.annual),
        personalAccrued: String(pay.personal),
        lines: pay.lines,
      });
      gross += pay.gross;
      tax += pay.tax;
      sup += pay.super;
      net += pay.net;
    }
    await db.update(s.payRuns).set({ gross: gross.toFixed(2), tax: tax.toFixed(2), superTotal: sup.toFixed(2), net: net.toFixed(2) }).where(eq(s.payRuns.id, run.id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: run.id };
  } catch (e) {
    return fail(e);
  }
}

/** Locks a pay run, accrues leave and tells each employee their payslip is ready. */
export async function finalisePayRun(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can run payroll.");
    const [run] = await db.select().from(s.payRuns).where(and(eq(s.payRuns.agencyId, ctx.agencyId), eq(s.payRuns.id, id)));
    if (!run || run.status !== "draft") return { ok: false, error: "This pay run is already finalised." };
    const slips = await db.select().from(s.payslips).where(eq(s.payslips.payRunId, id));
    for (const p of slips) {
      await db
        .update(s.staffProfiles)
        .set({ annualLeaveHours: sql`${s.staffProfiles.annualLeaveHours} + ${p.annualAccrued}`, personalLeaveHours: sql`${s.staffProfiles.personalLeaveHours} + ${p.personalAccrued}` })
        .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, p.userId)));
    }
    await db
      .update(s.timeEntries)
      .set({ payRunId: id })
      .where(and(eq(s.timeEntries.agencyId, ctx.agencyId), gte(s.timeEntries.date, run.periodStart), lte(s.timeEntries.date, run.periodEnd), isNull(s.timeEntries.payRunId)));
    await db.update(s.payRuns).set({ status: "finalised" }).where(eq(s.payRuns.id, id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "pay_run", entityId: id, detail: { finalised: true } });
    if (mailEnabled() && slips.length) {
      const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).where(inArray(s.user.id, slips.map((p) => p.userId)));
      const box = (await ensureMailboxes(ctx)).find((b) => b.kind === "shared");
      const base = process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";
      for (const p of slips) {
        const to = users.find((u) => u.id === p.userId)?.email;
        if (!box || !to || to.endsWith(".test")) continue;
        await sendMail({
          agencyId: ctx.agencyId,
          from: { address: box.address, name: ctx.agencyName },
          to: [to],
          subject: `Your payslip for ${run.periodStart} to ${run.periodEnd}`,
          html: `<p>Hi ${p.name.split(" ")[0]},</p><p>Your payslip for the period ${run.periodStart} to ${run.periodEnd} is ready. Net pay of <strong>$${Number(p.net).toFixed(2)}</strong> will be paid on ${run.payDate}.</p><p><a href="${base}/app/me/payslips/${p.id}">View your payslip</a></p>`,
        });
      }
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deletePayRun(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    await db.delete(s.payRuns).where(and(eq(s.payRuns.agencyId, ctx.agencyId), eq(s.payRuns.id, id), eq(s.payRuns.status, "draft")));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
