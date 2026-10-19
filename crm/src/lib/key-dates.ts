import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull, lte, ne, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { KeyDateSettings } from "@/db/crm-schema";
import { daysUntil, dmy, todayIso } from "@/lib/format";
import { notifyStaff } from "@/lib/notify";
import { DEFAULT_BIRTHDAY_MESSAGE, eventLabel } from "@/lib/sponsor-shared";

// Key dates, checked once a day: client birthdays, visa grant anniversaries (with the next step each one
// may open), and sponsor obligations (sponsorship, nomination approvals and sponsored workers' visas
// running out, and 28-day notifications to Home Affairs). Each reminder is made once (reminder_log).

export const keyDateDefaults = (k: KeyDateSettings | null | undefined): Required<KeyDateSettings> => ({ birthdays: k?.birthdays ?? "task", birthdayMessage: k?.birthdayMessage || DEFAULT_BIRTHDAY_MESSAGE, anniversaries: k?.anniversaries ?? "task", sponsor: k?.sponsor ?? true });

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const PERMANENT = ["189", "190", "186", "187", "191", "887", "801", "100", "103", "143", "173", "864", "124", "858", "200", "201", "202", "204"];
const SPONSORED_TEMP = ["482", "494", "457", "407", "400"];

/** True the first time this reminder is claimed; false if it was already made. */
async function claim(agencyId: string, kind: string, refId: string, period: string) {
  const r = await db.insert(s.reminderLog).values({ agencyId, kind, refId, period }).onConflictDoNothing().returning({ id: s.reminderLog.id });
  return r.length > 0;
}

/** What a grant anniversary may open, by visa and year. */
export function anniversaryNote(visa: string, years: number) {
  if (PERMANENT.includes(visa)) {
    if (years === 1) return "A year as a permanent resident: part of the citizenship residence requirement (4 years' lawful residence, 1 as a permanent resident). Check whether they now qualify.";
    if (years === 4) return "Their travel facility ends 5 years after grant. If they'll travel after that, plan a Resident Return visa (155). Also check citizenship eligibility.";
    if (years === 5) return "The permanent visa's travel facility has ended today. They need a Resident Return visa (155) or citizenship to come back as a permanent resident after travel.";
    return "Check in, and see whether citizenship is the next step.";
  }
  if (["491", "494"].includes(visa) && years === 3) return "Three years on a regional visa: they may now be eligible for the subclass 191 permanent visa (3 years living and working in regional Australia, with taxable income each year). Check their income and addresses.";
  if (visa === "482" && years === 2) return "Two years on the 482: they may now meet the work history for the 186 Temporary Residence Transition stream (2 of the last 3 years in the occupation), if their employer nominates them.";
  if (visa === "482" && years === 1) return "A year in. The 186 Temporary Residence Transition stream needs 2 years' work on the 482; check whether the employer plans to nominate them.";
  return null;
}

/** The staff member most involved with a sponsor: the latest nomination's or sponsored case's officer. */
async function sponsorOwner(employerId: string) {
  const [n] = await db.select({ u: s.nominations.assignedTo }).from(s.nominations).where(and(eq(s.nominations.employerId, employerId), isNotNull(s.nominations.assignedTo))).orderBy(desc(s.nominations.updatedAt)).limit(1);
  if (n?.u) return n.u;
  const [m] = await db.select({ u: s.matters.assignedTo }).from(s.matters).where(and(eq(s.matters.employerId, employerId), isNotNull(s.matters.assignedTo))).orderBy(desc(s.matters.updatedAt)).limit(1);
  return m?.u ?? null;
}

async function emailOf(userId: string | null) {
  if (!userId) return null;
  const [u] = await db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, userId));
  return u?.email ?? null;
}

const bucket = (days: number, steps: number[]) => [...steps].sort((a, b) => a - b).find((t) => days <= t);

type Agency = { agencyId: string; name: string; cfg: Required<KeyDateSettings> };

async function birthdays(a: Agency, today: string) {
  if (a.cfg.birthdays === "off") return 0;
  const mmdd = today.slice(5);
  const year = today.slice(0, 4);
  const leap = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const days = mmdd === "02-28" && !leap ? ["02-28", "02-29"] : [mmdd];
  const rows = await db
    .select({ id: s.clients.id, first: s.clients.firstName, last: s.clients.lastName, email: s.clients.email, dob: s.clients.dateOfBirth, assignedTo: s.clients.assignedTo })
    .from(s.clients)
    .where(and(eq(s.clients.agencyId, a.agencyId), isNotNull(s.clients.dateOfBirth), ne(s.clients.stage, "lost"), inArray(sql`to_char(${s.clients.dateOfBirth}, 'MM-DD')`, days)));
  let n = 0;
  for (const c of rows) {
    if (!(await claim(a.agencyId, "birthday", c.id, year))) continue;
    n++;
    const age = Number(year) - Number(c.dob!.slice(0, 4));
    let greeted = false;
    if (a.cfg.birthdays === "greet" && c.email) greeted = await greet(a, c.id, c.first, c.email);
    await db.insert(s.tasks).values({
      agencyId: a.agencyId,
      title: `${c.first} ${c.last}'s birthday today${age > 0 && age < 120 ? ` (${age})` : ""}`,
      description: greeted ? "A birthday email was sent from the agency. A call or message is a nice touch too." : "Send them a birthday message.",
      priority: "low",
      clientId: c.id,
      assignedTo: c.assignedTo,
      dueAt: new Date(`${today}T08:00:00+10:00`),
    });
  }
  return n;
}

async function greet(a: Agency, clientId: string, first: string, to: string) {
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  if (!mailEnabled()) return false;
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, a.agencyId), eq(s.mailboxes.kind, "shared")));
  if (!box) return false;
  const text = a.cfg.birthdayMessage.replaceAll("{firstName}", first).replaceAll("{agency}", a.name);
  try {
    await sendMail({ agencyId: a.agencyId, from: { address: box.address, name: a.name }, to: [to], subject: `Happy birthday, ${first}!`, html: text.split(/\n+/).map((p) => `<p>${esc(p)}</p>`).join(""), clientId, footer: `Sent by ${a.name} via Lodgely` });
    await db.insert(s.activities).values({ agencyId: a.agencyId, clientId, kind: "system", title: "Birthday email sent", body: text });
    return true;
  } catch (e) {
    console.error("birthday email", e);
    return false;
  }
}

async function anniversaries(a: Agency, today: string) {
  if (a.cfg.anniversaries === "off") return 0;
  const year = Number(today.slice(0, 4));
  const rows = await db
    .select({ m: s.matters, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .where(and(eq(s.matters.agencyId, a.agencyId), eq(s.matters.outcome, "granted"), isNotNull(s.matters.decisionAt), sql`to_char(${s.matters.decisionAt}, 'MM-DD') = ${today.slice(5)}`, sql`${s.matters.decisionAt} < ${today}::date`));
  let n = 0;
  for (const { m, first, last } of rows) {
    const years = year - Number(m.decisionAt!.slice(0, 4));
    if (years < 1 || years > 10) continue;
    if (!(await claim(a.agencyId, "anniversary", m.id, String(year)))) continue;
    n++;
    const note = anniversaryNote(m.visaCode, years);
    await db.insert(s.tasks).values({
      agencyId: a.agencyId,
      title: `${years} year${years === 1 ? "" : "s"} since ${first} ${last}'s ${m.visaCode} was granted`,
      description: `${note ?? "A good moment to check in."}\n\nGranted ${dmy(m.decisionAt!)} · ${m.reference}`,
      priority: note && years !== 1 ? "normal" : "low",
      clientId: m.clientId,
      matterId: m.id,
      assignedTo: m.assignedTo,
      dueAt: new Date(`${today}T09:00:00+10:00`),
    });
  }
  return n;
}

async function sponsorTask(a: Agency, employerId: string, title: string, lines: string[], opts: { clientId?: string | null; matterId?: string | null; priority?: "normal" | "high" | "urgent"; dueAt: Date }) {
  const owner = await sponsorOwner(employerId);
  await db.insert(s.tasks).values({ agencyId: a.agencyId, title: title.slice(0, 200), description: `${lines.join("\n")}\n\nSponsor: /app/employers/${employerId}`, priority: opts.priority ?? "high", clientId: opts.clientId ?? null, matterId: opts.matterId ?? null, assignedTo: owner, dueAt: opts.dueAt });
  const email = await emailOf(owner);
  if (email) await notifyStaff([email], title, { heading: title, lines, cta: { label: "Open the sponsor", path: `/app/employers/${employerId}` } });
}

const at = (iso: string) => new Date(`${iso}T09:00:00+10:00`);

async function sponsorChecks(a: Agency, today: string) {
  if (!a.cfg.sponsor) return 0;
  let n = 0;
  // Sponsorship (SBS) running out.
  const emps = await db.select().from(s.employers).where(and(eq(s.employers.agencyId, a.agencyId), eq(s.employers.sbsApproved, true), isNotNull(s.employers.sbsExpiry)));
  for (const e of emps) {
    const days = daysUntil(e.sbsExpiry!);
    const b = bucket(days, [90, 30, 0]);
    if (b == null || days < -30 || !(await claim(a.agencyId, "sbs", e.id, `${e.sbsExpiry}:${b}`))) continue;
    n++;
    await sponsorTask(a, e.id, days < 0 ? `${e.name}'s sponsorship has expired` : `${e.name}'s sponsorship expires in ${days} days`, [`Standard business sponsorship ${days < 0 ? "expired" : "expires"} on ${dmy(e.sbsExpiry!)}.`, "Lodge the renewal before then: new nominations can't be lodged without it, and current workers' obligations continue."], { dueAt: at(e.sbsExpiry! < today ? today : e.sbsExpiry!), priority: days <= 30 ? "urgent" : "high" });
  }
  // Approved nominations whose visa hasn't been lodged yet.
  const noms = await db
    .select({ n: s.nominations, emp: s.employers.name, first: s.clients.firstName, last: s.clients.lastName, lodged: s.matters.lodgedAt })
    .from(s.nominations)
    .innerJoin(s.employers, eq(s.employers.id, s.nominations.employerId))
    .leftJoin(s.clients, eq(s.clients.id, s.nominations.clientId))
    .leftJoin(s.matters, eq(s.matters.id, s.nominations.matterId))
    .where(and(eq(s.nominations.agencyId, a.agencyId), eq(s.nominations.status, "approved"), isNotNull(s.nominations.approvalExpires), lte(s.nominations.approvalExpires, sql`${today}::date + 30`)));
  for (const r of noms) {
    if (r.lodged) continue;
    const days = daysUntil(r.n.approvalExpires!);
    const b = bucket(days, [30, 7]);
    if (b == null || days < 0 || !(await claim(a.agencyId, "nomination", r.n.id, `${r.n.approvalExpires}:${b}`))) continue;
    n++;
    const who = r.first ? `${r.first} ${r.last}` : "the nominee";
    await sponsorTask(a, r.n.employerId, `Lodge ${who}'s visa: ${r.emp}'s nomination approval ends in ${days} days`, [`The ${r.n.positionTitle} nomination approval ends on ${dmy(r.n.approvalExpires!)}.`, `${who}'s visa application must be lodged before then, or the employer has to nominate again.`], { clientId: r.n.clientId, matterId: r.n.matterId, dueAt: at(r.n.approvalExpires!), priority: days <= 7 ? "urgent" : "high" });
  }
  // Sponsored workers' visas running out.
  const workers = await db
    .select({ m: s.matters, c: s.clients, emp: s.employers.name })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .innerJoin(s.employers, eq(s.employers.id, s.matters.employerId))
    .where(and(eq(s.matters.agencyId, a.agencyId), eq(s.matters.outcome, "granted"), inArray(s.matters.visaCode, SPONSORED_TEMP), eq(s.clients.currentVisa, s.matters.visaCode), isNotNull(s.clients.visaExpiry), lte(s.clients.visaExpiry, sql`${today}::date + 90`)));
  for (const { m, c, emp } of workers) {
    const days = daysUntil(c.visaExpiry!);
    const b = bucket(days, [90, 30]);
    if (b == null || days < 0 || !(await claim(a.agencyId, "worker_visa", m.id, `${c.visaExpiry}:${b}`))) continue;
    n++;
    await sponsorTask(a, m.employerId!, `${c.firstName} ${c.lastName}'s ${m.visaCode} (sponsored by ${emp}) ends in ${days} days`, [`Their visa ends on ${dmy(c.visaExpiry!)}.`, "Talk to the employer about a new nomination, a 186 transition, or the worker's next visa. If they leave the job, the sponsor must tell Home Affairs within 28 days."], { clientId: c.id, matterId: m.id, dueAt: at(c.visaExpiry!), priority: days <= 30 ? "urgent" : "high" });
  }
  // 28-day notifications not yet made.
  const events = await db
    .select({ e: s.sponsorEvents, emp: s.employers.name })
    .from(s.sponsorEvents)
    .innerJoin(s.employers, eq(s.employers.id, s.sponsorEvents.employerId))
    .where(and(eq(s.sponsorEvents.agencyId, a.agencyId), isNull(s.sponsorEvents.notifiedOn), lte(s.sponsorEvents.notifyBy, sql`${today}::date + 7`)));
  for (const { e, emp } of events) {
    const days = daysUntil(e.notifyBy);
    const b = days < 0 ? "overdue" : "7";
    if (!(await claim(a.agencyId, "sponsor_event", e.id, b))) continue;
    n++;
    await sponsorTask(a, e.employerId, days < 0 ? `Overdue: ${emp} hasn't told Home Affairs (${eventLabel(e.kind).toLowerCase()})` : `${emp} must tell Home Affairs within ${days} days`, [`${eventLabel(e.kind)} on ${dmy(e.occurredOn)}.`, `The notification was due by ${dmy(e.notifyBy)}. Lodge it in ImmiAccount (Sponsor notification form) and record it on the sponsor's page.`], { clientId: e.clientId, dueAt: at(e.notifyBy < today ? today : e.notifyBy), priority: "urgent" });
  }
  return n;
}

/** Runs every key-date check for all agencies (or the given ones). */
export async function runKeyDates(agencyIds?: string[]) {
  const today = todayIso();
  const orgs = await db.select({ id: s.organization.id, name: s.organization.name, keyDates: s.agencyProfile.keyDates }).from(s.organization).leftJoin(s.agencyProfile, eq(s.agencyProfile.agencyId, s.organization.id));
  const out = { agencies: 0, birthdays: 0, anniversaries: 0, sponsor: 0 };
  for (const o of orgs) {
    if (agencyIds && !agencyIds.includes(o.id)) continue;
    const a: Agency = { agencyId: o.id, name: o.name, cfg: keyDateDefaults(o.keyDates) };
    out.agencies++;
    try {
      out.birthdays += await birthdays(a, today);
      out.anniversaries += await anniversaries(a, today);
      out.sponsor += await sponsorChecks(a, today);
    } catch (e) {
      console.error("key dates", o.id, e);
    }
  }
  return out;
}

/** Upcoming sponsor dates for one employer, for its page. */
export async function sponsorTimeline(agencyId: string, employerId: string) {
  const [e] = await db.select().from(s.employers).where(and(eq(s.employers.agencyId, agencyId), eq(s.employers.id, employerId)));
  if (!e) return [];
  const items: { date: string; title: string; detail: string; href?: string }[] = [];
  if (e.sbsApproved && e.sbsExpiry) items.push({ date: e.sbsExpiry, title: "Sponsorship expires", detail: "Renew before new nominations are needed." });
  const noms = await db.select({ n: s.nominations, first: s.clients.firstName, last: s.clients.lastName, lodged: s.matters.lodgedAt }).from(s.nominations).leftJoin(s.clients, eq(s.clients.id, s.nominations.clientId)).leftJoin(s.matters, eq(s.matters.id, s.nominations.matterId)).where(and(eq(s.nominations.employerId, employerId), eq(s.nominations.status, "approved"), isNotNull(s.nominations.approvalExpires)));
  for (const r of noms) if (!r.lodged) items.push({ date: r.n.approvalExpires!, title: `Nomination approval ends: ${r.n.positionTitle}`, detail: `${r.first ? `${r.first} ${r.last}'s` : "The nominee's"} visa must be lodged first.`, href: r.n.matterId ? `/app/matters/${r.n.matterId}` : undefined });
  const workers = await db.select({ m: s.matters, c: s.clients }).from(s.matters).innerJoin(s.clients, eq(s.clients.id, s.matters.clientId)).where(and(eq(s.matters.employerId, employerId), eq(s.matters.outcome, "granted"), inArray(s.matters.visaCode, SPONSORED_TEMP), isNotNull(s.clients.visaExpiry)));
  for (const { m, c } of workers) if (c.currentVisa === m.visaCode) items.push({ date: c.visaExpiry!, title: `${c.firstName} ${c.lastName}'s ${m.visaCode} ends`, detail: "Plan the next nomination, a 186 transition, or their next visa.", href: `/app/clients/${c.id}` });
  for (const { m, c } of workers) {
    if (!m.decisionAt) continue;
    const two = `${Number(m.decisionAt.slice(0, 4)) + 2}${m.decisionAt.slice(4)}`;
    if (m.visaCode === "482" && daysUntil(two) > -365) items.push({ date: two, title: `${c.firstName} ${c.lastName}: 2 years on the 482`, detail: "May be eligible for the 186 Temporary Residence Transition stream.", href: `/app/clients/${c.id}` });
  }
  return items.filter((i) => daysUntil(i.date) > -60).sort((x, y) => x.date.localeCompare(y.date));
}
