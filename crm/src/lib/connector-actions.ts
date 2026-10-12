"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { checkUsageAlerts } from "@/lib/mail-usage";
import { resendConnector, revokeResend } from "@/lib/resend-connect";
import { setupResend, teardownResend } from "@/lib/resend-setup";
import { requireRole } from "@/lib/session";

/** Disconnect Resend: removes Lodgely's webhook from the account and revokes access. */
export async function disconnectResend(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const c = await resendConnector(ctx.agencyId);
    if (!c) return { ok: true };
    await teardownResend(c).catch(() => null);
    await revokeResend(c);
    await db.delete(s.connectors).where(eq(s.connectors.id, c.id));
    // A domain that lived in their account can't be used without it.
    const [p] = await db.select({ via: s.agencyProfile.mailDomainVia }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (p?.via === "resend") await db.update(s.agencyProfile).set({ mailDomain: null, mailDomainId: null, mailDomainStatus: null, mailDomainRecords: null, mailDomainCheckedAt: null, mailDomainVia: null }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "connector", entityId: c.id, detail: { kind: "resend" } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Re-runs setup (webhook, domain pick-up) for a connected Resend account. */
export async function repairResend(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const c = await resendConnector(ctx.agencyId);
    if (!c) return { ok: false, error: "Resend isn't connected." };
    const r = await setupResend(c, ctx);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: r.domain ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Reads usage now (instead of the cached reading) and sends any due limit email. */
export async function refreshUsage(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    await checkUsageAlerts(ctx.agencyId, { maxAgeSeconds: 0 });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
