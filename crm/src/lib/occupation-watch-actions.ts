"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { checkWatch } from "@/lib/occupation-watch";
import { watchData } from "@/lib/occupations";
import { requireCap } from "@/lib/session";

const input = z.object({
  anzsco: z.string().regex(/^\d{6}$/, "Enter the 6-digit ANZSCO code."),
  points: z.number().int().min(40, "Points start at 40 for these visas.").max(150),
  subclasses: z.array(z.enum(["189", "190", "491"])).min(1, "Pick at least one visa."),
});

/** Start watching an occupation for a client. The first check records today's EOI position. */
export async function watchOccupation(clientId: string, raw: { anzsco: string; points: number; subclasses: string[] }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const v = input.parse(raw);
    const [c] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    const data = await watchData(v.anzsco);
    if (!data) return { ok: false, error: "That ANZSCO code isn't on the skilled occupation lists." };
    const [w] = await db
      .insert(s.occupationWatches)
      .values({ agencyId: ctx.agencyId, clientId, anzsco: v.anzsco, occupation: data.occupation.title, points: v.points, subclasses: v.subclasses, createdBy: ctx.userId })
      .returning();
    await checkWatch(w);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: `Watching ${data.occupation.title} (${v.anzsco}) at ${v.points} points`, body: `Subclass ${v.subclasses.join(", ")}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: w.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the details." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Points changed (a new English score, another year of experience): update and re-check. */
export async function updateWatch(id: string, raw: { points: number; subclasses: string[]; active: boolean }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const v = input.pick({ points: true, subclasses: true }).parse(raw);
    const [w] = await db
      .update(s.occupationWatches)
      .set({ points: v.points, subclasses: v.subclasses, active: raw.active, updatedAt: new Date() })
      .where(and(eq(s.occupationWatches.agencyId, ctx.agencyId), eq(s.occupationWatches.id, id)))
      .returning();
    if (!w) return { ok: false, error: "Watch not found." };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the details." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeWatch(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [w] = await db.delete(s.occupationWatches).where(and(eq(s.occupationWatches.agencyId, ctx.agencyId), eq(s.occupationWatches.id, id))).returning({ id: s.occupationWatches.id });
    if (!w) return { ok: false, error: "Watch not found." };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
