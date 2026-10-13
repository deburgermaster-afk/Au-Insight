"use server";

import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { PayLine } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { ensureMailboxes, mailEnabled, sendMail } from "@/lib/mail";
import { financialYear, type Frequency, validAbn, validBsb, validTfn, validUsi } from "@/lib/payg";
import { calcSlip, nextPeriod, type PayProfile, taxTreatment } from "@/lib/payroll";
import { frequencyOf, payrollSettingsFor, stpPayees, stpPayer, taxProfileOf, ytdBefore } from "@/lib/payroll-data";
import type { Position } from "@/lib/permissions";
import { encrypt } from "@/lib/secure";
import { actionCtx, type Ctx, requireCap } from "@/lib/session";
import { buildStp } from "@/lib/stp";

type StaffProfile = typeof s.staffProfiles.$inferSelect;
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const v = (f: FormData, k: string) => {
  const x = f.get(k);
  const t = typeof x === "string" ? x.trim() : "";
  return t === "" ? null : t;
};
const on = (f: FormData, k: string) => f.get(k) === "on" || f.get(k) === "true";
const audit = (ctx: Ctx, action: string, entity: string, entityId: string, detail?: Record<string, unknown>) =>
  db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action, entity, entityId, detail });

async function ensureProfile(agencyId: string, userId: string) {
  const [p] = await db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, userId)));
  if (p) return p;
  const [member] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, agencyId), eq(s.member.userId, userId)));
  if (!member) throw new Error("That person isn't in this agency.");
  const [n] = await db.insert(s.staffProfiles).values({ agencyId, userId }).returning();
  return n;
}

function payProfile(p: StaffProfile, settings: Awaited<ReturnType<typeof payrollSettingsFor>>): PayProfile {
  return {
    employment: p.employment,
    payType: p.payType,
    payRate: Number(p.payRate ?? 0),
    hoursPerWeek: Number(p.hoursPerWeek),
    superRate: Number(p.superRate),
    extraSuperRate: p.extraSuperRate ? Number(p.extraSuperRate) : 0,
    salarySacrificeSuper: p.salarySacrificeSuper ? Number(p.salarySacrificeSuper) : 0,
    dob: p.dob,
    classificationRate: p.classificationRate ? Number(p.classificationRate) : null,
    tax: taxProfileOf(p, settings),
  };
}

function slipValues(pay: ReturnType<typeof calcSlip>, taxTreatmentCode: string) {
  return {
    hours: String(pay.hours),
    gross: String(pay.gross),
    tax: String(pay.tax),
    stsl: String(pay.stsl),
    superAmount: String(pay.super),
    net: String(pay.net),
    qualifying: String(pay.qualifying),
    salarySacrifice: String(pay.sacrifice),
    deductions: String(pay.deductions),
    annualAccrued: String(pay.annual),
    personalAccrued: String(pay.personal),
    lines: pay.lines,
    taxScale: pay.scaleLabel,
    taxTreatment: taxTreatmentCode,
    superDue: pay.superDue,
    notes: pay.notes,
  };
}

async function totalRun(runId: string) {
  await db.execute(sql`update pay_runs r set gross = coalesce(t.gross, 0), tax = coalesce(t.tax, 0), super_total = coalesce(t.sup, 0), net = coalesce(t.net, 0)
    from (select sum(gross) gross, sum(tax) tax, sum(super_amount) sup, sum(net) net from payslips where pay_run_id = ${runId}) t where r.id = ${runId}`);
}

/** Drafts a pay run for everyone on this pay frequency, with exact PAYG, super and leave. */
export async function createPayRun(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can run payroll.");
    const settings = await payrollSettingsFor(ctx.agencyId);
    const frequency = (v(f, "frequency") ?? settings.frequency) as Frequency;
    const suggested = settings.periodStart ? nextPeriod(settings.periodStart, frequency, settings.payLagDays) : null;
    const periodStart = v(f, "periodStart") ?? suggested?.periodStart;
    const periodEnd = v(f, "periodEnd") ?? suggested?.periodEnd;
    const payDate = v(f, "payDate") ?? suggested?.payDate ?? periodEnd;
    if (!periodStart || !periodEnd || !payDate) return { ok: false, error: "Set the pay period." };
    if (periodEnd < periodStart) return { ok: false, error: "The period ends before it starts." };
    const staff = await db
      .select({ profile: s.staffProfiles, name: s.user.name })
      .from(s.staffProfiles)
      .innerJoin(s.user, eq(s.user.id, s.staffProfiles.userId))
      .innerJoin(s.member, and(eq(s.member.userId, s.staffProfiles.userId), eq(s.member.organizationId, ctx.agencyId)))
      .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), sql`${s.staffProfiles.payRate} is not null`));
    const due = staff.filter(({ profile: p }) => frequencyOf(p, settings) === frequency && (!p.startDate || p.startDate <= periodEnd) && (!p.endDate || p.endDate >= periodStart));
    if (!due.length) return { ok: false, error: staff.length ? `Nobody is paid ${frequency}. Change the frequency or each person's pay settings.` : "Add a pay rate to at least one staff member first (HR → Staff)." };
    const time = await db
      .select({ userId: s.timeEntries.userId, hours: sql<string>`sum(${s.timeEntries.hours})` })
      .from(s.timeEntries)
      .where(and(eq(s.timeEntries.agencyId, ctx.agencyId), gte(s.timeEntries.date, periodStart), lte(s.timeEntries.date, periodEnd), isNull(s.timeEntries.payRunId)))
      .groupBy(s.timeEntries.userId);
    const [run] = await db.insert(s.payRuns).values({ agencyId: ctx.agencyId, periodStart, periodEnd, payDate, frequency, createdBy: ctx.name }).returning();
    for (const { profile: p, name } of due) {
      const logged = time.find((t) => t.userId === p.userId);
      const ytd = await ytdBefore(ctx.agencyId, p.userId, payDate);
      const pp = payProfile(p, settings);
      const pay = calcSlip(pp, { frequency, payDate, loggedHours: logged ? Number(logged.hours) : null, ytdGross: ytd.gross, ytdQualifying: ytd.qualifying });
      await db.insert(s.payslips).values({ agencyId: ctx.agencyId, payRunId: run.id, userId: p.userId, name, ...slipValues(pay, taxTreatment(pp.tax)) });
    }
    await totalRun(run.id);
    if (suggested && periodStart === suggested.periodStart) await db.update(s.payrollSettings).set({ periodStart: suggested.next }).where(eq(s.payrollSettings.agencyId, ctx.agencyId));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: run.id };
  } catch (e) {
    return fail(e);
  }
}

const lineSchema = z.object({
  label: z.string().trim().min(1).max(80),
  kind: z.enum(["overtime", "allowance", "bonus", "leave", "sacrifice_super", "sacrifice_other", "deduction", "lump_sum"]),
  hours: z.number().min(0).max(500).optional(),
  rate: z.number().min(0).max(10000).optional(),
  amount: z.number().min(-1_000_000).max(1_000_000),
  code: z.string().max(2).optional(),
  ote: z.boolean().optional(),
});

/** Adds overtime, allowances, bonuses, leave, salary sacrifice or deductions to a draft payslip and recalculates it. */
export async function setPayslipExtras(payslipId: string, extras: PayLine[]): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can change payslips.");
    const lines = z.array(lineSchema).max(30).parse(extras) as PayLine[];
    const [row] = await db
      .select({ slip: s.payslips, run: s.payRuns, profile: s.staffProfiles })
      .from(s.payslips)
      .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
      .innerJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.payslips.userId), eq(s.staffProfiles.agencyId, s.payslips.agencyId)))
      .where(and(eq(s.payslips.agencyId, ctx.agencyId), eq(s.payslips.id, payslipId)));
    if (!row) return { ok: false, error: "Payslip not found." };
    if (row.run.status !== "draft") return { ok: false, error: "This pay run is finalised. Make changes in the next pay run." };
    const settings = await payrollSettingsFor(ctx.agencyId);
    const normalised = lines.map((l) => ({ ...l, amount: l.kind === "sacrifice_super" || l.kind === "sacrifice_other" || l.kind === "deduction" ? -Math.abs(l.amount) : l.hours != null && l.rate != null ? Math.round(l.hours * l.rate * 100) / 100 : l.amount }));
    const ytd = await ytdBefore(ctx.agencyId, row.slip.userId, row.run.payDate, row.run.id);
    const pp = payProfile(row.profile, settings);
    const ordinary = row.slip.lines.find((l) => l.kind === "ordinary" && l.hours != null);
    const pay = calcSlip(pp, { frequency: row.run.frequency as Frequency, payDate: row.run.payDate, loggedHours: ordinary?.hours ?? null, extras: normalised, ytdGross: ytd.gross, ytdQualifying: ytd.qualifying });
    await db
      .update(s.payslips)
      .set({ ...slipValues(pay, taxTreatment(pp.tax)), extras: normalised })
      .where(eq(s.payslips.id, payslipId));
    await totalRun(row.run.id);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Recalculates every payslip in a draft run, e.g. after fixing someone's tax details. */
export async function recalculatePayRun(runId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const slips = await db.select({ id: s.payslips.id, extras: s.payslips.extras }).from(s.payslips).where(and(eq(s.payslips.agencyId, ctx.agencyId), eq(s.payslips.payRunId, runId)));
    for (const p of slips) {
      const r = await setPayslipExtras(p.id, p.extras);
      if (!r.ok) return r;
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Locks a pay run: accrues leave, books Payday Super contributions, prepares the STP pay event and emails payslips. */
export async function finalisePayRun(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can run payroll.");
    const [run] = await db.select().from(s.payRuns).where(and(eq(s.payRuns.agencyId, ctx.agencyId), eq(s.payRuns.id, id)));
    if (!run || run.status !== "draft") return { ok: false, error: "This pay run is already finalised." };
    const slips = await db.select().from(s.payslips).where(eq(s.payslips.payRunId, id));
    const profiles = slips.length
      ? await db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), inArray(s.staffProfiles.userId, slips.map((p) => p.userId))))
      : [];
    const settings = await payrollSettingsFor(ctx.agencyId);
    const contributions: (typeof s.superContributions.$inferInsert)[] = [];
    for (const p of slips) {
      const prof = profiles.find((x) => x.userId === p.userId);
      await db
        .update(s.staffProfiles)
        .set({ annualLeaveHours: sql`${s.staffProfiles.annualLeaveHours} + ${p.annualAccrued}`, personalLeaveHours: sql`${s.staffProfiles.personalLeaveHours} + ${p.personalAccrued}` })
        .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, p.userId)));
      const sacrifice = p.lines.filter((l) => l.kind === "sacrifice_super").reduce((a, l) => a + Math.abs(l.amount), 0);
      const extra = prof?.extraSuperRate ? Math.round(Number(p.qualifying) * Number(prof.extraSuperRate)) / 100 : 0;
      if (Number(p.superAmount) + sacrifice + extra > 0 && prof) {
        const useDefault = prof.superType === "default" || (!prof.superUsi && prof.superType !== "smsf");
        contributions.push({
          agencyId: ctx.agencyId,
          payRunId: id,
          payslipId: p.id,
          userId: p.userId,
          name: p.name,
          fund: useDefault
            ? { type: "default", name: settings.defaultFundName, usi: settings.defaultFundUsi, abn: settings.defaultFundAbn, member: prof.superMember }
            : { type: prof.superType, name: prof.superFund, usi: prof.superUsi, abn: prof.superAbn, member: prof.superMember, esa: prof.smsfEsa, bsb: prof.smsfBsb, account: prof.smsfAccount },
          sg: p.superAmount,
          sacrifice: sacrifice.toFixed(2),
          extra: extra.toFixed(2),
          payDate: run.payDate,
          dueDate: p.superDue ?? run.payDate,
        });
      }
    }
    if (contributions.length) await db.insert(s.superContributions).values(contributions);
    await db
      .update(s.timeEntries)
      .set({ payRunId: id })
      .where(and(eq(s.timeEntries.agencyId, ctx.agencyId), gte(s.timeEntries.date, run.periodStart), lte(s.timeEntries.date, run.periodEnd), isNull(s.timeEntries.payRunId)));
    await db.update(s.payRuns).set({ status: "finalised" }).where(eq(s.payRuns.id, id));
    // The STP pay event reports year-to-date figures for everyone paid in this run.
    await makeStpEvent(ctx, "pay", run.payDate, { payRunId: id, onlyUsers: slips.map((p) => p.userId), gross: Number(run.gross), tax: Number(run.tax) });
    await audit(ctx, "update", "pay_run", id, { finalised: true, payees: slips.length });
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

async function makeStpEvent(ctx: Ctx, kind: "pay" | "update" | "finalisation", date: string, opts: { payRunId?: string; onlyUsers?: string[]; gross?: number; tax?: number } = {}) {
  const fy = financialYear(date);
  const [payer, payees, settings] = await Promise.all([stpPayer(ctx.agencyId, ctx.agencyName), stpPayees(ctx.agencyId, kind === "finalisation" ? fy.end : date, opts.onlyUsers), payrollSettingsFor(ctx.agencyId)]);
  const [made] = await db
    .insert(s.stpEvents)
    .values({ agencyId: ctx.agencyId, kind, payRunId: opts.payRunId, financialYear: fy.label, payload: {}, via: settings.stpVia })
    .returning({ id: s.stpEvents.id, submissionId: s.stpEvents.submissionId });
  const { payload, problems } = buildStp({ kind, financialYear: fy.label, payDate: date, runAt: new Date().toISOString(), submissionId: made.submissionId, payer, payees, periodGross: opts.gross, periodTax: opts.tax });
  const ytdGross = payload.payees.reduce((a, p) => a + p.incomeStream.ytd.gross, 0);
  const ytdTax = payload.payees.reduce((a, p) => a + p.incomeStream.ytd.paygw, 0);
  await db
    .update(s.stpEvents)
    .set({ payload: payload as unknown as Record<string, unknown>, problems, status: problems.length ? "needs_fixing" : "ready", payees: payees.length, gross: (opts.gross ?? ytdGross).toFixed(2), tax: (opts.tax ?? ytdTax).toFixed(2) })
    .where(eq(s.stpEvents.id, made.id));
  return { id: made.id, problems };
}

/** Rebuilds an STP report after fixing employee or agency details. */
export async function rebuildStpEvent(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const [ev] = await db.select().from(s.stpEvents).where(and(eq(s.stpEvents.agencyId, ctx.agencyId), eq(s.stpEvents.id, id)));
    if (!ev) return { ok: false, error: "Report not found." };
    if (ev.status === "lodged" || ev.status === "accepted") return { ok: false, error: "Already lodged. Send an update event instead." };
    const prev = ev.payload as { event?: { payOrUpdateDate?: string }; payees?: unknown[] };
    const date = prev.event?.payOrUpdateDate ?? new Date().toISOString().slice(0, 10);
    const run = ev.payRunId ? (await db.select().from(s.payRuns).where(eq(s.payRuns.id, ev.payRunId)))[0] : null;
    const users = run ? (await db.select({ u: s.payslips.userId }).from(s.payslips).where(eq(s.payslips.payRunId, run.id))).map((r) => r.u) : undefined;
    await db.delete(s.stpEvents).where(eq(s.stpEvents.id, id));
    const made = await makeStpEvent(ctx, ev.kind as "pay", date, { payRunId: ev.payRunId ?? undefined, onlyUsers: users, gross: run ? Number(run.gross) : undefined, tax: run ? Number(run.tax) : undefined });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

/** Update event (correct YTD figures) or end-of-year finalisation for everyone paid this financial year. */
export async function createStpEvent(kind: "update" | "finalisation", fyEnd?: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const today = new Date().toISOString().slice(0, 10);
    const date = kind === "finalisation" ? (fyEnd ?? financialYear(today).end) : today;
    const made = await makeStpEvent(ctx, kind, date);
    await audit(ctx, "create", "stp_event", made.id, { kind });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

/** Records that a report was lodged through a registered STP solution, with the ATO receipt. */
export async function recordStpLodgement(id: string, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const receipt = v(f, "receipt");
    const [ev] = await db.select().from(s.stpEvents).where(and(eq(s.stpEvents.agencyId, ctx.agencyId), eq(s.stpEvents.id, id)));
    if (!ev) return { ok: false, error: "Report not found." };
    if (ev.problems.length) return { ok: false, error: "Fix the problems listed first, then rebuild the report." };
    await db
      .update(s.stpEvents)
      .set({ status: receipt ? "accepted" : "lodged", receipt, via: v(f, "via") ?? ev.via, lodgedAt: new Date(), lodgedBy: ctx.name })
      .where(eq(s.stpEvents.id, id));
    await audit(ctx, "update", "stp_event", id, { lodged: true, receipt });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Marks super contributions as sent to the clearing house or received by the fund. */
export async function markSuper(ids: string[], status: "sent" | "paid" | "due", reference?: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    if (!ids.length) return { ok: false, error: "Pick at least one contribution." };
    await db
      .update(s.superContributions)
      .set({ status, reference: reference ?? null, paidAt: status === "paid" ? new Date() : null })
      .where(and(eq(s.superContributions.agencyId, ctx.agencyId), inArray(s.superContributions.id, ids)));
    await audit(ctx, "update", "super_contribution", ids.join(","), { status, reference });
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

/** Agency payroll settings: STP payer details, pay calendar, default super fund, award. */
export async function savePayrollSettings(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can change payroll settings.");
    await payrollSettingsFor(ctx.agencyId);
    const set: Partial<typeof s.payrollSettings.$inferInsert> = {};
    const text = ["contactName", "contactEmail", "contactPhone", "addressLine1", "suburb", "addressState", "postcode", "defaultFundName", "defaultFundUsi", "defaultFundAbn", "clearingHouse", "awardCode", "awardName", "stpDeclarationName", "periodStart", "expenseAccount", "superExpenseAccount", "payBankCode", "payBsb", "payAccount", "payAccountName", "apcaId"] as const;
    for (const k of text) if (f.has(k)) (set as Record<string, unknown>)[k] = v(f, k);
    if (f.has("branch")) set.branch = (v(f, "branch") ?? "001").padStart(3, "0").slice(0, 3);
    if (f.has("frequency")) set.frequency = z.enum(["weekly", "fortnightly", "monthly"]).parse(v(f, "frequency"));
    if (f.has("payLagDays")) set.payLagDays = Math.max(0, Math.min(14, Number(v(f, "payLagDays") ?? 2)));
    if (f.has("stpVia")) set.stpVia = z.enum(["file", "employment_hero", "xero"]).parse(v(f, "stpVia"));
    if (f.has("whmRegisteredSet")) set.whmRegistered = on(f, "whmRegistered");
    if (set.defaultFundUsi && !validUsi(set.defaultFundUsi)) return { ok: false, error: "That USI doesn't look right. It's usually 3 letters, 4 digits, 2 letters (e.g. STA0100AU)." };
    if (set.defaultFundAbn && !validAbn(set.defaultFundAbn)) return { ok: false, error: "The fund ABN fails the ABN check." };
    if (set.postcode && !/^\d{4}$/.test(set.postcode)) return { ok: false, error: "Postcode is 4 digits." };
    if (set.payBsb && !validBsb(set.payBsb)) return { ok: false, error: "BSB is 6 digits, like 062-000." };
    if (set.apcaId && !/^\d{6}$/.test(set.apcaId)) return { ok: false, error: "The direct entry user ID is 6 digits (your bank gives it to you)." };
    if (set.payBankCode) set.payBankCode = set.payBankCode.toUpperCase().slice(0, 3);
    if (f.has("complete")) set.completedAt = new Date();
    await db.update(s.payrollSettings).set(set).where(eq(s.payrollSettings.agencyId, ctx.agencyId));
    await audit(ctx, "update", "payroll_settings", ctx.agencyId, { fields: Object.keys(set) });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type Section = "personal" | "tax" | "super" | "bank" | "employment" | "pay";

/** Builds the update for one section of an employee record. Employees can do personal, tax, super and bank themselves. */
function sectionUpdate(section: Section, f: FormData, existing: StaffProfile): Partial<typeof s.staffProfiles.$inferInsert> | string {
  if (section === "personal") {
    const postcode = v(f, "postcode");
    if (postcode && !/^\d{4}$/.test(postcode)) return "Postcode is 4 digits.";
    return {
      givenName: v(f, "givenName"),
      middleName: v(f, "middleName"),
      familyName: v(f, "familyName"),
      dob: v(f, "dob"),
      gender: v(f, "gender"),
      phone: v(f, "phone"),
      personalEmail: v(f, "personalEmail"),
      addressLine1: v(f, "addressLine1"),
      addressLine2: v(f, "addressLine2"),
      suburb: v(f, "suburb"),
      addressState: v(f, "addressState"),
      postcode,
      country: v(f, "country") ?? "AU",
      emergencyName: v(f, "emergencyName"),
      emergencyRelation: v(f, "emergencyRelation"),
      emergencyPhone: v(f, "emergencyPhone"),
    };
  }
  if (section === "tax") {
    const status = z.enum(["provided", "pending", "under18", "pensioner", "none"]).parse(v(f, "tfnStatus") ?? "none");
    const tfn = v(f, "tfn")?.replace(/\D/g, "") ?? null;
    if (status === "provided" && !tfn && !existing.tfnEnc) return "Enter the TFN.";
    if (tfn && !validTfn(tfn)) return "That TFN fails the ATO check. Check the 9 digits.";
    const residency = z.enum(["resident", "foreign", "whm"]).parse(v(f, "residency") ?? "resident");
    if (!on(f, "declare")) return "Tick the declaration to confirm these answers.";
    return {
      tfnStatus: status,
      ...(tfn && status === "provided" ? { tfnEnc: encrypt(tfn) } : status !== "provided" ? { tfnEnc: null } : {}),
      residency,
      taxFreeThreshold: residency === "resident" && on(f, "taxFreeThreshold"),
      stsl: on(f, "stsl"),
      medicareExemption: residency === "resident" ? z.enum(["none", "half", "full"]).parse(v(f, "medicareExemption") ?? "none") : "none",
      extraWithholding: v(f, "extraWithholding"),
      incomeType: residency === "whm" ? "WHM" : existing.incomeType === "WHM" ? "SAW" : existing.incomeType,
      homeCountry: v(f, "homeCountry") ?? existing.homeCountry,
      tfnDeclaredAt: new Date(),
    };
  }
  if (section === "super") {
    const type = z.enum(["apra", "smsf", "stapled", "default"]).parse(v(f, "superType") ?? "default");
    const usi = v(f, "superUsi");
    const abn = v(f, "superAbn");
    if ((type === "apra" || type === "stapled") && (!usi || !validUsi(usi))) return "Enter the fund's USI (e.g. STA0100AU). It's on the fund's website or your member statement.";
    if (abn && !validAbn(abn)) return "The fund ABN fails the ABN check.";
    if (type === "smsf" && (!abn || !v(f, "smsfEsa") || !v(f, "smsfBsb") || !v(f, "smsfAccount"))) return "A self-managed fund needs its ABN, electronic service address, BSB and account number.";
    if (type === "smsf" && !validBsb(v(f, "smsfBsb") ?? "")) return "BSB is 6 digits.";
    if (!on(f, "declare")) return "Tick the declaration to confirm your super choice.";
    return {
      superType: type,
      superFund: v(f, "superFund"),
      superUsi: usi?.toUpperCase() ?? null,
      superAbn: abn,
      superMember: v(f, "superMember"),
      smsfEsa: v(f, "smsfEsa"),
      smsfBsb: v(f, "smsfBsb"),
      smsfAccount: v(f, "smsfAccount"),
      smsfAccountName: v(f, "smsfAccountName"),
      ...(f.has("salarySacrificeSuper") ? { salarySacrificeSuper: v(f, "salarySacrificeSuper") } : {}),
      superChoiceAt: new Date(),
    };
  }
  if (section === "bank") {
    const bsb = v(f, "bankBsb");
    const account = v(f, "bankAccount")?.replace(/\s/g, "") ?? null;
    if (bsb && !validBsb(bsb)) return "BSB is 6 digits, like 062-000.";
    if (account && !/^\d{5,10}$/.test(account)) return "Account numbers are 5 to 10 digits.";
    return { bankAccountName: v(f, "bankAccountName"), bankBsb: bsb, bankAccount: account };
  }
  if (section === "employment") {
    return {
      position: (v(f, "position") ?? existing.position) as Position,
      title: v(f, "title"),
      managerId: v(f, "managerId"),
      marn: v(f, "marn"),
      marnExpiry: v(f, "marnExpiry"),
      qeac: v(f, "qeac"),
      employment: v(f, "employment") ?? "full_time",
      startDate: v(f, "startDate"),
      endDate: v(f, "endDate"),
      cessationType: v(f, "endDate") ? v(f, "cessationType") : null,
      incomeType: v(f, "incomeType") ?? existing.incomeType,
      homeCountry: v(f, "homeCountry"),
      payrollId: v(f, "payrollId"),
    };
  }
  // pay
  const rate = v(f, "payRate");
  if (rate && !(Number(rate) > 0)) return "Pay rate must be more than 0.";
  return {
    payType: v(f, "payType") ?? "salary",
    payRate: rate,
    hoursPerWeek: v(f, "hoursPerWeek") ?? "38",
    payFrequency: v(f, "payFrequency"),
    superRate: String(Math.max(12, Number(v(f, "superRate") ?? 12))),
    extraSuperRate: v(f, "extraSuperRate"),
    salarySacrificeSuper: v(f, "salarySacrificeSuper"),
    awardCode: v(f, "awardCode"),
    awardName: v(f, "awardName"),
    classification: v(f, "classification"),
    classificationRate: v(f, "classificationRate"),
  };
}

/** HR edit of one section of an employee's record. */
export async function saveEmployee(userId: string, section: Section, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can change staff records.");
    if (section === "employment" && !ctx.caps.includes("team")) return { ok: false, error: "Only admins can change positions." };
    const p = await ensureProfile(ctx.agencyId, userId);
    const set = sectionUpdate(section, f, p);
    if (typeof set === "string") return { ok: false, error: set };
    await db.update(s.staffProfiles).set(set).where(eq(s.staffProfiles.id, p.id));
    await audit(ctx, "update", "staff_profile", userId, { section, fields: Object.keys(set).filter((k) => k !== "tfnEnc") });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Employee self-service: their own contact details, TFN declaration, super choice and bank account. */
export async function saveMyPayroll(section: "personal" | "tax" | "super" | "bank", f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const p = await ensureProfile(ctx.agencyId, ctx.userId);
    const set = sectionUpdate(section, f, p);
    if (typeof set === "string") return { ok: false, error: set };
    await db.update(s.staffProfiles).set(set).where(eq(s.staffProfiles.id, p.id));
    await audit(ctx, "update", "staff_profile", ctx.userId, { section, self: true });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
