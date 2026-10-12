"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { ensureMailboxes, mailEnabled, resend } from "@/lib/mail";
import { asAgency, resendConnector } from "@/lib/resend-connect";
import { type ResendDomain, saveDomain } from "@/lib/resend-setup";
import { requireRole } from "@/lib/session";

type Via = "lodgely" | "resend";
type Call = <T>(path: string, init?: RequestInit) => Promise<T>;

/** The Resend account a domain lives in: the agency's own when connected, otherwise Lodgely's. */
async function account(agencyId: string, via?: Via | null): Promise<{ via: Via; call: Call } | { error: string }> {
  const c = await resendConnector(agencyId);
  const want = via ?? (c?.status === "active" ? "resend" : "lodgely");
  if (want === "resend") {
    if (!c) return { error: "Connect Resend again in Settings → Connectors to manage this domain." };
    return { via: "resend", call: (p, i) => asAgency(c, p, i) };
  }
  if (!mailEnabled()) return { error: "Email isn't configured on this server." };
  return { via: "lodgely", call: (p, i) => resend(p, i) };
}

const errText = (e: unknown) => (e instanceof Error ? e.message.replace(/^Email provider: \d+ /, "") : String(e));

/** Adds the agency's domain for sending and receiving (or picks it up if it already exists in their Resend account). */
export async function addMailDomain(name: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").replace(/^.*@/, "");
    if (!/^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(domain)) return { ok: false, error: "Enter a domain like youragency.com.au" };
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (p?.id) return { ok: false, error: "Remove the current domain first." };
    const [other] = await db.select({ agencyId: s.agencyProfile.agencyId }).from(s.agencyProfile).where(eq(s.agencyProfile.mailDomain, domain));
    if (other && other.agencyId !== ctx.agencyId) return { ok: false, error: "That domain is already used by another agency." };
    const acc = await account(ctx.agencyId);
    if ("error" in acc) return { ok: false, error: acc.error };
    let d: ResendDomain | undefined;
    if (acc.via === "resend") {
      const { data } = await acc.call<{ data: ResendDomain[] }>("/domains");
      const found = data.find((x) => x.name === domain);
      if (found) d = await acc.call<ResendDomain>(`/domains/${found.id}`);
    }
    if (!d) {
      const created = await acc.call<ResendDomain>("/domains", { method: "POST", body: JSON.stringify({ name: domain, region: "ap-northeast-1", capabilities: { sending: "enabled", receiving: "enabled" } }) });
      const full = await acc.call<ResendDomain>(`/domains/${created.id}`).catch(() => created);
      d = { ...full, records: full.records ?? created.records };
      // Start checking straight away; it's quick when the records are already there.
      await acc.call(`/domains/${d.id}/verify`, { method: "POST" }).catch(() => null);
    }
    await saveDomain(ctx.agencyId, d, acc.via);
    if (d.status === "verified") await ensureMailboxes(ctx);
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "mail_domain", entityId: d.id, detail: { domain, via: acc.via } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: d.status };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/**
 * Refreshes the domain's status. The settings page calls this on its own every few seconds while
 * DNS is pending (quick = just read status); every few minutes it also asks Resend to re-check.
 * When verified, mailboxes on the domain are created.
 */
export async function checkMailDomain(opts: { quick?: boolean } = {}): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId, via: s.agencyProfile.mailDomainVia, status: s.agencyProfile.mailDomainStatus }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (!p?.id) return { ok: false, error: "Add a domain first." };
    const acc = await account(ctx.agencyId, (p.via as Via | null) ?? "lodgely");
    if ("error" in acc) return { ok: false, error: acc.error };
    if (!opts.quick) {
      await acc.call(`/domains/${p.id}/verify`, { method: "POST" }).catch(() => null);
      await new Promise((r) => setTimeout(r, 2000));
    }
    const d = await acc.call<ResendDomain>(`/domains/${p.id}`);
    await saveDomain(ctx.agencyId, d, acc.via);
    if (d.status === "verified") await ensureMailboxes(ctx);
    if (d.status !== p.status || !opts.quick) updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: d.status };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** Stops using the domain. Mail already received stays; addresses on it stop working. */
export async function removeMailDomain(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("owner");
    const [p] = await db.select({ id: s.agencyProfile.mailDomainId, domain: s.agencyProfile.mailDomain, via: s.agencyProfile.mailDomainVia }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (!p?.id) return { ok: true };
    // A domain in the agency's own Resend account stays there (they may use it elsewhere); Lodgely's copy is deleted.
    if ((p.via ?? "lodgely") === "lodgely" && mailEnabled()) await resend(`/domains/${p.id}`, { method: "DELETE" }).catch(() => null);
    await db.update(s.agencyProfile).set({ mailDomain: null, mailDomainId: null, mailDomainStatus: null, mailDomainRecords: null, mailDomainCheckedAt: null, mailDomainVia: null }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "mail_domain", entityId: p.id, detail: { domain: p.domain, via: p.via } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: errText(e) };
  }
}

/** Who hosts the domain's DNS, so the page can link straight to the right screen. */
export async function dnsHost(domain: string): Promise<{ name: string; url: string | null } | null> {
  await requireRole("admin");
  const { resolveNs } = await import("node:dns/promises");
  const apex = domain.split(".").slice(-3).join(".");
  for (const d of [domain, apex, domain.split(".").slice(-2).join(".")]) {
    const ns = await resolveNs(d).catch(() => [] as string[]);
    if (!ns.length) continue;
    const n = ns.join(" ").toLowerCase();
    const known: [RegExp, string, string | null][] = [
      [/cloudflare/, "Cloudflare", "https://dash.cloudflare.com/?to=/:account/:zone/dns"],
      [/domaincontrol/, "GoDaddy", `https://dcc.godaddy.com/control/portfolio/${d}/settings?tab=dns`],
      [/vercel-dns/, "Vercel", "https://vercel.com/dashboard/domains"],
      [/awsdns/, "Amazon Route 53", "https://console.aws.amazon.com/route53/v2/hostedzones"],
      [/googledomains|google\.com/, "Google Cloud DNS", "https://console.cloud.google.com/net-services/dns/zones"],
      [/squarespace/, "Squarespace", "https://account.squarespace.com/domains"],
      [/crazydomains/, "Crazy Domains", "https://www.crazydomains.com.au/members/"],
      [/ventraip|nameserver\.net\.au/, "VentraIP", "https://vip.ventraip.com.au/"],
      [/netregistry/, "Netregistry", "https://www.netregistry.com.au/login"],
      [/melbourneit|webcentral/, "Webcentral", "https://www.webcentral.com.au/login"],
      [/wixdns/, "Wix", "https://manage.wix.com/account/domains"],
      [/hostinger|dns-parking/, "Hostinger", "https://hpanel.hostinger.com/domains"],
      [/registrar-servers/, "Namecheap", `https://ap.www.namecheap.com/Domains/DomainControlPanel/${d}/advancedns`],
      [/azure-dns/, "Azure DNS", "https://portal.azure.com/#browse/Microsoft.Network%2FdnsZones"],
    ];
    const hit = known.find(([re]) => re.test(n));
    return hit ? { name: hit[1], url: hit[2] } : { name: ns[0].replace(/\.$/, ""), url: null };
  }
  return null;
}
