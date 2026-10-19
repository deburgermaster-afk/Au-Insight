"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { appBase, hashToken } from "@/lib/booking";
import { requireRole } from "@/lib/session";

/** Creates (or replaces) your private calendar feed link. The old link stops working. */
export async function newCalendarFeed(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireRole("staff");
    const token = randomBytes(24).toString("base64url");
    await db.delete(s.calendarFeeds).where(eq(s.calendarFeeds.userId, ctx.userId));
    await db.insert(s.calendarFeeds).values({ agencyId: ctx.agencyId, userId: ctx.userId, tokenHash: hashToken(token) });
    return { ok: true, url: `${appBase()}/api/calendar/${token}.ics` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
