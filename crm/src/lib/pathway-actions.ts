"use server";

import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { attachCourses, PATHWAY_MODEL, pathwayContext, pathwayFromClaude, pathwayFromRules, pathwayFromXkiro } from "@/lib/pathways";
import { requireCap } from "@/lib/session";

/** Builds suggested pathways: xKiro first, then Claude if configured, then the rules engine. */
export async function suggestPathways(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const context = await pathwayContext(ctx.agencyId, clientId);
    if (!context) return { ok: false, error: "Client not found." };
    let source = "xkiro";
    let model: string | null = null;
    const viaXkiro = await pathwayFromXkiro(context).catch((e) => {
      console.error("pathway: xKiro failed", e);
      return null;
    });
    let result = viaXkiro?.pathway ?? null;
    model = viaXkiro?.model ?? null;
    if (!result) {
      source = "claude";
      model = PATHWAY_MODEL;
      result = await pathwayFromClaude(context).catch((e) => {
        console.error("pathway: Claude failed, using rules", e);
        return null;
      });
    }
    if (!result) {
      source = "rules";
      model = null;
      result = pathwayFromRules(context);
    }
    const payload = await attachCourses(result);
    await db.insert(s.aiPathways).values({ agencyId: ctx.agencyId, clientId, mode: payload.mode, source, model, payload, createdBy: ctx.name });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: "Suggested pathways updated", body: payload.headline, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
