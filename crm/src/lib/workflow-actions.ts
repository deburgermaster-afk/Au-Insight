"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { WorkflowConfig } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { requireCap } from "@/lib/session";
import { visaByCode } from "@/lib/visas";
import { workflowFor } from "@/lib/workflow-server";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : (e as Error)?.message ?? String(e) });

const item = z.object({ category: z.string().trim().min(1).max(40), label: z.string().trim().min(2).max(200), required: z.boolean() });
const patchSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("checklist"), visaCode: z.string(), items: z.array(item).max(120).nullable() }),
  z.object({ kind: z.literal("fees"), fees: z.record(z.string(), z.object({ professional: z.number().min(0).max(1e6).nullable(), government: z.number().min(0).max(1e6).nullable() })) }),
  z.object({
    kind: z.literal("assignment"),
    assignment: z.object({ rules: z.array(z.object({ match: z.string().trim().min(1).max(20), userId: z.string() })).max(60), fallback: z.enum(["creator", "round_robin", "least_busy"]), pool: z.array(z.string()).max(100) }).nullable(),
  }),
  z.object({ kind: z.literal("lists"), lists: z.object({ sources: z.array(z.string().trim().min(1).max(40)).max(60), tags: z.array(z.string().trim().min(1).max(40)).max(80), documentCategories: z.array(z.string().trim().min(1).max(40)).max(60), outcomes: z.array(z.string().trim().min(1).max(40)).max(20) }), referencePrefix: z.string().trim().max(8).regex(/^[A-Za-z0-9]*$/, "Use letters and numbers only for the prefix") }),
]);

/** Saves one part of the agency's workflow settings. Admins only; audited. */
export async function saveWorkflow(patch: z.infer<typeof patchSchema>): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team", "Only admins can change workflow settings.");
    const p = patchSchema.parse(patch);
    const w: WorkflowConfig = { ...(await workflowFor(ctx.agencyId)) };
    let summary = "";
    if (p.kind === "checklist") {
      if (!visaByCode(p.visaCode)) return { ok: false, error: "Unknown visa." };
      const lists = { ...(w.checklists ?? {}) };
      if (p.items === null) delete lists[p.visaCode];
      else lists[p.visaCode] = p.items;
      w.checklists = lists;
      summary = p.items === null ? `Checklist for ${p.visaCode} reset to Lodgely's` : `Checklist for ${p.visaCode}: ${p.items.length} items`;
    } else if (p.kind === "fees") {
      w.fees = Object.fromEntries(Object.entries(p.fees).filter(([k, v]) => visaByCode(k) && (v.professional != null || v.government != null)));
      summary = `Fee schedule: ${Object.keys(w.fees).length} visas priced`;
    } else if (p.kind === "assignment") {
      if (p.assignment === null) delete w.assignment;
      else {
        const members = new Set((await db.select({ id: s.member.userId }).from(s.member).where(eq(s.member.organizationId, ctx.agencyId))).map((m) => m.id));
        if (p.assignment.rules.some((r) => !members.has(r.userId)) || p.assignment.pool.some((u) => !members.has(u))) return { ok: false, error: "Rules can only point to people in your agency." };
        w.assignment = { ...p.assignment, cursor: w.assignment?.cursor };
      }
      summary = p.assignment ? `Assignment: ${p.assignment.rules.length} rules, otherwise ${p.assignment.fallback.replace("_", " ")}` : "Assignment rules off";
    } else {
      w.lists = p.lists;
      w.referencePrefix = p.referencePrefix.toUpperCase() || undefined;
      summary = "Pick lists and case reference updated";
    }
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, workflow: w }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { workflow: w } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "workflow", entityId: ctx.agencyId, detail: { summary: [summary] } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the values." };
    return fail(e);
  }
}
