import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { asAgency, type Connector, WEBHOOK_EVENTS, webhookUrl } from "@/lib/resend-connect";
import { encrypt } from "@/lib/secure";

export type DomainRec = { record: string; name: string; type: string; value: string; priority?: number; status: string; ttl?: string };
export type ResendDomain = { id: string; name: string; status: string; records?: DomainRec[]; capabilities?: { sending?: string; receiving?: string } };
type Who = { agencyId: string; agencySlug: string; agencyName: string; userId: string; name: string };

export const cleanRecords = (r: DomainRec[] = []) => r.map(({ record, name, type, value, priority, status }) => ({ record, name, type, value, priority, status }));

export async function saveDomain(agencyId: string, d: ResendDomain, via: "lodgely" | "resend") {
  await db
    .update(s.agencyProfile)
    .set({ mailDomain: d.name, mailDomainId: d.id, mailDomainStatus: d.status, mailDomainRecords: cleanRecords(d.records), mailDomainCheckedAt: new Date(), mailDomainVia: via })
    .where(eq(s.agencyProfile.agencyId, agencyId));
}

const host = (v?: string | null) =>
  (v ?? "")
    .toLowerCase()
    .replace(/^.*@/, "")
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");

/**
 * Runs once after "Connect Resend": subscribes Lodgely to the account's mail events, picks up a
 * domain that's already set up there (preferring the agency's website or email domain), and takes a
 * first usage reading. Nothing for the person to type.
 */
export async function setupResend(c: Connector, who: Who) {
  const out = { webhook: false, domain: null as string | null, verified: false };
  if (!c.webhookId) {
    try {
      type W = { id: string; signing_secret?: string; secret?: string };
      const w = await asAgency<W>(c, "/webhooks", { method: "POST", body: JSON.stringify({ endpoint: webhookUrl(c.id), events: WEBHOOK_EVENTS }) });
      const secret = w.signing_secret ?? w.secret ?? (await asAgency<W>(c, `/webhooks/${w.id}`).then((x) => x.signing_secret ?? x.secret).catch(() => undefined));
      await db.update(s.connectors).set({ webhookId: w.id, webhookSecret: secret ? encrypt(secret) : null }).where(eq(s.connectors.id, c.id));
      out.webhook = Boolean(secret);
    } catch (e) {
      console.error("resend webhook", e);
    }
  }
  try {
    const [p] = await db.select({ domain: s.agencyProfile.mailDomain, website: s.agencyProfile.website, email: s.agencyProfile.email }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, who.agencyId));
    if (!p?.domain) {
      const { data } = await asAgency<{ data: ResendDomain[] }>(c, "/domains");
      const wanted = [host(p?.website), host(p?.email)].filter(Boolean);
      const pick = data.find((d) => wanted.includes(d.name)) ?? (data.filter((d) => d.status === "verified").length === 1 ? data.find((d) => d.status === "verified") : undefined);
      if (pick) {
        const full = await asAgency<ResendDomain>(c, `/domains/${pick.id}`).catch(() => pick);
        await saveDomain(who.agencyId, full, "resend");
        out.domain = full.name;
        out.verified = full.status === "verified";
        if (out.verified) {
          const { ensureMailboxes } = await import("@/lib/mail");
          await ensureMailboxes(who);
        }
      }
    }
  } catch (e) {
    console.error("resend domains", e);
  }
  const { checkUsageAlerts } = await import("@/lib/mail-usage");
  await checkUsageAlerts(who.agencyId, { maxAgeSeconds: 0 }).catch((e) => console.error("usage", e));
  return out;
}

/** Undo for disconnect: remove our webhook from their account. */
export async function teardownResend(c: Connector) {
  if (c.webhookId) await asAgency(c, `/webhooks/${c.webhookId}`, { method: "DELETE" }).catch(() => null);
}
