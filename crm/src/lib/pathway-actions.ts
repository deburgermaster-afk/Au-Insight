"use server";

import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { attachCourses, PATHWAY_MODEL, pathwayContext, pathwayFromClaude, pathwayFromRules } from "@/lib/pathways";
import { requireCap } from "@/lib/session";

/** Builds suggested pathways for a client: Claude when configured, otherwise the rules engine. */
export async function suggestPathways(clientId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const context = await pathwayContext(ctx.agencyId, clientId);
    if (!context) return { ok: false, error: "Client not found." };
    let source = "claude";
    let result = await pathwayFromClaude(context).catch((e) => {
      console.error("pathway: Claude failed, using rules", e);
      return null;
    });
    if (!result) {
      source = "rules";
      result = pathwayFromRules(context);
    }
    const payload = await attachCourses(result);
    await db.insert(s.aiPathways).values({ agencyId: ctx.agencyId, clientId, mode: payload.mode, source, model: source === "claude" ? PATHWAY_MODEL : null, payload, createdBy: ctx.name });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: "Suggested pathways updated", body: payload.headline, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: source };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
