"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { syncConnection } from "@/lib/mail-connect";
import { decrypt } from "@/lib/secure";
import { actionCtx, canAtLeast } from "@/lib/session";

/** The signed-in person's connected Gmail/Outlook accounts. */
export async function myConnections() {
  const ctx = await actionCtx();
  return db
    .select({ id: s.mailConnections.id, provider: s.mailConnections.provider, email: s.mailConnections.email, status: s.mailConnections.status, lastError: s.mailConnections.lastError, lastSyncAt: s.mailConnections.lastSyncAt })
    .from(s.mailConnections)
    .where(and(eq(s.mailConnections.agencyId, ctx.agencyId), eq(s.mailConnections.userId, ctx.userId)));
}

export async function syncNow(): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const rows = await db.select().from(s.mailConnections).where(and(eq(s.mailConnections.agencyId, ctx.agencyId), eq(s.mailConnections.userId, ctx.userId)));
    let added = 0;
    const errors: string[] = [];
    for (const c of rows) {
      try {
        added += (await syncConnection(c)).added;
      } catch (e) {
        errors.push(`${c.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    updateTag(agencyTag(ctx.agencyId));
    if (errors.length && !added) return { ok: false, error: errors[0] };
    return { ok: true, id: String(added) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Disconnects an account: revokes access with the provider where possible. Mail already synced stays. */
export async function disconnect(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const [c] = await db.select().from(s.mailConnections).where(and(eq(s.mailConnections.agencyId, ctx.agencyId), eq(s.mailConnections.id, id)));
    if (!c) return { ok: false, error: "Not found." };
    if (c.userId !== ctx.userId && !canAtLeast(ctx.role, "admin")) return { ok: false, error: "You can only disconnect your own accounts." };
    if (c.provider === "google") {
      const token = c.refreshToken ? decrypt(c.refreshToken) : decrypt(c.accessToken);
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
    }
    await db.delete(s.mailConnections).where(eq(s.mailConnections.id, id));
    await db.delete(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.address, c.email)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "mail_connection", entityId: id, detail: { email: c.email } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
