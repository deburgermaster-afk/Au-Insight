import "server-only";
import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { WorkflowConfig } from "@/db/crm-schema";
import { ruleMatches } from "@/lib/workflow";

export async function workflowFor(agencyId: string): Promise<WorkflowConfig> {
  const [r] = await db.select({ w: s.agencyProfile.workflow }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  return r?.w ?? {};
}

/** Who a new case goes to when the form doesn't name anyone: a matching rule, else round robin or least busy. */
export async function pickAssignee(agencyId: string, visaCode: string, creatorId: string): Promise<{ userId: string; why: string }> {
  const w = await workflowFor(agencyId);
  const a = w.assignment;
  if (!a) return { userId: creatorId, why: "creator" };
  const members = (await db.select({ id: s.member.userId }).from(s.member).where(eq(s.member.organizationId, agencyId))).map((m) => m.id);
  const rule = a.rules.find((r) => ruleMatches(r.match, visaCode) && members.includes(r.userId));
  if (rule) return { userId: rule.userId, why: `rule ${rule.match}` };
  const pool = a.pool.filter((p) => members.includes(p));
  if (!pool.length || a.fallback === "creator") return { userId: creatorId, why: "creator" };
  if (a.fallback === "round_robin") {
    const next = ((a.cursor ?? -1) + 1) % pool.length;
    await db.update(s.agencyProfile).set({ workflow: { ...w, assignment: { ...a, cursor: next } } }).where(eq(s.agencyProfile.agencyId, agencyId));
    return { userId: pool[next], why: "round robin" };
  }
  const loads = await db
    .select({ id: s.matters.assignedTo, n: sql<number>`count(*)::int` })
    .from(s.matters)
    .where(and(eq(s.matters.agencyId, agencyId), inArray(s.matters.assignedTo, pool), notInArray(s.matters.stage, ["closed", "decision"])))
    .groupBy(s.matters.assignedTo);
  const least = [...pool].sort((x, y) => (loads.find((l) => l.id === x)?.n ?? 0) - (loads.find((l) => l.id === y)?.n ?? 0))[0];
  return { userId: least, why: "least busy" };
}
