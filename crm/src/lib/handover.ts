import "server-only";
import { and, eq, gte, lte, ne, notInArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { HandoverItem } from "@/db/crm-schema";
import { marnCurrent } from "@/lib/permissions";

// Moving someone's work to colleagues: who owns what, a preview, applying it, and putting it back
// when temporary cover ends.

export type Scope = "matters" | "supervision" | "clients" | "tasks" | "appointments" | "applications";
export const SCOPES: { key: Scope; label: string }[] = [
  { key: "matters", label: "Cases they run" },
  { key: "supervision", label: "Cases they supervise" },
  { key: "clients", label: "Clients they look after" },
  { key: "tasks", label: "Open tasks" },
  { key: "appointments", label: "Upcoming appointments" },
  { key: "applications", label: "Student applications" },
];

export type PreviewItem = HandoverItem & { scope: Scope; detail: string; stage?: string; lodged?: boolean; hasRegisteredSupervisor?: boolean };

export async function staffOf(agencyId: string) {
  const rows = await db
    .select({ id: s.user.id, name: s.user.name, email: s.user.email, position: s.staffProfiles.position, marn: s.staffProfiles.marn, marnExpiry: s.staffProfiles.marnExpiry })
    .from(s.member)
    .innerJoin(s.user, eq(s.user.id, s.member.userId))
    .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, agencyId)))
    .where(eq(s.member.organizationId, agencyId));
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, registered: (r.position === "principal" || r.position === "migration_agent") && marnCurrent(r.marn, r.marnExpiry) }));
}

/** Everything a person currently owns, as handover items (to = null until chosen). */
export async function workOf(agencyId: string, userId: string, scopes: Scope[]): Promise<PreviewItem[]> {
  const out: PreviewItem[] = [];
  const staff = await staffOf(agencyId);
  const registered = new Set(staff.filter((x) => x.registered).map((x) => x.id));
  if (scopes.includes("matters") || scopes.includes("supervision")) {
    const rows = await db
      .select({ m: s.matters, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.matters)
      .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
      .where(and(eq(s.matters.agencyId, agencyId), ne(s.matters.stage, "closed")));
    for (const { m, first, last } of rows) {
      const label = `${m.reference} · ${first} ${last}`;
      const detail = `${m.title} · ${m.stage}`;
      const lodged = ["lodged", "rfi", "decision"].includes(m.stage);
      if (scopes.includes("matters") && m.assignedTo === userId) out.push({ scope: "matters", entity: "matter", id: m.id, field: "assignedTo", from: userId, to: null, label, detail, stage: m.stage, lodged, hasRegisteredSupervisor: Boolean(m.supervisorId && registered.has(m.supervisorId) && m.supervisorId !== userId) });
      if (scopes.includes("supervision") && m.supervisorId === userId) out.push({ scope: "supervision", entity: "matter", id: m.id, field: "supervisorId", from: userId, to: null, label, detail, stage: m.stage, lodged });
    }
  }
  if (scopes.includes("clients")) {
    const rows = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.assignedTo, userId), notInArray(s.clients.stage, ["past", "lost"])));
    for (const c of rows) out.push({ scope: "clients", entity: "client", id: c.id, field: "assignedTo", from: userId, to: null, label: `${c.firstName} ${c.lastName}`, detail: c.stage.replace("_", " ") });
  }
  if (scopes.includes("tasks")) {
    const rows = await db.select().from(s.tasks).where(and(eq(s.tasks.agencyId, agencyId), eq(s.tasks.assignedTo, userId), ne(s.tasks.status, "done")));
    for (const t of rows) out.push({ scope: "tasks", entity: "task", id: t.id, field: "assignedTo", from: userId, to: null, label: t.title, detail: t.dueAt ? `due ${new Date(t.dueAt).toISOString().slice(0, 10)}` : "no due date" });
  }
  if (scopes.includes("appointments")) {
    const rows = await db.select().from(s.appointments).where(and(eq(s.appointments.agencyId, agencyId), eq(s.appointments.staffId, userId), gte(s.appointments.startsAt, new Date())));
    for (const a of rows) out.push({ scope: "appointments", entity: "appointment", id: a.id, field: "staffId", from: userId, to: null, label: a.title, detail: a.startsAt.toISOString().slice(0, 16).replace("T", " ") });
  }
  if (scopes.includes("applications")) {
    const rows = await db
      .select({ a: s.studentApplications, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.studentApplications)
      .innerJoin(s.clients, eq(s.clients.id, s.studentApplications.clientId))
      .where(and(eq(s.studentApplications.agencyId, agencyId), eq(s.studentApplications.assignedTo, userId), notInArray(s.studentApplications.status, ["rejected", "withdrawn"])));
    for (const { a, first, last } of rows) out.push({ scope: "applications", entity: "application", id: a.id, field: "assignedTo", from: userId, to: null, label: `${first} ${last}`, detail: a.course });
  }
  return out;
}

const TABLE = { matter: s.matters, client: s.clients, task: s.tasks, appointment: s.appointments, application: s.studentApplications } as const;

/** Sets one field on one record, only if it still holds the expected value. Returns whether it changed. */
export async function applyItem(agencyId: string, item: HandoverItem, value: string | null, expect: string | null) {
  const t = TABLE[item.entity];
  const col = (t as unknown as Record<string, typeof s.matters.assignedTo>)[item.field];
  const rows = await db
    .update(t)
    .set({ [item.field]: value } as never)
    .where(and(eq(t.agencyId, agencyId), eq(t.id, item.id), expect == null ? undefined : eq(col, expect)))
    .returning({ id: t.id });
  return rows.length > 0;
}

/** Puts every item of a cover handover back, unless someone has changed it since. */
export async function returnHandover(agencyId: string, id: string, actor: { id: string | null; name: string }) {
  const [h] = await db.select().from(s.handovers).where(and(eq(s.handovers.agencyId, agencyId), eq(s.handovers.id, id)));
  if (!h || h.status !== "active") return { returned: 0, kept: 0, error: "This handover isn't active." };
  const members = new Set((await db.select({ id: s.member.userId }).from(s.member).where(eq(s.member.organizationId, agencyId))).map((m) => m.id));
  let returned = 0;
  let kept = 0;
  for (const it of h.items) {
    if (it.from && !members.has(it.from)) {
      kept++;
      continue;
    }
    // Appointments that have already happened stay with whoever covered them.
    if (it.entity === "appointment") {
      const [a] = await db.select({ at: s.appointments.startsAt }).from(s.appointments).where(eq(s.appointments.id, it.id));
      if (!a || a.at < new Date()) {
        kept++;
        continue;
      }
    }
    if (await applyItem(agencyId, it, it.from, it.to)) returned++;
    else kept++;
  }
  await db.update(s.handovers).set({ status: "returned", returnedAt: new Date() }).where(eq(s.handovers.id, id));
  await db.insert(s.auditLog).values({ agencyId, actorId: actor.id, actorName: actor.name, action: "handover", entity: "handover", entityId: id, detail: { summary: [`Cover ended: ${returned} item${returned === 1 ? "" : "s"} returned, ${kept} left as they are`] } });
  return { returned, kept, error: null };
}

/** Cover handovers whose return date has arrived (run daily). */
export async function dueReturns() {
  const today = new Date().toISOString().slice(0, 10);
  return db.select({ id: s.handovers.id, agencyId: s.handovers.agencyId }).from(s.handovers).where(and(eq(s.handovers.status, "active"), eq(s.handovers.mode, "cover"), lte(s.handovers.returnOn, today)));
}
