import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decrypt } from "@/lib/secure";

// Automatic DNS: with a Cloudflare API token (scoped to DNS edit), Lodgely writes the email domain's
// records (DKIM, SPF, return-path MX, inbound MX) straight into the agency's zone, then asks Resend
// to verify. Nothing to copy. The token is stored encrypted and can be revoked in Cloudflare.

const CF = "https://api.cloudflare.com/client/v4";
export const CF_KIND = "cloudflare_dns";

/** Opens Cloudflare's "create token" page with DNS edit + zone read already ticked. */
export const cloudflareTokenUrl = () =>
  `https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=${encodeURIComponent(JSON.stringify([{ key: "dns", type: "edit" }, { key: "zone", type: "read" }]))}&accountId=*&zoneId=all&name=${encodeURIComponent("Lodgely email DNS")}`;

type CfResult<T> = { success: boolean; errors?: { message: string }[]; result: T };

export async function cf<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${CF}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init?.headers } });
  const body = (await res.json().catch(() => null)) as CfResult<T> | null;
  if (!res.ok || !body?.success) throw new Error(`Cloudflare: ${body?.errors?.[0]?.message ?? res.status}`);
  return body.result;
}

export async function cloudflareConnector(agencyId: string) {
  const [c] = await db.select().from(s.connectors).where(and(eq(s.connectors.agencyId, agencyId), eq(s.connectors.kind, CF_KIND)));
  return c ?? null;
}

type Zone = { id: string; name: string };
type CfRecord = { id: string; type: string; name: string; content: string; priority?: number };
export type DnsRec = { record: string; name: string; type: string; value: string; priority?: number };
export type DnsStep = { record: string; type: string; name: string; result: "added" | "updated" | "exists" | "skipped"; note?: string };

/** The Cloudflare zone that holds a domain (the domain itself or a parent of it). */
export async function zoneFor(token: string, domain: string): Promise<Zone | null> {
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts.slice(i).join(".");
    const zones = await cf<Zone[]>(token, `/zones?name=${encodeURIComponent(name)}`);
    if (zones[0]) return zones[0];
  }
  return null;
}

/** Resend gives names relative to the registered domain ("resend._domainkey", "send", "" for the root). */
function fqdn(name: string, zone: string) {
  const n = name.trim().replace(/\.$/, "");
  if (!n || n === "@") return zone;
  return n === zone || n.endsWith(`.${zone}`) ? n : `${n}.${zone}`;
}
const unquote = (v: string) => v.replace(/^"|"$/g, "");

/**
 * Writes each record into the zone. Existing matching records are left alone; Lodgely's own
 * (DKIM) are updated; anything that would break existing email (a second SPF, or an inbound MX
 * where the domain already receives mail elsewhere) is skipped and reported.
 */
export async function applyRecords(token: string, zone: Zone, records: DnsRec[]): Promise<DnsStep[]> {
  const steps: DnsStep[] = [];
  for (const r of records) {
    const name = fqdn(r.name, zone.name);
    const type = r.type.toUpperCase();
    const content = type === "TXT" ? unquote(r.value) : r.value.replace(/\.$/, "");
    const existing = await cf<CfRecord[]>(token, `/zones/${zone.id}/dns_records?type=${type}&name=${encodeURIComponent(name)}`);
    const same = existing.find((e) => unquote(e.content).replace(/\.$/, "") === content);
    const step = { record: r.record, type, name };
    if (same) {
      steps.push({ ...step, result: "exists" });
      continue;
    }
    const body = { type, name, content, ttl: 1, proxied: false, ...(type === "MX" ? { priority: r.priority ?? 10 } : {}), comment: "Added by Lodgely for email" };
    if (type === "TXT" && content.startsWith("v=spf1") && existing.some((e) => unquote(e.content).startsWith("v=spf1"))) {
      steps.push({ ...step, result: "skipped", note: "An SPF record already exists here; add Resend's include to it by hand." });
      continue;
    }
    if (type === "MX" && name === zone.name && existing.length) {
      steps.push({ ...step, result: "skipped", note: `This domain already receives mail at ${existing[0].content}. Use a subdomain for Lodgely's inbox, or keep receiving elsewhere.` });
      continue;
    }
    // DKIM keys and CNAMEs can only have one value: replace. Everything else is added alongside.
    const replace = existing[0] && (type === "CNAME" || name.includes("._domainkey"));
    if (replace) await cf(token, `/zones/${zone.id}/dns_records/${existing[0].id}`, { method: "PUT", body: JSON.stringify(body) });
    else await cf(token, `/zones/${zone.id}/dns_records`, { method: "POST", body: JSON.stringify(body) });
    steps.push({ ...step, result: replace ? "updated" : "added" });
  }
  return steps;
}

/** Applies the agency's saved Resend records to Cloudflare, if a Cloudflare token is connected and holds the zone. */
export async function autoConfigure(agencyId: string): Promise<{ zone: string; steps: DnsStep[] } | { error: string }> {
  const c = await cloudflareConnector(agencyId);
  if (!c) return { error: "Connect Cloudflare first." };
  const [p] = await db.select({ domain: s.agencyProfile.mailDomain, records: s.agencyProfile.mailDomainRecords }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  if (!p?.domain || !p.records?.length) return { error: "Add your email domain first." };
  const token = decrypt(c.accessToken);
  const zone = await zoneFor(token, p.domain);
  if (!zone) return { error: `${p.domain} isn't in the Cloudflare account this token belongs to.` };
  const steps = await applyRecords(token, zone, p.records);
  await db.update(s.connectors).set({ lastError: null, account: zone.name, updatedAt: new Date() }).where(eq(s.connectors.id, c.id));
  return { zone: zone.name, steps };
}
