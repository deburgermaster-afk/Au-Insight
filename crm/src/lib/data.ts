import "server-only";
import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema as s } from "@/db";
import { getCtx } from "@/lib/session";

// Reads are cached per agency and tagged `agency:<id>`; every server action that changes the
// agency's data calls updateTag on it (src/lib/actions.ts). The exported getters resolve the
// agency from the session first, so one agency can never ask for another's rows.

export const agencyTag = (agencyId: string) => `agency:${agencyId}`;

function tag(agencyId: string) {
  cacheTag(agencyTag(agencyId));
  cacheLife("minutes");
}

const num = (v: unknown) => (v == null ? 0 : Number(v));

// ── Dashboard ─────────────────────────────────────────────────────────────────────────────────

export async function getDashboard() {
  const { agencyId, userId } = await getCtx();
  return dashboardFor(agencyId, userId);
}

async function dashboardFor(agencyId: string, userId: string) {
  "use cache";
  tag(agencyId);
  const today = new Date();
  const in90 = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const [clientCount, activeMatters, byStage, openTasks, expiring, upcoming, invoices, recent, myTasks] = await Promise.all([
    db.select({ n: count() }).from(s.clients).where(eq(s.clients.agencyId, agencyId)),
    db
      .select({ n: count() })
      .from(s.matters)
      .where(and(eq(s.matters.agencyId, agencyId), sql`${s.matters.stage} <> 'closed'`)),
    db
      .select({ stage: s.matters.stage, n: count() })
      .from(s.matters)
      .where(eq(s.matters.agencyId, agencyId))
      .groupBy(s.matters.stage),
    db
      .select({ n: count() })
      .from(s.tasks)
      .where(and(eq(s.tasks.agencyId, agencyId), sql`${s.tasks.status} <> 'done'`)),
    db
      .select({ id: s.clients.id, firstName: s.clients.firstName, lastName: s.clients.lastName, visa: s.clients.currentVisa, expiry: s.clients.visaExpiry })
      .from(s.clients)
      .where(and(eq(s.clients.agencyId, agencyId), gte(s.clients.visaExpiry, todayIso), lte(s.clients.visaExpiry, in90)))
      .orderBy(asc(s.clients.visaExpiry))
      .limit(8),
    db
      .select({ id: s.appointments.id, title: s.appointments.title, startsAt: s.appointments.startsAt, kind: s.appointments.kind, location: s.appointments.location })
      .from(s.appointments)
      .where(and(eq(s.appointments.agencyId, agencyId), gte(s.appointments.startsAt, today)))
      .orderBy(asc(s.appointments.startsAt))
      .limit(6),
    db
      .select({ status: s.invoices.status, total: sql<string>`coalesce(sum(${s.invoices.total}),0)`, paid: sql<string>`coalesce(sum(${s.invoices.paid}),0)` })
      .from(s.invoices)
      .where(eq(s.invoices.agencyId, agencyId))
      .groupBy(s.invoices.status),
    db.select().from(s.activities).where(eq(s.activities.agencyId, agencyId)).orderBy(desc(s.activities.createdAt)).limit(10),
    db
      .select()
      .from(s.tasks)
      .where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.assignedTo, userId), sql`${s.tasks.status} <> 'done'`))
      .orderBy(asc(s.tasks.dueAt))
      .limit(6),
  ]);
  const [rfis, gaps] = await Promise.all([
    db
      .select({ id: s.matters.id, title: s.matters.title, reference: s.matters.reference, due: s.matters.rfiDueAt, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.matters)
      .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
      .where(and(eq(s.matters.agencyId, agencyId), isNotNull(s.matters.rfiDueAt), isNull(s.matters.decisionAt), sql`${s.matters.stage} <> 'closed'`))
      .orderBy(asc(s.matters.rfiDueAt))
      .limit(6),
    db
      .select({ n: count() })
      .from(s.matters)
      .where(and(eq(s.matters.agencyId, agencyId), sql`${s.matters.stage} not in ('enquiry','closed')`, or(isNull(s.matters.consumerGuideAt), isNull(s.matters.agreementSignedAt)))),
  ]);
  const billed = invoices.reduce((a, r) => a + num(r.total), 0);
  const collected = invoices.reduce((a, r) => a + num(r.paid), 0);
  return {
    rfis,
    complianceGaps: gaps[0]?.n ?? 0,
    clients: clientCount[0]?.n ?? 0,
    activeMatters: activeMatters[0]?.n ?? 0,
    openTasks: openTasks[0]?.n ?? 0,
    byStage: Object.fromEntries(byStage.map((r) => [r.stage, r.n])) as Record<string, number>,
    expiring,
    upcoming,
    billed,
    collected,
    outstanding: billed - collected,
    recent,
    myTasks,
  };
}

// ── Clients ───────────────────────────────────────────────────────────────────────────────────

export async function listClients(q = "", stage = "") {
  const { agencyId } = await getCtx();
  return clientsFor(agencyId, q, stage);
}

async function clientsFor(agencyId: string, q: string, stage: string) {
  "use cache";
  tag(agencyId);
  const where = [eq(s.clients.agencyId, agencyId)];
  if (q) {
    const like = `%${q}%`;
    where.push(or(ilike(s.clients.firstName, like), ilike(s.clients.lastName, like), ilike(s.clients.email, like), ilike(s.clients.passportNumber, like))!);
  }
  if (stage) where.push(eq(s.clients.stage, stage as typeof s.clients.$inferSelect.stage));
  const rows = await db
    .select({
      client: s.clients,
      matters: sql<number>`(select count(*)::int from ${s.matters} m where m.client_id = ${s.clients.id})`,
      assignee: s.user.name,
    })
    .from(s.clients)
    .leftJoin(s.user, eq(s.user.id, s.clients.assignedTo))
    .where(and(...where))
    .orderBy(desc(s.clients.updatedAt))
    .limit(500);
  return rows.map((r) => ({ ...r.client, matterCount: r.matters, assigneeName: r.assignee }));
}

export async function getClient(id: string) {
  const { agencyId } = await getCtx();
  return clientFor(agencyId, id);
}

async function clientFor(agencyId: string, id: string) {
  "use cache";
  tag(agencyId);
  const [client] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, id)));
  if (!client) return null;
  const [matters, documents, activities, tasks, dependants, invoices, appointments] = await Promise.all([
    db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.clientId, id))).orderBy(desc(s.matters.createdAt)),
    db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.clientId, id))).orderBy(desc(s.documents.createdAt)),
    db.select().from(s.activities).where(and(eq(s.activities.agencyId, agencyId), eq(s.activities.clientId, id))).orderBy(desc(s.activities.pinned), desc(s.activities.createdAt)).limit(100),
    db.select().from(s.tasks).where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.clientId, id))).orderBy(asc(s.tasks.status), asc(s.tasks.dueAt)),
    db.select().from(s.dependants).where(and(eq(s.dependants.agencyId, agencyId), eq(s.dependants.clientId, id))),
    db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.clientId, id))).orderBy(desc(s.invoices.createdAt)),
    db.select().from(s.appointments).where(and(eq(s.appointments.agencyId, agencyId), eq(s.appointments.clientId, id))).orderBy(desc(s.appointments.startsAt)),
  ]);
  const [pathway] = await db.select().from(s.aiPathways).where(and(eq(s.aiPathways.agencyId, agencyId), eq(s.aiPathways.clientId, id))).orderBy(desc(s.aiPathways.createdAt)).limit(1);
  const studies = await db
    .select({ a: s.studentApplications, inst: s.institutions.name })
    .from(s.studentApplications)
    .leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId))
    .where(and(eq(s.studentApplications.agencyId, agencyId), eq(s.studentApplications.clientId, id)))
    .orderBy(desc(s.studentApplications.createdAt));
  const [emails, insights, agencyRow] = await Promise.all([
    db
      .select({ id: s.messages.id, folder: s.messages.folder, fromName: s.messages.fromName, fromAddress: s.messages.fromAddress, to: s.messages.toAddresses, subject: s.messages.subject, bodyText: s.messages.bodyText, sentAt: s.messages.sentAt, attachments: s.messages.attachments, matterId: s.messages.matterId, auth: s.messages.auth })
      .from(s.messages)
      .where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.clientId, id)))
      .orderBy(desc(s.messages.sentAt))
      .limit(100),
    db.select().from(s.mailInsights).where(and(eq(s.mailInsights.agencyId, agencyId), eq(s.mailInsights.clientId, id))).orderBy(desc(s.mailInsights.createdAt)),
    db.select({ on: s.agencyProfile.aiMailEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  return { client, matters, documents, activities, tasks, dependants, invoices, appointments, pathway: pathway ?? null, studies, emails, insights, aiMailOn: Boolean(agencyRow[0]?.on) };
}

// ── Matters ───────────────────────────────────────────────────────────────────────────────────

export async function listMatters() {
  const { agencyId } = await getCtx();
  return mattersFor(agencyId);
}

async function mattersFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const rows = await db
    .select({
      matter: s.matters,
      clientFirst: s.clients.firstName,
      clientLast: s.clients.lastName,
      assignee: s.user.name,
      total: sql<number>`(select count(*)::int from ${s.checklistItems} c where c.matter_id = ${s.matters.id} and c.required)`,
      done: sql<number>`(select count(*)::int from ${s.checklistItems} c where c.matter_id = ${s.matters.id} and c.required and c.status in ('approved','waived','received'))`,
    })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .leftJoin(s.user, eq(s.user.id, s.matters.assignedTo))
    .where(eq(s.matters.agencyId, agencyId))
    .orderBy(desc(s.matters.updatedAt))
    .limit(1000);
  return rows.map((r) => ({
    ...r.matter,
    clientName: `${r.clientFirst} ${r.clientLast}`,
    assigneeName: r.assignee,
    checklistTotal: r.total,
    checklistDone: r.done,
  }));
}

export async function getMatter(id: string) {
  const { agencyId } = await getCtx();
  return matterFor(agencyId, id);
}

async function matterFor(agencyId: string, id: string) {
  "use cache";
  tag(agencyId);
  const [row] = await db
    .select({ matter: s.matters, client: s.clients, employer: s.employers })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .leftJoin(s.employers, eq(s.employers.id, s.matters.employerId))
    .where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.id, id)));
  if (!row) return null;
  const [checklist, activities, tasks, documents] = await Promise.all([
    db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, id)).orderBy(asc(s.checklistItems.sort)),
    db.select().from(s.activities).where(and(eq(s.activities.agencyId, agencyId), eq(s.activities.matterId, id))).orderBy(desc(s.activities.createdAt)).limit(100),
    db.select().from(s.tasks).where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.matterId, id))).orderBy(asc(s.tasks.status), asc(s.tasks.dueAt)),
    db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.matterId, id))),
  ]);
  return { ...row, checklist, activities, tasks, documents };
}

// ── Tasks, calendar ───────────────────────────────────────────────────────────────────────────

export async function listTasks() {
  const { agencyId } = await getCtx();
  return tasksFor(agencyId);
}

async function tasksFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  return db
    .select({ task: s.tasks, assignee: s.user.name, clientFirst: s.clients.firstName, clientLast: s.clients.lastName, matterRef: s.matters.reference })
    .from(s.tasks)
    .leftJoin(s.user, eq(s.user.id, s.tasks.assignedTo))
    .leftJoin(s.clients, eq(s.clients.id, s.tasks.clientId))
    .leftJoin(s.matters, eq(s.matters.id, s.tasks.matterId))
    .where(eq(s.tasks.agencyId, agencyId))
    .orderBy(asc(s.tasks.dueAt))
    .limit(500);
}

export async function listAppointments() {
  const { agencyId } = await getCtx();
  return appointmentsFor(agencyId);
}

async function appointmentsFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  return db
    .select({ appt: s.appointments, clientFirst: s.clients.firstName, clientLast: s.clients.lastName, staff: s.user.name })
    .from(s.appointments)
    .leftJoin(s.clients, eq(s.clients.id, s.appointments.clientId))
    .leftJoin(s.user, eq(s.user.id, s.appointments.staffId))
    .where(eq(s.appointments.agencyId, agencyId))
    .orderBy(asc(s.appointments.startsAt))
    .limit(500);
}

// ── Billing ───────────────────────────────────────────────────────────────────────────────────

export async function getBilling() {
  const { agencyId } = await getCtx();
  return billingFor(agencyId);
}

async function billingFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [invoices, ledger] = await Promise.all([
    db
      .select({ invoice: s.invoices, clientFirst: s.clients.firstName, clientLast: s.clients.lastName })
      .from(s.invoices)
      .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
      .where(eq(s.invoices.agencyId, agencyId))
      .orderBy(desc(s.invoices.createdAt))
      .limit(300),
    db.select().from(s.ledger).where(eq(s.ledger.agencyId, agencyId)).orderBy(desc(s.ledger.occurredAt)).limit(300),
  ]);
  const trustBalance = ledger
    .filter((l) => l.account === "trust")
    .reduce((a, l) => a + (l.kind === "receipt" ? num(l.amount) : -num(l.amount)), 0);
  return { invoices, ledger, trustBalance };
}

// ── Mailbox ───────────────────────────────────────────────────────────────────────────────────

export async function listMessages(folder = "inbox") {
  const { agencyId } = await getCtx();
  return messagesFor(agencyId, folder);
}

async function messagesFor(agencyId: string, folder: string) {
  "use cache";
  tag(agencyId);
  return db
    .select()
    .from(s.messages)
    .where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.folder, folder)))
    .orderBy(desc(s.messages.sentAt))
    .limit(200);
}

// ── Employers, documents, team, settings, audit ───────────────────────────────────────────────

export async function listEmployers() {
  const { agencyId } = await getCtx();
  return employersFor(agencyId);
}

async function employersFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  return db
    .select({
      employer: s.employers,
      matters: sql<number>`(select count(*)::int from ${s.matters} m where m.employer_id = ${s.employers.id})`,
    })
    .from(s.employers)
    .where(eq(s.employers.agencyId, agencyId))
    .orderBy(asc(s.employers.name));
}

export async function listDocuments() {
  const { agencyId } = await getCtx();
  return documentsFor(agencyId);
}

async function documentsFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  return db
    .select({ doc: s.documents, clientFirst: s.clients.firstName, clientLast: s.clients.lastName })
    .from(s.documents)
    .leftJoin(s.clients, eq(s.clients.id, s.documents.clientId))
    .where(eq(s.documents.agencyId, agencyId))
    .orderBy(desc(s.documents.createdAt))
    .limit(500);
}

export async function listTeam() {
  const { agencyId } = await getCtx();
  return teamFor(agencyId);
}

async function teamFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [members, invitations] = await Promise.all([
    db
      .select({ id: s.member.id, role: s.member.role, joined: s.member.createdAt, userId: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image, position: s.staffProfiles.position, title: s.staffProfiles.title, marn: s.staffProfiles.marn, marnExpiry: s.staffProfiles.marnExpiry, qeac: s.staffProfiles.qeac })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, s.member.organizationId)))
      .where(eq(s.member.organizationId, agencyId))
      .orderBy(asc(s.member.createdAt)),
    db
      .select({ id: s.invitation.id, email: s.invitation.email, role: s.invitation.role, expiresAt: s.invitation.expiresAt, position: s.invitePositions.position })
      .from(s.invitation)
      .leftJoin(s.invitePositions, eq(s.invitePositions.invitationId, s.invitation.id))
      .where(and(eq(s.invitation.organizationId, agencyId), eq(s.invitation.status, "pending"))),
  ]);
  const workload = members.length
    ? await db
        .select({ userId: s.matters.assignedTo, n: count() })
        .from(s.matters)
        .where(and(eq(s.matters.agencyId, agencyId), inArray(s.matters.assignedTo, members.map((m) => m.userId)), sql`${s.matters.stage} <> 'closed'`))
        .groupBy(s.matters.assignedTo)
    : [];
  const load = Object.fromEntries(workload.map((w) => [w.userId, w.n]));
  return { members: members.map((m) => ({ ...m, openMatters: load[m.userId] ?? 0 })), invitations };
}

export async function getAgencyProfile() {
  const { agencyId } = await getCtx();
  return profileFor(agencyId);
}

async function profileFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [p] = await db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  return p ?? null;
}

export async function listAudit() {
  const { agencyId } = await getCtx();
  return auditFor(agencyId);
}

async function auditFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  return db.select().from(s.auditLog).where(eq(s.auditLog.agencyId, agencyId)).orderBy(desc(s.auditLog.createdAt)).limit(300);
}

/** Small lists for pickers (clients, staff, employers). */
export async function getPickers() {
  const { agencyId } = await getCtx();
  return pickersFor(agencyId);
}

async function pickersFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [clients, staff, employers] = await Promise.all([
    db.select({ id: s.clients.id, name: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}` }).from(s.clients).where(eq(s.clients.agencyId, agencyId)).orderBy(asc(s.clients.firstName)).limit(1000),
    db.select({ id: s.user.id, name: s.user.name, role: s.member.role }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(eq(s.member.organizationId, agencyId)),
    db.select({ id: s.employers.id, name: s.employers.name }).from(s.employers).where(eq(s.employers.agencyId, agencyId)).orderBy(asc(s.employers.name)),
  ]);
  return { clients, staff, employers };
}

/** Everything for the reports page. */
export async function getReports() {
  const { agencyId } = await getCtx();
  return reportsFor(agencyId);
}

async function reportsFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [byVisa, bySource, byMonth, outcomes] = await Promise.all([
    db.select({ visa: s.matters.visaCode, n: count() }).from(s.matters).where(eq(s.matters.agencyId, agencyId)).groupBy(s.matters.visaCode).orderBy(desc(count())),
    db.select({ source: s.clients.source, n: count() }).from(s.clients).where(eq(s.clients.agencyId, agencyId)).groupBy(s.clients.source).orderBy(desc(count())),
    db
      .select({ month: sql<string>`to_char(date_trunc('month', ${s.ledger.occurredAt}), 'YYYY-MM')`, amount: sql<string>`sum(${s.ledger.amount})` })
      .from(s.ledger)
      .where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.kind, "receipt"), eq(s.ledger.account, "office")))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db.select({ outcome: s.matters.outcome, n: count() }).from(s.matters).where(and(eq(s.matters.agencyId, agencyId), sql`${s.matters.outcome} is not null`)).groupBy(s.matters.outcome),
  ]);
  return { byVisa, bySource, revenue: byMonth.map((r) => ({ month: r.month, amount: num(r.amount) })), outcomes };
}

/** Badge counts and the capabilities that decide which links the sidebar shows. */
export async function getNavData() {
  const { agencyId, userId, caps } = await getCtx();
  return { counts: await navCountsFor(agencyId, userId), caps };
}

async function navCountsFor(agencyId: string, userId: string) {
  "use cache";
  tag(agencyId);
  const [[inbox], [tasks], [matters], [clients]] = await Promise.all([
    db.select({ n: count() }).from(s.messages).where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.folder, "inbox"), eq(s.messages.read, false))),
    db.select({ n: count() }).from(s.tasks).where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.assignedTo, userId), sql`${s.tasks.status} <> 'done'`)),
    db.select({ n: count() }).from(s.matters).where(and(eq(s.matters.agencyId, agencyId), sql`${s.matters.stage} <> 'closed'`)),
    db.select({ n: count() }).from(s.clients).where(eq(s.clients.agencyId, agencyId)),
  ]);
  return { "/app/inbox": inbox.n, "/app/tasks": tasks.n, "/app/matters": matters.n, "/app/clients": clients.n } as Record<string, number>;
}

/** Every message the agency holds (newest 500), for the mailbox. */
export async function listMail() {
  const { agencyId } = await getCtx();
  return mailFor(agencyId);
}

async function mailFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const rows = await db
    .select({ m: s.messages, first: s.clients.firstName, last: s.clients.lastName, insight: s.mailInsights })
    .from(s.messages)
    .leftJoin(s.clients, eq(s.clients.id, s.messages.clientId))
    .leftJoin(s.mailInsights, eq(s.mailInsights.messageId, s.messages.id))
    .where(eq(s.messages.agencyId, agencyId))
    .orderBy(desc(s.messages.sentAt))
    .limit(500);
  return rows.map((r) => ({ ...r.m, clientName: r.first ? `${r.first} ${r.last}` : null, insight: r.insight }));
}

/** The agency's matters on one visa, for the visa page. */
export async function mattersOnVisa(code: string) {
  const { agencyId } = await getCtx();
  return mattersOnVisaFor(agencyId, code);
}

async function mattersOnVisaFor(agencyId: string, code: string) {
  "use cache";
  tag(agencyId);
  return db
    .select({ id: s.matters.id, reference: s.matters.reference, stage: s.matters.stage, stream: s.matters.stream, first: s.clients.firstName, last: s.clients.lastName, lodgedAt: s.matters.lodgedAt, outcome: s.matters.outcome })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.visaCode, code)))
    .orderBy(desc(s.matters.updatedAt));
}

/** Files and client folders for the drive (folders themselves are read fresh by the page). */
export async function getDrive() {
  const { agencyId } = await getCtx();
  return driveFor(agencyId);
}

async function driveFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [docs, clients] = await Promise.all([
    db
      .select({ d: s.documents, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.documents)
      .leftJoin(s.clients, eq(s.clients.id, s.documents.clientId))
      .where(eq(s.documents.agencyId, agencyId))
      .orderBy(desc(s.documents.createdAt))
      .limit(2000),
    db
      .select({ id: s.clients.id, name: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}`, n: sql<number>`(select count(*)::int from ${s.documents} d where d.client_id = ${s.clients.id})` })
      .from(s.clients)
      .where(eq(s.clients.agencyId, agencyId))
      .orderBy(asc(s.clients.firstName)),
  ]);
  return { docs: docs.map((r) => ({ ...r.d, clientName: r.first ? `${r.first} ${r.last}` : null })), clients };
}

/** Study applications and partner institutions, for education agents. */
export async function getEducation() {
  const { agencyId } = await getCtx();
  return educationFor(agencyId);
}

async function educationFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [apps, institutions] = await Promise.all([
    db
      .select({ a: s.studentApplications, first: s.clients.firstName, last: s.clients.lastName, inst: s.institutions.name, agent: s.user.name })
      .from(s.studentApplications)
      .innerJoin(s.clients, eq(s.clients.id, s.studentApplications.clientId))
      .leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId))
      .leftJoin(s.user, eq(s.user.id, s.studentApplications.assignedTo))
      .where(eq(s.studentApplications.agencyId, agencyId))
      .orderBy(desc(s.studentApplications.updatedAt)),
    db.select().from(s.institutions).where(eq(s.institutions.agencyId, agencyId)).orderBy(asc(s.institutions.name)),
  ]);
  return { apps: apps.map((r) => ({ ...r.a, student: `${r.first} ${r.last}`, institution: r.inst, agent: r.agent })), institutions };
}

/** Everything the settings hub and its pages show. Tokens never leave the server. */
export async function getSettings() {
  const { agencyId } = await getCtx();
  return settingsFor(agencyId);
}

async function settingsFor(agencyId: string) {
  "use cache";
  tag(agencyId);
  const [[profile], [resend], mailboxes, connections, [members]] = await Promise.all([
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
    db
      .select({ id: s.connectors.id, status: s.connectors.status, account: s.connectors.account, scope: s.connectors.scope, connectedByName: s.connectors.connectedByName, createdAt: s.connectors.createdAt, webhookReady: sql<boolean>`${s.connectors.webhookSecret} is not null`, usage: s.connectors.usage, usageCheckedAt: s.connectors.usageCheckedAt, lastError: s.connectors.lastError })
      .from(s.connectors)
      .where(and(eq(s.connectors.agencyId, agencyId), eq(s.connectors.kind, "resend"))),
    db.select({ address: s.mailboxes.address, name: s.mailboxes.name, kind: s.mailboxes.kind, userId: s.mailboxes.userId }).from(s.mailboxes).where(eq(s.mailboxes.agencyId, agencyId)).orderBy(asc(s.mailboxes.kind), asc(s.mailboxes.address)),
    db.select({ id: s.mailConnections.id, userId: s.mailConnections.userId, provider: s.mailConnections.provider, email: s.mailConnections.email, status: s.mailConnections.status, lastError: s.mailConnections.lastError, lastSyncAt: s.mailConnections.lastSyncAt }).from(s.mailConnections).where(eq(s.mailConnections.agencyId, agencyId)),
    db.select({ n: count() }).from(s.member).where(eq(s.member.organizationId, agencyId)),
  ]);
  return { profile: profile ?? null, resend: resend ?? null, mailboxes, connections, members: members?.n ?? 0 };
}
