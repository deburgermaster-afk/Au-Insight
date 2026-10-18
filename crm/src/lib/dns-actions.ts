"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { autoConfigure, CF_KIND, cf, type DnsStep } from "@/lib/dns-connect";
import { checkMailDomain } from "@/lib/domain-actions";
import { encrypt } from "@/lib/secure";
import { requireRole } from "@/lib/session";

const err = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Admin: save a Cloudflare API token (DNS edit). Checked first; stored encrypted. Then sets up DNS straight away if a domain is waiting. */
export async function connectCloudflare(token: string): Promise<{ ok: true; zones: string[]; steps?: DnsStep[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireRole("admin");
    const t = token.trim();
    if (t.length < 30) return { ok: false, error: "Paste the whole token Cloudflare showed you." };
    const v = await cf<{ status: string }>(t, "/user/tokens/verify");
    if (v.status !== "active") return { ok: false, error: "That token isn't active." };
    const zones = (await cf<{ name: string }[]>(t, "/zones?per_page=50")).map((z) => z.name);
    if (!zones.length) return { ok: false, error: "The token can't see any domains. Give it Zone read and DNS edit for your domain." };
    const values = { status: "active", accessToken: encrypt(t), account: zones.slice(0, 3).join(", "), scope: "dns:edit zone:read", connectedBy: ctx.userId, connectedByName: ctx.name, lastError: null, updatedAt: new Date() };
    await db.insert(s.connectors).values({ agencyId: ctx.agencyId, kind: CF_KIND, ...values }).onConflictDoUpdate({ target: [s.connectors.agencyId, s.connectors.kind], set: values });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "connector", entityId: CF_KIND, detail: { kind: CF_KIND, zones: zones.length } });
    // A domain already waiting on DNS gets its records now.
    const [p] = await db.select({ domain: s.agencyProfile.mailDomain, status: s.agencyProfile.mailDomainStatus }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    let steps: DnsStep[] | undefined;
    if (p?.domain && p.status !== "verified") {
      const r = await autoConfigure(ctx.agencyId).catch(() => null);
      if (r && "steps" in r) {
        steps = r.steps;
        await checkMailDomain().catch(() => null);
      }
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, zones, steps };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

/** Admin: write the domain's records into Cloudflare now and ask Resend to verify. */
export async function configureDns(): Promise<{ ok: true; zone: string; steps: DnsStep[]; status?: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireRole("admin");
    const r = await autoConfigure(ctx.agencyId);
    if ("error" in r) return { ok: false, error: r.error };
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "dns", entityId: r.zone, detail: { steps: r.steps } });
    const v = await checkMailDomain().catch(() => null);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, zone: r.zone, steps: r.steps, status: v && v.ok ? v.id : undefined };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function disconnectCloudflare(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.delete(s.connectors).where(and(eq(s.connectors.agencyId, ctx.agencyId), eq(s.connectors.kind, CF_KIND)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "connector", entityId: CF_KIND, detail: { kind: CF_KIND } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
