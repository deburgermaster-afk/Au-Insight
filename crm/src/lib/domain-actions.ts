"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { ensureMailboxes, mailEnabled, resend } from "@/lib/mail";
import { requireRole } from "@/lib/session";

type Rec = { record: string; name: string; type: string; value: string; priority?: number; status: string; ttl?: string };
type Domain = { id: string; name: string; status: string; records?: Rec[] };

const clean = (r: Rec[] = []) => r.map(({ record, name, type, value, priority, status }) => ({ record, name, type, value, priority, status }));

async function save(agencyId: string, d: Domain) {
  await db
    .update(s.agencyProfile)
    .set({ mailDomain: d.name, mailDomainId: d.id, mailDomainStatus: d.status, mailDomainRecords: clean(d.records), mailDomainCheckedAt: new Date() })
    .where(eq(s.agencyProfile.agencyId, agencyId));
}

/** Adds the agency's own domain to the mail provider for sending and receiving; returns DNS records to add. */
export async function addMailDomain(name: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    if (!mailEnabled()) return { ok: false, error: "Email isn't configured on this server." };
    const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
    if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) return { ok: false, error: "Enter a domain like youragency.com.au" };
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (p?.id) return { ok: false, error: "Remove the current domain first." };
    const [other] = await db.select({ agencyId: s.agencyProfile.agencyId }).from(s.agencyProfile).where(eq(s.agencyProfile.mailDomain, domain));
    if (other) return { ok: false, error: "That domain is already used by another agency." };
    const created = await resend<Domain>("/domains", { method: "POST", body: JSON.stringify({ name: domain, region: "ap-northeast-1", capabilities: { sending: "enabled", receiving: "enabled" } }) });
    const full = await resend<Domain>(`/domains/${created.id}`).catch(() => created);
    await save(ctx.agencyId, { ...full, records: full.records ?? created.records });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "mail_domain", entityId: created.id, detail: { domain } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message.replace(/^Email provider: \d+ /, "") : String(e) };
  }
}

/** Asks the provider to check DNS, then refreshes status; when verified, creates mailboxes on the domain. */
export async function checkMailDomain(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (!p?.id) return { ok: false, error: "Add a domain first." };
    await resend(`/domains/${p.id}/verify`, { method: "POST" }).catch(() => null);
    await new Promise((r) => setTimeout(r, 2500));
    const d = await resend<Domain>(`/domains/${p.id}`);
    await save(ctx.agencyId, d);
    if (d.status === "verified") await ensureMailboxes(ctx);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: d.status };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Stops using the domain. Mail already received stays; addresses on it stop working. */
export async function removeMailDomain(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("owner");
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId, domain: s.agencyProfile.mailDomain }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (!p?.id) return { ok: true };
    await resend(`/domains/${p.id}`, { method: "DELETE" }).catch(() => null);
    await db.update(s.agencyProfile).set({ mailDomain: null, mailDomainId: null, mailDomainStatus: null, mailDomainRecords: null, mailDomainCheckedAt: null }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "mail_domain", entityId: p.id, detail: { domain: p.domain } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
