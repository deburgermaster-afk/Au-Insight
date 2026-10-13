"use server";

import { and, eq, gte, inArray, ne, notInArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { COMMISSION_BAN_FROM, releaseNeeded, transferChecks } from "@/lib/course-transfer";
import { agencyTag } from "@/lib/data";
import { notifyStaff } from "@/lib/notify";
import { marnCurrent } from "@/lib/permissions";
import { type Ctx, requireCap, requireRole } from "@/lib/session";
import { visaByCode } from "@/lib/visas";
import { checklistFor } from "@/lib/workflow";
import { workflowFor } from "@/lib/workflow-server";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const audit = (ctx: Ctx, action: string, entity: string, entityId: string, detail: Record<string, unknown>) =>
  db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action, entity, entityId, detail });
const timeline = (ctx: Ctx, e: { clientId: string | null; matterId?: string | null; title: string; body?: string | null; kind?: string }) =>
  db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: e.clientId, matterId: e.matterId ?? null, kind: e.kind ?? "system", title: e.title, body: e.body ?? null });

/** People in the agency, with whether they can act as a registered migration agent. */
async function staffOf(agencyId: string) {
  const rows = await db
    .select({ id: s.user.id, name: s.user.name, email: s.user.email, position: s.staffProfiles.position, marn: s.staffProfiles.marn, marnExpiry: s.staffProfiles.marnExpiry })
    .from(s.member)
    .innerJoin(s.user, eq(s.user.id, s.member.userId))
    .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, agencyId)))
    .where(eq(s.member.organizationId, agencyId));
  return rows.map((r) => ({ ...r, registered: (r.position === "principal" || r.position === "migration_agent") && marnCurrent(r.marn, r.marnExpiry) }));
}

const LODGED = ["lodged", "rfi", "decision"];

/** Hands a case to another case officer and/or supervisor, optionally with its open tasks and upcoming appointments. */
export async function reassignMatter(matterId: string, input: { assignedTo: string | null; supervisorId: string | null; moveTasks: boolean; moveAppointments: boolean; note: string }): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    if (!m) return { ok: false, error: "Case not found." };
    const staff = await staffOf(ctx.agencyId);
    const to = input.assignedTo ? staff.find((x) => x.id === input.assignedTo) : null;
    const sup = input.supervisorId ? staff.find((x) => x.id === input.supervisorId) : null;
    if (input.assignedTo && !to) return { ok: false, error: "Pick someone in your agency." };
    if (input.supervisorId && !sup) return { ok: false, error: "Pick a supervisor in your agency." };
    if (sup && !sup.registered) return { ok: false, error: `${sup.name} isn't a registered migration agent with a current MARN, so can't supervise.` };
    // Someone has to be able to give immigration assistance on a live case.
    const officer = to ?? staff.find((x) => x.id === m.assignedTo);
    const supervisor = sup ?? (input.supervisorId === null ? null : staff.find((x) => x.id === m.supervisorId));
    if (!officer?.registered && !supervisor?.registered && m.stage !== "closed" && m.stage !== "enquiry")
      return { ok: false, error: `${officer?.name ?? "The new case officer"} isn't a registered agent. Add a registered supervisor so someone can give immigration assistance.` };
    if (LODGED.includes(m.stage) && to && !to.registered && !supervisor?.registered) return { ok: false, error: "This case is lodged: it needs a registered agent as case officer or supervisor." };
    const set: Partial<typeof s.matters.$inferInsert> = {};
    if (input.assignedTo !== m.assignedTo) set.assignedTo = input.assignedTo;
    if (input.supervisorId !== m.supervisorId) set.supervisorId = input.supervisorId;
    if (!Object.keys(set).length) return { ok: false, error: "Nothing changed." };
    await db.update(s.matters).set(set).where(eq(s.matters.id, matterId));
    let tasks = 0;
    let appts = 0;
    if ("assignedTo" in set && input.assignedTo && m.assignedTo) {
      if (input.moveTasks) {
        const moved = await db.update(s.tasks).set({ assignedTo: input.assignedTo }).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, matterId), eq(s.tasks.assignedTo, m.assignedTo), ne(s.tasks.status, "done"))).returning({ id: s.tasks.id });
        tasks = moved.length;
      }
      if (input.moveAppointments) {
        const moved = await db.update(s.appointments).set({ staffId: input.assignedTo }).where(and(eq(s.appointments.agencyId, ctx.agencyId), eq(s.appointments.matterId, matterId), eq(s.appointments.staffId, m.assignedTo), gte(s.appointments.startsAt, new Date()))).returning({ id: s.appointments.id });
        appts = moved.length;
      }
    }
    const name = (id: string | null | undefined) => staff.find((x) => x.id === id)?.name ?? "nobody";
    const lines = [
      "assignedTo" in set ? `Case officer: ${name(m.assignedTo)} → ${name(input.assignedTo)}` : null,
      "supervisorId" in set ? `Supervisor: ${name(m.supervisorId)} → ${name(input.supervisorId)}` : null,
      tasks ? `${tasks} open task${tasks === 1 ? "" : "s"} moved` : null,
      appts ? `${appts} upcoming appointment${appts === 1 ? "" : "s"} moved` : null,
      input.note.trim() ? `Handover note: ${input.note.trim()}` : null,
    ].filter(Boolean) as string[];
    await timeline(ctx, { clientId: m.clientId, matterId, title: `Case ${m.reference} handed over`, body: lines.join("\n"), kind: "note" });
    await audit(ctx, "transfer", "matter", matterId, { summary: lines, note: input.note.trim() || undefined });
    const notify = [to, sup].filter((x): x is NonNullable<typeof x> => Boolean(x) && x!.id !== ctx.userId);
    if (notify.length)
      await notifyStaff(
        notify.map((x) => x.email),
        `${ctx.name} handed you case ${m.reference}`,
        { heading: `Case ${m.reference}: ${m.title}`, lines: [`${ctx.name} made you ${notify.length === 2 ? "case officer or supervisor" : to && notify.includes(to) ? "case officer" : "supervisor"}.`, ...lines], cta: { label: "Open the case", path: `/app/matters/${matterId}` } },
      ).catch(() => undefined);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Moves a case to a different client (wrong client, or the applicant changed), with its documents and open work. */
export async function moveMatterToClient(matterId: string, clientId: string, note: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!m || !c) return { ok: false, error: "Case or client not found." };
    if (m.clientId === clientId) return { ok: false, error: "It's already on that client." };
    const [paid] = await db.select({ id: s.invoices.id }).from(s.invoices).where(and(eq(s.invoices.matterId, matterId), ne(s.invoices.paid, "0"), ne(s.invoices.status, "void"))).limit(1);
    if (paid) return { ok: false, error: "Money has been received on this case's invoices. Payments belong to the original client: duplicate the case for the new client instead." };
    const [signed] = await db.select({ id: s.serviceAgreements.id }).from(s.serviceAgreements).where(and(eq(s.serviceAgreements.matterId, matterId), eq(s.serviceAgreements.status, "signed"))).limit(1);
    if (signed) return { ok: false, error: "The original client signed the service agreement for this case. Duplicate it for the new client and send them their own agreement." };
    if (!note.trim()) return { ok: false, error: "Say why the case is moving." };
    const from = m.clientId;
    await db.batch([
      db.update(s.matters).set({ clientId }).where(eq(s.matters.id, matterId)),
      db.update(s.documents).set({ clientId }).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.matterId, matterId))),
      db.update(s.tasks).set({ clientId }).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, matterId))),
      db.update(s.appointments).set({ clientId }).where(and(eq(s.appointments.agencyId, ctx.agencyId), eq(s.appointments.matterId, matterId))),
      db.update(s.invoices).set({ clientId }).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.matterId, matterId))),
      db.update(s.activities).set({ clientId }).where(and(eq(s.activities.agencyId, ctx.agencyId), eq(s.activities.matterId, matterId))),
      db.update(s.messages).set({ clientId }).where(and(eq(s.messages.agencyId, ctx.agencyId), eq(s.messages.matterId, matterId))),
      db.update(s.serviceAgreements).set({ status: "void" }).where(and(eq(s.serviceAgreements.matterId, matterId), ne(s.serviceAgreements.status, "signed"))),
    ]);
    const [old] = await db.select({ first: s.clients.firstName, last: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, from));
    const body = `From ${old ? `${old.first} ${old.last}` : "another client"} to ${c.firstName} ${c.lastName}. ${note.trim()}`;
    await timeline(ctx, { clientId, matterId, title: `Case ${m.reference} moved to this client`, body });
    await timeline(ctx, { clientId: from, title: `Case ${m.reference} moved to ${c.firstName} ${c.lastName}`, body: note.trim() });
    await audit(ctx, "transfer", "matter", matterId, { summary: [`Client: ${old?.first ?? ""} ${old?.last ?? ""} → ${c.firstName} ${c.lastName}`], note: note.trim(), from, to: clientId });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Changes the visa a case is for (e.g. 482 → 186), merging the new checklist without losing received documents. */
export async function changeMatterVisa(matterId: string, input: { visaCode: string; stream: string | null; note: string }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("immigration", "Only a registered migration agent can change what's being applied for.");
    const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    if (!m) return { ok: false, error: "Case not found." };
    if (LODGED.includes(m.stage)) return { ok: false, error: "This case is already lodged. Open a new case for a different visa." };
    const visa = visaByCode(input.visaCode);
    if (!visa) return { ok: false, error: "Pick a visa from the library." };
    if (visa.code === m.visaCode && (input.stream ?? null) === (m.stream ?? null)) return { ok: false, error: "That's the visa it's already for." };
    const items = await db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, matterId));
    const wanted = checklistFor(await workflowFor(ctx.agencyId), visa.code).items;
    const key = (x: string) => x.trim().toLowerCase();
    const have = new Set(items.map((i) => key(i.label)));
    const add = wanted.filter((w) => !have.has(key(w.label)));
    const wantedSet = new Set(wanted.map((w) => key(w.label)));
    const drop = items.filter((i) => !wantedSet.has(key(i.label)) && (i.status === "needed" || i.status === "requested") && !i.documentId);
    const oldVisa = visaByCode(m.visaCode);
    const defaultTitle = oldVisa ? `${oldVisa.name} (${oldVisa.code})` : m.visaCode;
    const maxSort = items.reduce((a, i) => Math.max(a, i.sort), 0);
    await db.batch([
      db.update(s.matters).set({ visaCode: visa.code, stream: input.stream, ...(m.title === defaultTitle ? { title: `${visa.name} (${visa.code})` } : {}) }).where(eq(s.matters.id, matterId)),
      ...(drop.length ? [db.update(s.checklistItems).set({ status: "waived", note: `Not needed for ${visa.code}` }).where(inArray(s.checklistItems.id, drop.map((d) => d.id)))] : []),
      ...(add.length ? [db.insert(s.checklistItems).values(add.map((a, i) => ({ agencyId: ctx.agencyId, matterId, category: a.category, label: a.label, required: a.required, sort: maxSort + 1 + i })))] : []),
    ]);
    const lines = [`Visa: ${m.visaCode}${m.stream ? ` (${m.stream})` : ""} → ${visa.code}${input.stream ? ` (${input.stream})` : ""}`, `${add.length} checklist item${add.length === 1 ? "" : "s"} added, ${drop.length} no longer needed (waived), received documents kept`];
    if (input.note.trim()) lines.push(input.note.trim());
    await timeline(ctx, { clientId: m.clientId, matterId, title: `Changed to ${visa.name} (${visa.code})`, body: lines.join("\n") });
    await audit(ctx, "transfer", "matter", matterId, { summary: lines, note: input.note.trim() || undefined });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Starts a new case from an existing one: same or different client and visa, a fresh checklist, the same team. */
export async function duplicateMatter(matterId: string, input: { clientId: string | null; visaCode: string | null; title: string | null; keepReceived: boolean }): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    if (!m) return { ok: false, error: "Case not found." };
    const clientId = input.clientId ?? m.clientId;
    const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    const visaCode = input.visaCode ?? m.visaCode;
    const visa = visaByCode(visaCode);
    const wf = await workflowFor(ctx.agencyId);
    const count = (await db.select({ id: s.matters.id }).from(s.matters).where(eq(s.matters.agencyId, ctx.agencyId))).length;
    const reference = `${wf.referencePrefix || "LDG"}-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
    const [row] = await db
      .insert(s.matters)
      .values({
        agencyId: ctx.agencyId,
        clientId,
        visaCode,
        stream: visaCode === m.visaCode ? m.stream : null,
        reference,
        title: input.title?.trim() || (visa ? `${visa.name} (${visa.code})` : m.title),
        stage: "engaged",
        priority: m.priority,
        assignedTo: m.assignedTo,
        supervisorId: m.supervisorId,
        employerId: m.employerId,
        occupation: m.occupation,
        anzsco: m.anzsco,
        feeProfessional: m.feeProfessional,
        feeGovernment: m.feeGovernment,
        notes: `Started from ${m.reference}.`,
      })
      .returning({ id: s.matters.id });
    const source = visaCode === m.visaCode ? await db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, matterId)) : [];
    const list = source.length ? source.map((i) => ({ category: i.category, label: i.label, required: i.required, note: i.note, sort: i.sort, received: i.status === "received" || i.status === "approved", documentId: i.documentId })) : checklistFor(wf, visaCode).items.map((i, n) => ({ ...i, note: null, sort: n, received: false, documentId: null }));
    if (list.length)
      await db.insert(s.checklistItems).values(
        list.map((i) => ({ agencyId: ctx.agencyId, matterId: row.id, category: i.category, label: i.label, required: i.required, note: i.note, sort: i.sort, ...(input.keepReceived && i.received && clientId === m.clientId ? { status: "received" as const, documentId: i.documentId } : {}) })),
      );
    await timeline(ctx, { clientId, matterId: row.id, title: `Case ${reference} opened from ${m.reference}`, body: visa ? `${visa.name} (${visa.code})` : visaCode });
    await audit(ctx, "create", "matter", row.id, { summary: [`Duplicated from ${m.reference}`], from: matterId });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Gives a client a new case officer, and optionally their open cases too. */
export async function reassignClient(clientId: string, userId: string, alsoCases: boolean, note: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    const staff = await staffOf(ctx.agencyId);
    const to = staff.find((x) => x.id === userId);
    if (!to) return { ok: false, error: "Pick someone in your agency." };
    await db.update(s.clients).set({ assignedTo: userId }).where(eq(s.clients.id, clientId));
    let cases = 0;
    if (alsoCases) {
      const open = await db.select({ id: s.matters.id, supervisorId: s.matters.supervisorId }).from(s.matters).where(and(eq(s.matters.clientId, clientId), notInArray(s.matters.stage, ["closed"])));
      for (const m of open) {
        const r = await reassignMatter(m.id, { assignedTo: userId, supervisorId: m.supervisorId, moveTasks: true, moveAppointments: true, note });
        if (r.ok) cases++;
      }
    }
    const from = staff.find((x) => x.id === c.assignedTo)?.name ?? "nobody";
    const lines = [`Case officer: ${from} → ${to.name}`, cases ? `${cases} open case${cases === 1 ? "" : "s"} moved too` : null, note.trim() ? `Note: ${note.trim()}` : null].filter(Boolean) as string[];
    await timeline(ctx, { clientId, title: "Client handed over", body: lines.join("\n"), kind: "note" });
    await audit(ctx, "transfer", "client", clientId, { summary: lines, note: note.trim() || undefined });
    if (to.id !== ctx.userId) await notifyStaff([to.email], `${ctx.name} handed you ${c.firstName} ${c.lastName}`, { heading: `${c.firstName} ${c.lastName} is now yours`, lines, cta: { label: "Open the client", path: `/app/clients/${clientId}` } }).catch(() => undefined);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Course or provider change: the old application is closed as transferred and a new one opens,
 * linked to it, with the release letter, visa and commission consequences worked out.
 */
export async function transferCourse(
  appId: string,
  input: { institutionId: string | null; providerName: string | null; course: string; courseCode: string | null; aqfLevel: number | null; intake: string | null; courseStart: string | null; tuitionFee: string | null; reason: string; transferOn: string },
): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education", "Only education agents can transfer courses.");
    const [a] = await db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, appId)));
    if (!a) return { ok: false, error: "Application not found." };
    if (a.status === "withdrawn" || a.status === "rejected") return { ok: false, error: "This application is already closed." };
    if (!input.course.trim()) return { ok: false, error: "Name the new course." };
    if (!input.reason.trim()) return { ok: false, error: "Record why the student is changing." };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.transferOn)) return { ok: false, error: "Set the date of the change." };
    let institutionId = input.institutionId;
    if (!institutionId && input.providerName?.trim()) {
      const [made] = await db.insert(s.institutions).values({ agencyId: ctx.agencyId, name: input.providerName.trim() }).returning({ id: s.institutions.id });
      institutionId = made.id;
    }
    if (!institutionId) institutionId = a.institutionId;
    const [inst] = institutionId ? await db.select().from(s.institutions).where(and(eq(s.institutions.agencyId, ctx.agencyId), eq(s.institutions.id, institutionId))) : [];
    const [client] = await db.select({ onshore: s.clients.onshore, first: s.clients.firstName, last: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, a.clientId));
    const sameProvider = Boolean(institutionId && institutionId === a.institutionId);
    const facts = { sameProvider, fromStatus: a.status, fromAqf: a.aqfLevel, toAqf: input.aqfLevel, fromStart: a.courseStart, transferOn: input.transferOn, onshore: Boolean(client?.onshore) };
    const checks = transferChecks(facts);
    const onshoreTransfer = !sameProvider && (Boolean(client?.onshore) || ["coe", "enrolled"].includes(a.status));
    const [made] = await db
      .insert(s.studentApplications)
      .values({
        agencyId: ctx.agencyId,
        clientId: a.clientId,
        institutionId,
        course: input.course.trim(),
        courseCode: input.courseCode,
        aqfLevel: input.aqfLevel,
        intake: input.intake,
        courseStart: input.courseStart,
        tuitionFee: input.tuitionFee,
        commissionRate: inst?.commissionRate ?? a.commissionRate,
        commissionStatus: onshoreTransfer && input.transferOn > COMMISSION_BAN_FROM ? "ineligible" : "not_due",
        onshoreTransfer,
        assignedTo: a.assignedTo ?? ctx.userId,
        transferredFromId: a.id,
        transferReason: input.reason.trim(),
        releaseLetter: releaseNeeded(facts) ? "needed" : "not_needed",
        status: "preparing",
        notes: checks.map((c) => `• ${c.text}`).join("\n") || null,
      })
      .returning({ id: s.studentApplications.id });
    await db
      .update(s.studentApplications)
      .set({ status: "withdrawn", notes: [a.notes, `Transferred ${input.transferOn} to ${input.course.trim()}${inst ? ` at ${inst.name}` : ""}: ${input.reason.trim()}`].filter(Boolean).join("\n") })
      .where(eq(s.studentApplications.id, a.id));
    const lines = [`${a.course} → ${input.course.trim()}${inst ? ` (${inst.name})` : ""}`, `Reason: ${input.reason.trim()}`, ...checks.map((c) => c.text)];
    await timeline(ctx, { clientId: a.clientId, title: sameProvider ? "Course changed" : "Provider transfer started", body: lines.join("\n"), kind: "stage" });
    await audit(ctx, "transfer", "application", made.id, { summary: lines.slice(0, 2), from: a.id, checks });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

/** Tracks the release letter from the old provider. */
export async function setReleaseLetter(appId: string, status: "needed" | "requested" | "granted" | "refused" | "not_needed"): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const [a] = await db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, appId)));
    if (!a) return { ok: false, error: "Application not found." };
    await db.update(s.studentApplications).set({ releaseLetter: status }).where(eq(s.studentApplications.id, appId));
    await timeline(ctx, { clientId: a.clientId, title: `Release letter: ${status.replace("_", " ")}`, body: a.course, kind: "stage" });
    await audit(ctx, "update", "application", appId, { summary: [`Release letter: ${a.releaseLetter} → ${status}`] });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
