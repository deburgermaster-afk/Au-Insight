import "server-only";
import { and, desc, eq, gte } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema as s } from "@/db";
import { agencyTag } from "@/lib/data";
import { getCtx } from "@/lib/session";

function tag(agencyId: string) {
  cacheTag(agencyTag(agencyId));
  cacheLife("minutes");
}

/** Everything for the signed-in person's employee portal. */
export async function getMe() {
  const ctx = await getCtx();
  return meFor(ctx.agencyId, ctx.userId);
}

async function meFor(agencyId: string, userId: string) {
  "use cache";
  tag(agencyId);
  const since = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const [[profile], leave, time, slips, cpd, tasks] = await Promise.all([
    db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, userId))),
    db.select().from(s.leaveRequests).where(and(eq(s.leaveRequests.agencyId, agencyId), eq(s.leaveRequests.userId, userId))).orderBy(desc(s.leaveRequests.startDate)),
    db
      .select({ t: s.timeEntries, ref: s.matters.reference })
      .from(s.timeEntries)
      .leftJoin(s.matters, eq(s.matters.id, s.timeEntries.matterId))
      .where(and(eq(s.timeEntries.agencyId, agencyId), eq(s.timeEntries.userId, userId), gte(s.timeEntries.date, since)))
      .orderBy(desc(s.timeEntries.date)),
    db
      .select({ p: s.payslips, run: s.payRuns })
      .from(s.payslips)
      .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
      .where(and(eq(s.payslips.agencyId, agencyId), eq(s.payslips.userId, userId), eq(s.payRuns.status, "finalised")))
      .orderBy(desc(s.payRuns.payDate)),
    db.select().from(s.cpdRecords).where(and(eq(s.cpdRecords.agencyId, agencyId), eq(s.cpdRecords.userId, userId))).orderBy(desc(s.cpdRecords.date)),
    db.select().from(s.tasks).where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.assignedTo, userId))).orderBy(s.tasks.dueAt).limit(50),
  ]);
  return { profile: profile ?? null, leave, time: time.map((r) => ({ ...r.t, matterRef: r.ref })), slips: slips.map((r) => ({ ...r.p, run: r.run })), cpd, tasks };
}

/** Staff, leave and pay runs for HR. */
export async function getHr() {
  const { agencyId } = await getCtx();
  return hrFor(agencyId);
}

async function hrFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [staff, leave, runs, slips] = await Promise.all([
    db
      .select({ memberId: s.member.id, role: s.member.role, userId: s.user.id, name: s.user.name, email: s.user.email, profile: s.staffProfiles })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, agencyId)))
      .where(eq(s.member.organizationId, agencyId))
      .orderBy(s.user.name),
    db
      .select({ l: s.leaveRequests, name: s.user.name })
      .from(s.leaveRequests)
      .innerJoin(s.user, eq(s.user.id, s.leaveRequests.userId))
      .where(eq(s.leaveRequests.agencyId, agencyId))
      .orderBy(desc(s.leaveRequests.createdAt))
      .limit(100),
    db.select().from(s.payRuns).where(eq(s.payRuns.agencyId, agencyId)).orderBy(desc(s.payRuns.payDate)).limit(30),
    db.select().from(s.payslips).where(eq(s.payslips.agencyId, agencyId)).orderBy(s.payslips.name).limit(600),
  ]);
  return { staff, leave: leave.map((r) => ({ ...r.l, name: r.name })), runs: runs.map((r) => ({ ...r, slips: slips.filter((p) => p.payRunId === r.id) })) };
}

export async function getPayslip(id: string) {
  const ctx = await getCtx();
  const [row] = await db
    .select({ p: s.payslips, run: s.payRuns, profile: s.staffProfiles, agency: s.agencyProfile })
    .from(s.payslips)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
    .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.payslips.userId), eq(s.staffProfiles.agencyId, s.payslips.agencyId)))
    .leftJoin(s.agencyProfile, eq(s.agencyProfile.agencyId, s.payslips.agencyId))
    .where(and(eq(s.payslips.agencyId, ctx.agencyId), eq(s.payslips.id, id)));
  if (!row) return null;
  if (row.p.userId !== ctx.userId && !ctx.caps.includes("payroll")) return null;
  // Year to date: this financial year's finalised payslips up to this one.
  const fyStart = `${Number(row.run.payDate.slice(0, 4)) - (Number(row.run.payDate.slice(5, 7)) < 7 ? 1 : 0)}-07-01`;
  const ytd = await db
    .select({ gross: s.payslips.gross, tax: s.payslips.tax, sup: s.payslips.superAmount })
    .from(s.payslips)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
    .where(and(eq(s.payslips.agencyId, ctx.agencyId), eq(s.payslips.userId, row.p.userId), eq(s.payRuns.status, "finalised"), gte(s.payRuns.payDate, fyStart)));
  const sum = (k: "gross" | "tax" | "sup") => ytd.reduce((a, r) => a + Number(r[k]), 0);
  return { ...row, agencyName: ctx.agencyName, ytd: { gross: sum("gross"), tax: sum("tax"), super: sum("sup") } };
}
