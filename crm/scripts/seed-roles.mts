// Adds a login for each staff position to the demo agency, with HR, education and compliance data.
// Usage: npx tsx --env-file=.env.local scripts/seed-roles.mts <agency-slug>
import { neon } from "@neondatabase/serverless";
import { hashPassword } from "better-auth/crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schemaModule from "../src/db/schema";
const s = ((schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule) as typeof schemaModule;

const db = drizzle(neon(process.env.DATABASE_URL!), { schema: s });
const slug = process.argv[2];
const PASSWORD = "Demo-pass-2026!";
const day = (n: number) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

const [org] = await db.select().from(s.organization).where(eq(s.organization.slug, slug));
if (!org) throw new Error(`No agency ${slug}`);
const agencyId = org.id;

const people = [
  { email: "priya@lodgely.test", name: "Priya Nair", role: "agent", position: "migration_agent", title: "Registered migration agent", marn: "2112345", marnExpiry: day(240), payType: "salary", payRate: "98000", employment: "full_time", hours: "38" },
  { email: "daniel@lodgely.test", name: "Daniel Wu", role: "agent", position: "education_agent", title: "Education counsellor", qeac: "QEAC-A1872", payType: "salary", payRate: "72000", employment: "full_time", hours: "38" },
  { email: "sofia@lodgely.test", name: "Sofia Martinez", role: "staff", position: "consultant", title: "Case officer", payType: "hourly", payRate: "38.50", employment: "part_time", hours: "30" },
  { email: "tom@lodgely.test", name: "Tom Becker", role: "staff", position: "reception", title: "Front desk", payType: "hourly", payRate: "32.40", employment: "casual", hours: "20" },
  { email: "grace@lodgely.test", name: "Grace Lee", role: "staff", position: "accounts", title: "Accounts officer", payType: "salary", payRate: "68000", employment: "part_time", hours: "30" },
  { email: "hannah@lodgely.test", name: "Hannah Ali", role: "admin", position: "hr", title: "HR & operations", payType: "salary", payRate: "85000", employment: "full_time", hours: "38" },
] as const;

const hash = await hashPassword(PASSWORD);
const ids: Record<string, string> = {};
for (const p of people) {
  let [u] = await db.select().from(s.user).where(eq(s.user.email, p.email));
  if (!u) {
    [u] = await db.insert(s.user).values({ id: crypto.randomUUID(), name: p.name, email: p.email, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }).returning();
    await db.insert(s.account).values({ id: crypto.randomUUID(), accountId: u.id, providerId: "credential", userId: u.id, password: hash, createdAt: new Date(), updatedAt: new Date() });
  }
  ids[p.email] = u.id;
  const [m] = await db.select().from(s.member).where(and(eq(s.member.organizationId, agencyId), eq(s.member.userId, u.id)));
  if (!m) await db.insert(s.member).values({ id: crypto.randomUUID(), organizationId: agencyId, userId: u.id, role: p.role, createdAt: new Date() });
  const profile = {
    position: p.position,
    title: p.title,
    marn: "marn" in p ? p.marn : null,
    marnExpiry: "marnExpiry" in p ? p.marnExpiry : null,
    qeac: "qeac" in p ? p.qeac : null,
    payType: p.payType,
    payRate: p.payRate,
    employment: p.employment,
    hoursPerWeek: p.hours,
    startDate: day(-400),
    annualLeaveHours: p.employment === "casual" ? "0" : "86.4",
    personalLeaveHours: p.employment === "casual" ? "0" : "42.1",
    superFund: "AustralianSuper",
    phone: "0400 000 000",
  };
  const [sp] = await db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, u.id)));
  if (sp) await db.update(s.staffProfiles).set(profile).where(eq(s.staffProfiles.id, sp.id));
  else await db.insert(s.staffProfiles).values({ agencyId, userId: u.id, ...profile });
}

// Owner: principal with pay details.
const [owner] = await db.select().from(s.member).where(and(eq(s.member.organizationId, agencyId), eq(s.member.role, "owner")));
await db.update(s.staffProfiles).set({ payType: "salary", payRate: "145000", title: "Principal migration agent", marn: "1795213", marnExpiry: day(300), annualLeaveHours: "120", personalLeaveHours: "60" }).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, owner.userId)));
const managerId = owner.userId;
await db.update(s.staffProfiles).set({ managerId }).where(and(eq(s.staffProfiles.agencyId, agencyId), inArray(s.staffProfiles.userId, Object.values(ids))));

// Reset demo HR rows for these people so the script can be re-run.
const all = Object.values(ids);
await db.delete(s.leaveRequests).where(and(eq(s.leaveRequests.agencyId, agencyId), inArray(s.leaveRequests.userId, all)));
await db.delete(s.timeEntries).where(and(eq(s.timeEntries.agencyId, agencyId), inArray(s.timeEntries.userId, all), isNull(s.timeEntries.payRunId)));
await db.delete(s.cpdRecords).where(and(eq(s.cpdRecords.agencyId, agencyId), inArray(s.cpdRecords.userId, [...all, owner.userId])));

await db.insert(s.leaveRequests).values([
  { agencyId, userId: ids["priya@lodgely.test"], kind: "annual", startDate: day(21), endDate: day(25), hours: "38", status: "pending", note: "Family trip to Kerala" },
  { agencyId, userId: ids["daniel@lodgely.test"], kind: "personal", startDate: day(-12), endDate: day(-12), hours: "7.6", status: "approved", note: "Sick", decidedBy: owner.userId },
  { agencyId, userId: ids["sofia@lodgely.test"], kind: "annual", startDate: day(40), endDate: day(44), hours: "30", status: "pending", note: "Graduation" },
  { agencyId, userId: ids["grace@lodgely.test"], kind: "annual", startDate: day(-30), endDate: day(-28), hours: "18", status: "approved", decidedBy: owner.userId },
]);

const matters = await db.select({ id: s.matters.id, stage: s.matters.stage }).from(s.matters).where(eq(s.matters.agencyId, agencyId));
const time = [];
for (let i = 1; i <= 10; i++) {
  const d = day(-i);
  const dow = new Date(d).getDay();
  if (dow === 0 || dow === 6) continue;
  time.push({ agencyId, userId: ids["tom@lodgely.test"], date: d, hours: "4", note: "Front desk" });
  time.push({ agencyId, userId: ids["sofia@lodgely.test"], date: d, hours: "6", note: "Document review", matterId: matters[i % matters.length]?.id, billable: true });
  time.push({ agencyId, userId: ids["priya@lodgely.test"], date: d, hours: "7.6", note: "Client consults and lodgements", matterId: matters[(i + 2) % matters.length]?.id, billable: true });
}
await db.insert(s.timeEntries).values(time);

await db.insert(s.cpdRecords).values([
  { agencyId, userId: ids["priya@lodgely.test"], date: day(-60), activity: "Ethics and the Code of Conduct (mandatory)", provider: "MIA", points: "2" },
  { agencyId, userId: ids["priya@lodgely.test"], date: day(-35), activity: "Employer sponsored visas update", provider: "LawSmart", points: "3" },
  { agencyId, userId: ids["priya@lodgely.test"], date: day(-10), activity: "Partner visa case law 2026", provider: "MIA", points: "2" },
  { agencyId, userId: owner.userId, date: day(-80), activity: "Running a compliant practice (mandatory)", provider: "OMARA", points: "2" },
  { agencyId, userId: owner.userId, date: day(-20), activity: "Skills in Demand visa workshop", provider: "MIA", points: "4" },
]);

// Compliance + RFI deadlines on existing matters.
for (const [i, m] of matters.entries()) {
  const engaged = !["enquiry", "consultation"].includes(m.stage);
  await db
    .update(s.matters)
    .set({ consumerGuideAt: engaged || i % 2 ? day(-60 + i) : null, agreementSignedAt: engaged && i % 4 !== 1 ? day(-58 + i) : null, rfiDueAt: m.stage === "rfi" ? day(5 + i) : null })
    .where(eq(s.matters.id, m.id));
}

// Education: institutions and student applications.
await db.delete(s.studentApplications).where(eq(s.studentApplications.agencyId, agencyId));
await db.delete(s.institutions).where(eq(s.institutions.agencyId, agencyId));
const insts = await db
  .insert(s.institutions)
  .values([
    { agencyId, name: "University of Sydney", cricos: "00026A", state: "NSW", commissionRate: "15", agreementExpiry: day(420), contactName: "Emma Hughes", contactEmail: "intl@sydney.edu.au" },
    { agencyId, name: "Monash University", cricos: "00008C", state: "VIC", commissionRate: "12", agreementExpiry: day(60), contactName: "Liam Park", contactEmail: "agents@monash.edu" },
    { agencyId, name: "TAFE NSW", cricos: "00591E", state: "NSW", commissionRate: "20", agreementExpiry: day(700), contactName: "Ruth Kelly", contactEmail: "international@tafensw.edu.au" },
    { agencyId, name: "Queensland University of Technology", cricos: "00213J", state: "QLD", commissionRate: "15", agreementExpiry: day(300) },
  ])
  .returning();
const clients = await db.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.agencyId, agencyId)).limit(12);
const apps = [
  { course: "Master of Nursing Practice", code: "078931E", inst: 1, status: "submitted", fee: "48822", intake: "Feb 2027" },
  { course: "Master of Data Science", code: "083961G", inst: 0, status: "offer", fee: "53000", intake: "Feb 2027" },
  { course: "Diploma of Hospitality Management", code: "103551K", inst: 2, status: "enrolled", fee: "18500", intake: "Jul 2026" },
  { course: "Master of Professional Accounting", code: "093882B", inst: 3, status: "coe", fee: "39800", intake: "Feb 2027" },
  { course: "Bachelor of Information Technology", code: "079520J", inst: 3, status: "preparing", fee: "36200", intake: "Jul 2027" },
  { course: "Certificate IV in Commercial Cookery", code: "105112C", inst: 2, status: "enrolled", fee: "16900", intake: "Jul 2026", onshore: true, accepted: day(-120) },
  { course: "Master of Engineering (Civil)", code: "085123A", inst: 1, status: "conditional", fee: "51500", intake: "Feb 2027" },
  { course: "Graduate Diploma of Education", code: "091117D", inst: 0, status: "accepted", fee: "44000", intake: "Feb 2027", accepted: day(-5) },
  { course: "Master of Business Analytics", code: "097654K", inst: 1, status: "enrolled", fee: "50200", intake: "Feb 2026", commission: "received" },
];
await db.insert(s.studentApplications).values(
  apps.map((a, i) => ({
    agencyId,
    clientId: clients[i % clients.length].id,
    institutionId: insts[a.inst].id,
    course: a.course,
    courseCode: a.code,
    intake: a.intake,
    status: a.status,
    tuitionFee: a.fee,
    commissionRate: insts[a.inst].commissionRate,
    onshoreTransfer: Boolean(a.onshore),
    acceptedAt: a.accepted ?? (["accepted", "coe", "enrolled"].includes(a.status) ? day(-90) : null),
    commissionStatus: a.onshore ? "ineligible" : (a.commission ?? (a.status === "enrolled" ? "claimable" : "not_due")),
    assignedTo: ids["daniel@lodgely.test"],
  })),
);

console.log("Seeded", Object.keys(ids).length, "staff logins for", org.name);
