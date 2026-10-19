"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { LMT_STATUSES, NOMINATION_PROGRAMS, NOMINATION_STATUSES, programLabel, statusOf, suggestedApprovalExpiry } from "@/lib/nominations";
import { requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const blank = (v: FormDataEntryValue | null) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();

const input = z.object({
  employerId: z.string().min(1),
  program: z.enum(NOMINATION_PROGRAMS.map((p) => p.value) as [string, ...string[]], { message: "Choose the program." }),
  positionTitle: z.string().min(1, "Enter the position title.").max(120),
  anzsco: z.string().regex(/^\d{6}$/, "ANZSCO codes have 6 digits.").nullable(),
  salary: z.string().nullable(),
  worksite: z.string().max(200).nullable(),
  status: z.enum(NOMINATION_STATUSES.map((p) => p.value) as [string, ...string[]]),
  lmt: z.enum(LMT_STATUSES.map((p) => p.value) as [string, ...string[]]),
  trn: z.string().max(40).nullable(),
  lodgedAt: date,
  clientId: z.string().nullable(),
  matterId: z.string().nullable(),
  notes: z.string().max(4000).nullable(),
});

export async function createNomination(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const salaryRaw = blank(f.get("salary"));
    const v = input.parse({
      employerId: blank(f.get("employerId")) ?? "",
      program: blank(f.get("program")) ?? "",
      positionTitle: blank(f.get("positionTitle")) ?? "",
      anzsco: blank(f.get("anzsco")),
      salary: salaryRaw ? Number(salaryRaw.replace(/[$,\s]/g, "")).toFixed(2) : null,
      worksite: blank(f.get("worksite")),
      status: blank(f.get("status")) ?? "preparing",
      lmt: blank(f.get("lmt")) ?? "needed",
      trn: blank(f.get("trn")),
      lodgedAt: blank(f.get("lodgedAt")),
      clientId: blank(f.get("clientId")),
      matterId: blank(f.get("matterId")),
      notes: blank(f.get("notes")),
    });
    if (v.salary && !Number.isFinite(Number(v.salary))) return { ok: false, error: "Salary must be a number." };
    const [emp] = await db.select({ id: s.employers.id, name: s.employers.name }).from(s.employers).where(and(eq(s.employers.agencyId, ctx.agencyId), eq(s.employers.id, v.employerId)));
    if (!emp) return { ok: false, error: "Employer not found." };
    let clientId = v.clientId;
    if (v.matterId) {
      const [m] = await db.select({ clientId: s.matters.clientId }).from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, v.matterId)));
      if (!m) return { ok: false, error: "Case not found." };
      clientId = clientId ?? m.clientId;
      // The visa case is sponsored by this employer.
      await db.update(s.matters).set({ employerId: emp.id }).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, v.matterId)));
    }
    if (clientId) {
      const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
      if (!c) return { ok: false, error: "Client not found." };
    }
    const [row] = await db
      .insert(s.nominations)
      .values({ agencyId: ctx.agencyId, ...v, clientId, assignedTo: ctx.userId })
      .returning({ id: s.nominations.id });
    const title = `Nomination: ${v.positionTitle} (${programLabel(v.program)})`;
    if (clientId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, matterId: v.matterId, kind: "system", title, body: `Sponsor ${emp.name} · ${statusOf(v.status).label}`, actorId: ctx.userId, actorName: ctx.name });
    const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "nomination", entityId: row.id, detail: { employer: emp.name, position: v.positionTitle } }).returning({ id: s.auditLog.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id, undo: log.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the nomination." };
    return fail(e);
  }
}

/** Moves a nomination; on approval the last day to lodge the visa is suggested when it's empty. */
export async function setNominationStatus(id: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    if (!NOMINATION_STATUSES.some((x) => x.value === status)) return { ok: false, error: "Unknown status." };
    const [n] = await db.select().from(s.nominations).where(and(eq(s.nominations.agencyId, ctx.agencyId), eq(s.nominations.id, id)));
    if (!n) return { ok: false, error: "Nomination not found." };
    const today = new Date().toISOString().slice(0, 10);
    const set: Partial<typeof s.nominations.$inferInsert> = { status, updatedAt: new Date() };
    if (status === "lodged" && !n.lodgedAt) set.lodgedAt = today;
    if (["approved", "refused"].includes(status) && !n.decidedAt) set.decidedAt = today;
    if (status === "approved" && !n.approvalExpires) set.approvalExpires = suggestedApprovalExpiry(n.program, n.decidedAt ?? today);
    await db.update(s.nominations).set(set).where(eq(s.nominations.id, id));
    if (n.clientId) await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: n.clientId, matterId: n.matterId, kind: "stage", title: `Nomination ${statusOf(status).label.toLowerCase()}: ${n.positionTitle}`, actorId: ctx.userId, actorName: ctx.name });
    const [log] = await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "nomination", entityId: id, detail: { before: { status: n.status }, after: { status } } }).returning({ id: s.auditLog.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, undo: log.id };
  } catch (e) {
    return fail(e);
  }
}
