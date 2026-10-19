"use server";

import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { requireRole } from "@/lib/session";

/** Owner setting: every staff member must use two-factor sign-in. */
export async function setRequire2fa(on: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("owner");
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, require2fa: on }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { require2fa: on, updatedAt: new Date() } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agency_profile", entityId: ctx.agencyId, detail: { require2fa: on } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
