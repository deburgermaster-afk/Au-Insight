"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { saveReviewDeadline } from "@/lib/review";
import type { DeadlineInput } from "@/lib/review-deadline";
import { requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
export async function setReviewDeadline(matterId: string, input: DeadlineInput, override?: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireCap("immigration", "Only a registered migration agent can set review deadlines.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Enter the date of the decision notice." };
    const due = await saveReviewDeadline(ctx, matterId, input, override);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: due };
  } catch (e) {
    return fail(e);
  }
}

/** Review applied for (or the client decided not to): closes the reminder. */
export async function closeReviewDeadline(matterId: string, lodged: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireCap("immigration", "Only a registered migration agent can change review deadlines.");
    const today = new Date().toISOString().slice(0, 10);
    const [m] = await db
      .update(s.matters)
      .set(lodged ? { reviewLodgedAt: today } : { reviewDueAt: null, reviewBasis: null })
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)))
      .returning({ clientId: s.matters.clientId });
    if (!m) return { ok: false, error: "Matter not found." };
    await db.update(s.tasks).set({ status: "done" }).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, matterId), sql`${s.tasks.title} like 'Apply to the ART:%'`, sql`${s.tasks.status} <> 'done'`));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m.clientId, matterId, kind: "stage", title: lodged ? "ART review application lodged" : "ART review deadline removed", actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
