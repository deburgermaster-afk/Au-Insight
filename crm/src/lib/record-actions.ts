"use server";

import { and, asc, eq, getTableColumns, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { type EntityKey, type FieldSpec, SPECS } from "@/lib/record-specs";
import { repeatTask } from "@/lib/task-repeat";
import { type Ctx, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

// Each editable entity, its table, and where it sits on a client's or case's timeline.
const TABLES = {
  client: s.clients,
  matter: s.matters,
  task: s.tasks,
  appointment: s.appointments,
  employer: s.employers,
  institution: s.institutions,
  application: s.studentApplications,
  dependant: s.dependants,
  checklist: s.checklistItems,
  document: s.documents,
  nomination: s.nominations,
} as const;

const INT_KEYS = new Set(["aqfLevel", "pointsClaimed"]);

type Row = Record<string, unknown> & { id: string; agencyId: string };

async function loadRow(entity: EntityKey, agencyId: string, id: string): Promise<Row | null> {
  const t = TABLES[entity];
  const [r] = await db.select().from(t).where(and(eq(t.agencyId, agencyId), eq(t.id, id)));
  return (r as Row) ?? null;
}

/** Converts a submitted form value to what the column stores. */
function convert(f: FieldSpec, raw: FormDataEntryValue | null, present: boolean): unknown {
  if (f.type === "boolean") return raw === "on" || raw === "true";
  if (!present) return undefined;
  const v = typeof raw === "string" ? raw.trim() : "";
  if (f.type === "tags")
    return v
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
  if (v === "") return null;
  if (f.type === "datetime") {
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) throw new Error(`${f.label} isn't a valid date and time.`);
    return d;
  }
  if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(`${f.label} isn't a valid date.`);
  if (f.type === "date" && f.stamp) return new Date(v); // midnight UTC, same as new tasks
  if (f.type === "number" || f.type === "money" || INT_KEYS.has(f.key)) {
    const n = Number(v.replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n)) throw new Error(`${f.label} must be a number.`);
    return INT_KEYS.has(f.key) ? Math.round(n) : f.type === "money" ? n.toFixed(2) : String(n);
  }
  if (f.type === "select" && f.options && !f.options.some((o) => o.value === v)) throw new Error(`Pick a ${f.label.toLowerCase()} from the list.`);
  return v;
}

const norm = (v: unknown) => (v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.join(", ") : v == null || v === "" ? null : String(v));

async function names(ids: string[]) {
  const list = ids.filter(Boolean);
  if (!list.length) return new Map<string, string>();
  const rows = await db.select({ id: s.user.id, name: s.user.name }).from(s.user).where(inArray(s.user.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Where a record's changes show on the timeline. */
async function timelineOf(entity: EntityKey, row: Row): Promise<{ clientId: string | null; matterId: string | null }> {
  if (entity === "client") return { clientId: row.id, matterId: null };
  if (entity === "matter") return { clientId: row.clientId as string, matterId: row.id };
  if (entity === "checklist") {
    const [m] = await db.select({ clientId: s.matters.clientId }).from(s.matters).where(eq(s.matters.id, row.matterId as string));
    return { clientId: m?.clientId ?? null, matterId: row.matterId as string };
  }
  return { clientId: (row.clientId as string) ?? null, matterId: (row.matterId as string) ?? null };
}

async function checkRefs(ctx: Ctx, values: Record<string, unknown>, fields: FieldSpec[]) {
  for (const f of fields) {
    const v = values[f.key];
    if (v == null || v === undefined) continue;
    if (f.type === "user") {
      const [m] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.userId, String(v))));
      if (!m) throw new Error(`${f.label} must be someone in your agency.`);
    }
    if (f.type === "employer") {
      const [e] = await db.select({ id: s.employers.id }).from(s.employers).where(and(eq(s.employers.agencyId, ctx.agencyId), eq(s.employers.id, String(v))));
      if (!e) throw new Error("Pick a sponsor from your employers.");
    }
    if (f.type === "institution") {
      const [i] = await db.select({ id: s.institutions.id }).from(s.institutions).where(and(eq(s.institutions.agencyId, ctx.agencyId), eq(s.institutions.id, String(v))));
      if (!i) throw new Error("Pick a provider from your institutions.");
    }
  }
}

/** Saves any editable record. Only fields in its spec are accepted; every change is audited with before and after. */
export async function saveRecord(entity: EntityKey, id: string, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const spec = SPECS[entity];
    if (!spec) return { ok: false, error: "Unknown record." };
    if (spec.cap && !ctx.caps.includes(spec.cap)) return { ok: false, error: `Your role can't edit ${spec.label}s.` };
    const row = await loadRow(entity, ctx.agencyId, id);
    if (!row) return { ok: false, error: "Not found." };
    const values: Record<string, unknown> = {};
    for (const f of spec.fields) {
      const present = form.has(f.key) || f.type === "boolean";
      if (f.type === "boolean" && !form.has(`${f.key}__shown`)) continue;
      const v = convert(f, form.get(f.key), present);
      if (v === undefined) continue;
      if (f.required && (v == null || v === "")) return { ok: false, error: `${f.label} is required.` };
      values[f.key] = v;
    }
    if (entity === "appointment" && values.startsAt instanceof Date && values.endsAt instanceof Date && values.endsAt <= values.startsAt) return { ok: false, error: "The appointment ends before it starts." };
    // Only keep real changes, and check permission per changed field.
    const changes: Record<string, [string | null, string | null]> = {};
    const set: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      const f0 = spec.fields.find((x) => x.key === k)!;
      const numeric = f0.type === "money" || f0.type === "number";
      const before = f0.stamp ? (row[k] ? new Date(row[k] as string).toISOString().slice(0, 10) : null) : numeric && row[k] != null ? String(Number(row[k])) : norm(row[k]);
      const after = f0.stamp ? (v ? (v as Date).toISOString().slice(0, 10) : null) : numeric && v != null ? String(Number(v)) : norm(v);
      if (before === after) continue;
      const f = spec.fields.find((x) => x.key === k)!;
      if (f.cap && !ctx.caps.includes(f.cap)) return { ok: false, error: `Changing ${f.label.toLowerCase()} needs a ${f.cap === "immigration" ? "registered migration agent" : f.cap === "billing" ? "billing role" : `${f.cap} role`}.` };
      changes[k] = [before, after];
      set[k] = v;
    }
    if (!Object.keys(set).length) return { ok: true, id };
    await checkRefs(ctx, set, spec.fields.filter((f) => f.key in set));
    const t = TABLES[entity];
    await db.update(t).set(set).where(and(eq(t.agencyId, ctx.agencyId), eq(t.id, id)));
    if (entity === "task" && set.status === "done") {
      const [task] = await db.select().from(s.tasks).where(eq(s.tasks.id, id));
      if (task) await repeatTask(task);
    }
    if (entity === "application" && "institutionId" in set && set.institutionId && !("commissionRate" in set)) {
      // A different provider means its commission rate, unless staff typed one.
      const [inst] = await db.select({ rate: s.institutions.commissionRate }).from(s.institutions).where(eq(s.institutions.id, String(set.institutionId)));
      if (inst?.rate) await db.update(s.studentApplications).set({ commissionRate: inst.rate }).where(eq(s.studentApplications.id, id));
    }
    // Readable summary for the timeline: people by name, fields by label.
    const people = await names(Object.entries(changes).flatMap(([k, [a, b]]) => (spec.fields.find((f) => f.key === k)?.type === "user" ? [a ?? "", b ?? ""] : [])));
    const show = (k: string, v: string | null) => {
      const f = spec.fields.find((x) => x.key === k)!;
      if (v == null) return "blank";
      if (f.type === "user") return people.get(v) ?? "someone";
      if (f.type === "boolean") return v === "true" ? "yes" : "no";
      if (f.type === "datetime") return new Date(v).toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" });
      if (f.options) return f.options.find((o) => o.value === v)?.label ?? v;
      if (f.type === "employer" || f.type === "institution") return "changed";
      return v.length > 60 ? `${v.slice(0, 57)}…` : v;
    };
    const lines = Object.entries(changes).map(([k, [a, b]]) => `${spec.fields.find((f) => f.key === k)!.label}: ${show(k, a)} → ${show(k, b)}`);
    const where = await timelineOf(entity, { ...row, ...set } as Row);
    if (where.clientId || where.matterId) {
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: where.clientId, matterId: where.matterId, kind: "system", title: `${spec.label.replace(/^\w/, (c) => c.toUpperCase())} updated`, body: lines.join("\n") });
    }
    const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity, entityId: id, detail: { changes, summary: lines } }).returning({ id: s.auditLog.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id, undo: log.id };
  } catch (e) {
    return fail(e);
  }
}

const CREATABLE = new Set<EntityKey>(["dependant", "checklist"]);

/** Adds a family member to a client or an item to a case checklist. */
export async function addRecord(entity: EntityKey, parentId: string, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    if (!CREATABLE.has(entity)) return { ok: false, error: "Can't add that here." };
    const spec = SPECS[entity];
    const values: Record<string, unknown> = {};
    for (const f of spec.fields) {
      if (f.type === "boolean" && !form.has(`${f.key}__shown`)) continue;
      const v = convert(f, form.get(f.key), form.has(f.key) || f.type === "boolean");
      if (v === undefined) continue;
      if (f.required && (v == null || v === "")) return { ok: false, error: `${f.label} is required.` };
      values[f.key] = v;
    }
    if (entity === "dependant") {
      const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, parentId)));
      if (!c) return { ok: false, error: "Client not found." };
      const [r] = await db.insert(s.dependants).values({ agencyId: ctx.agencyId, clientId: parentId, ...(values as { fullName: string; relationship: string }) }).returning({ id: s.dependants.id });
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: parentId, kind: "system", title: "Family member added", body: `${values.fullName} (${values.relationship})` });
      const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity, entityId: r.id }).returning({ id: s.auditLog.id });
      updateTag(agencyTag(ctx.agencyId));
      return { ok: true, id: r.id, undo: log.id };
    }
    const [m] = await db.select({ id: s.matters.id, clientId: s.matters.clientId }).from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, parentId)));
    if (!m) return { ok: false, error: "Case not found." };
    const last = await db.select({ sort: s.checklistItems.sort }).from(s.checklistItems).where(eq(s.checklistItems.matterId, parentId)).orderBy(asc(s.checklistItems.sort));
    const [r] = await db
      .insert(s.checklistItems)
      .values({ agencyId: ctx.agencyId, matterId: parentId, category: (values.category as string) ?? "Other", label: values.label as string, required: (values.required as boolean) ?? true, note: (values.note as string) ?? null, sort: (last.at(-1)?.sort ?? 0) + 1 })
      .returning({ id: s.checklistItems.id });
    const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity, entityId: r.id }).returning({ id: s.auditLog.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: r.id, undo: log.id };
  } catch (e) {
    return fail(e);
  }
}

const DELETABLE = new Set<EntityKey>(["task", "appointment", "dependant", "checklist", "employer", "institution", "nomination"]);

/** Removes a record that's safe to remove. Clients, cases and documents are kept for record keeping. */
export async function deleteRecord(entity: EntityKey, id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    if (!DELETABLE.has(entity)) return { ok: false, error: "That can't be deleted. Close or archive it instead." };
    const spec = SPECS[entity];
    if (spec.cap && !ctx.caps.includes(spec.cap)) return { ok: false, error: `Your role can't remove ${spec.label}s.` };
    if ((entity === "employer" || entity === "institution") && !ctx.caps.includes("team")) return { ok: false, error: "Only admins can remove employers and institutions." };
    const row = await loadRow(entity, ctx.agencyId, id);
    if (!row) return { ok: false, error: "Not found." };
    if (entity === "checklist" && row.documentId) return { ok: false, error: "A document is attached to this item. Waive it instead, or move the document first." };
    const t = TABLES[entity];
    await db.delete(t).where(and(eq(t.agencyId, ctx.agencyId), eq(t.id, id)));
    const where = await timelineOf(entity, row);
    const label = String(row.title ?? row.label ?? row.fullName ?? row.name ?? row.positionTitle ?? "");
    if (where.clientId || where.matterId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: where.clientId, matterId: where.matterId, kind: "system", title: `${spec.label.replace(/^\w/, (c) => c.toUpperCase())} removed`, body: label });
    const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity, entityId: id, detail: { snapshot: JSON.parse(JSON.stringify(row)) } }).returning({ id: s.auditLog.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, undo: log.id };
  } catch (e) {
    return fail(e);
  }
}

/** Moves a checklist item up or down. */
export async function moveChecklistItem(id: string, dir: "up" | "down"): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const row = await loadRow("checklist", ctx.agencyId, id);
    if (!row) return { ok: false, error: "Not found." };
    const items = await db.select({ id: s.checklistItems.id }).from(s.checklistItems).where(eq(s.checklistItems.matterId, row.matterId as string)).orderBy(asc(s.checklistItems.sort), asc(s.checklistItems.createdAt));
    const i = items.findIndex((x) => x.id === id);
    const j = dir === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= items.length) return { ok: true };
    [items[i], items[j]] = [items[j], items[i]];
    await db.batch(items.map((x, n) => db.update(s.checklistItems).set({ sort: n }).where(eq(s.checklistItems.id, x.id))) as [never, ...never[]]);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

type Item = { description: string; quantity: number; unitPrice: number; gst: boolean; disbursement?: boolean };

/** Edits an unpaid invoice's lines and dates, recalculating GST and totals. Paid invoices can't change. */
export async function updateInvoice(id: string, input: { items: Item[]; dueAt: string | null; notes: string | null }): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    if (!ctx.caps.includes("billing")) return { ok: false, error: "Only accounts staff or agents can change invoices." };
    const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, id)));
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (Number(inv.paid) > 0 || inv.status === "paid" || inv.status === "void") return { ok: false, error: "Payments have been received on this invoice. Issue a credit or a new invoice instead." };
    const items = input.items.map((i) => ({ description: i.description.trim(), quantity: Math.max(1, Number(i.quantity) || 1), unitPrice: Math.round((Number(i.unitPrice) || 0) * 100) / 100, gst: Boolean(i.gst), disbursement: !i.gst })).filter((i) => i.description && i.unitPrice > 0);
    if (!items.length) return { ok: false, error: "Add at least one line." };
    if (input.dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueAt)) return { ok: false, error: "Due date isn't valid." };
    const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
    const gst = items.filter((i) => i.gst).reduce((a, i) => a + i.unitPrice * i.quantity * 0.1, 0);
    await db
      .update(s.invoices)
      .set({ items, dueAt: input.dueAt ?? inv.dueAt, notes: input.notes, subtotal: subtotal.toFixed(2), gst: gst.toFixed(2), total: (subtotal + gst).toFixed(2) })
      .where(eq(s.invoices.id, id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "invoice", entityId: id, detail: { changes: { total: [inv.total, (subtotal + gst).toFixed(2)] }, before: inv.items, after: items } });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: inv.clientId, matterId: inv.matterId, kind: "invoice", title: `Invoice ${inv.number} changed`, body: `Total $${Number(inv.total).toFixed(2)} → $${(subtotal + gst).toFixed(2)}` });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function voidInvoice(id: string, reason: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    if (!ctx.caps.includes("billing")) return { ok: false, error: "Only accounts staff or agents can void invoices." };
    const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, id)));
    if (!inv) return { ok: false, error: "Invoice not found." };
    if (Number(inv.paid) > 0) return { ok: false, error: "Money has been received on this invoice. Refund it through trust first." };
    if (!reason.trim()) return { ok: false, error: "Say why it's being voided." };
    await db.update(s.invoices).set({ status: "void", notes: [inv.notes, `Voided: ${reason.trim()}`].filter(Boolean).join("\n") }).where(eq(s.invoices.id, id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "invoice", entityId: id, detail: { changes: { status: [inv.status, "void"] }, reason } });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: inv.clientId, matterId: inv.matterId, kind: "invoice", title: `Invoice ${inv.number} voided`, body: reason.trim() });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Undo: reverses one audited change to a record. An edit puts the old values back (fields changed
 * again since are left alone), an add is removed, a removal is restored from its snapshot. The
 * reversal is itself audited, and its id is returned so it can be redone the same way.
 */
export async function undoAudit(auditId: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [log] = await db.select().from(s.auditLog).where(and(eq(s.auditLog.agencyId, ctx.agencyId), eq(s.auditLog.id, auditId)));
    if (!log) return { ok: false, error: "Nothing to undo." };
    const entity = log.entity as EntityKey;
    const spec = SPECS[entity];
    if (!spec || !(entity in TABLES) || !log.entityId) return { ok: false, error: "This change can't be undone here." };
    const detail = (log.detail ?? {}) as { changes?: Record<string, [string | null, string | null]>; snapshot?: Row };

    if (log.action === "update" && detail.changes) {
      const row = await loadRow(entity, ctx.agencyId, log.entityId);
      if (!row) return { ok: false, error: "That record no longer exists." };
      const f = new FormData();
      let n = 0;
      for (const [k, [before, after]] of Object.entries(detail.changes)) {
        const fld = spec.fields.find((x) => x.key === k);
        if (!fld) continue;
        // Skip a field someone has changed again since: undo shouldn't overwrite newer work.
        const numeric = fld.type === "money" || fld.type === "number";
        const now = fld.stamp ? (row[k] ? new Date(row[k] as string).toISOString().slice(0, 10) : null) : numeric && row[k] != null ? String(Number(row[k])) : norm(row[k]);
        if (now !== after) continue;
        if (fld.type === "boolean") {
          f.set(`${k}__shown`, "1");
          if (before === "true") f.set(k, "on");
        } else f.set(k, before ?? "");
        n++;
      }
      if (!n) return { ok: false, error: "Those fields have been changed again since, so there's nothing to undo." };
      return saveRecord(entity, log.entityId, f);
    }

    if (log.action === "create" || log.action === "restore") return deleteRecord(entity, log.entityId);

    if (log.action === "delete" && detail.snapshot) {
      if (!DELETABLE.has(entity)) return { ok: false, error: "This can't be restored." };
      if (spec.cap && !ctx.caps.includes(spec.cap)) return { ok: false, error: `Your role can't restore ${spec.label}s.` };
      const snap = detail.snapshot;
      if (snap.agencyId !== ctx.agencyId) return { ok: false, error: "Nothing to undo." };
      const t = TABLES[entity];
      // JSON turned dates into strings: give timestamp columns real dates again.
      const cols = getTableColumns(t) as Record<string, { columnType: string }>;
      const values: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(snap)) {
        if (!(k in cols)) continue;
        values[k] = v != null && cols[k].columnType === "PgTimestamp" ? new Date(v as string) : v;
      }
      await db.insert(t).values(values as never).onConflictDoNothing();
      const where = await timelineOf(entity, snap);
      const label = String(snap.title ?? snap.label ?? snap.fullName ?? snap.name ?? "");
      if (where.clientId || where.matterId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: where.clientId, matterId: where.matterId, kind: "system", title: `${spec.label.replace(/^\w/, (c) => c.toUpperCase())} restored`, body: label });
      const [r] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "restore", entity, entityId: log.entityId, detail: { from: auditId } }).returning({ id: s.auditLog.id });
      updateTag(agencyTag(ctx.agencyId));
      return { ok: true, id: log.entityId, undo: r.id };
    }
    return { ok: false, error: "This change can't be undone." };
  } catch (e) {
    return fail(e);
  }
}
