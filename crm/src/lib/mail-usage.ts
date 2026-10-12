import "server-only";
import { and, eq, gte, inArray, notLike, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { MailUsage } from "@/db/crm-schema";
import { asAgency, resendConnector } from "@/lib/resend-connect";

// Resend's free plan: 3,000 emails a month, 100 a day. A connected account reports its real plan
// limits; agencies sending through Lodgely's shared account get the same allowance.
export const FREE_TIER = { daily: 100, monthly: 3000 };
const THRESHOLDS = [100, 80] as const;

type Period = { used: number; limit: number | null; resets_at?: string | null };
type ResendUsage = { emails: { daily: Period; monthly: Period } };

const endOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
};
const startOfUtcDay = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const startOfUtcMonth = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const startOfNextUtcMonth = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 1));

export type UsageView = { source: "resend" | "lodgely"; account: string | null; usage: MailUsage; checkedAt: Date | null; plan: "free" | "paid" | "shared" };

/** Emails this agency sent through Lodgely's shared account (Gmail/Outlook sends don't count). */
async function sharedCounts(agencyId: string) {
  const sentSince = (since: Date) =>
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(s.messages)
      .where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.folder, "sent"), inArray(s.messages.status, ["sent", "delivered", "delayed", "bounced", "complained"]), notLike(s.messages.providerId, "gmail:%"), notLike(s.messages.providerId, "graph:%"), gte(s.messages.createdAt, since)));
  const [[d], [m]] = await Promise.all([sentSince(startOfUtcDay()), sentSince(startOfUtcMonth())]);
  return { daily: d?.n ?? 0, monthly: m?.n ?? 0 };
}

/** Current sending usage for the account this agency's mail goes through. */
export async function usageFor(agencyId: string, opts: { maxAgeSeconds?: number } = {}): Promise<UsageView> {
  const c = await resendConnector(agencyId);
  if (c && c.status === "active") {
    const fresh = c.usage && c.usageCheckedAt && Date.now() - c.usageCheckedAt.getTime() < (opts.maxAgeSeconds ?? 300) * 1000;
    let usage = c.usage;
    let checkedAt = c.usageCheckedAt;
    if (!fresh) {
      try {
        const u = await asAgency<ResendUsage>(c, "/usage");
        usage = {
          daily: { used: u.emails.daily.used, limit: u.emails.daily.limit, resetsAt: u.emails.daily.resets_at ?? null },
          monthly: { used: u.emails.monthly.used, limit: u.emails.monthly.limit, resetsAt: u.emails.monthly.resets_at ?? null },
        };
        checkedAt = new Date();
        await db.update(s.connectors).set({ usage, usageCheckedAt: checkedAt }).where(eq(s.connectors.id, c.id));
      } catch (e) {
        console.error("resend usage", e);
      }
    }
    if (usage) {
      const free = usage.monthly.limit !== null && usage.monthly.limit <= FREE_TIER.monthly;
      return { source: "resend", account: c.account, usage, checkedAt, plan: free ? "free" : "paid" };
    }
  }
  const n = await sharedCounts(agencyId);
  return {
    source: "lodgely",
    account: null,
    usage: { daily: { used: n.daily, limit: FREE_TIER.daily, resetsAt: endOfUtcDay().toISOString() }, monthly: { used: n.monthly, limit: FREE_TIER.monthly, resetsAt: startOfNextUtcMonth().toISOString() } },
    checkedAt: new Date(),
    plan: "shared",
  };
}

const pct = (p: { used: number; limit: number | null }) => (p.limit ? Math.round((p.used / p.limit) * 100) : 0);

/** Emails the agency's owners and admins when sending passes 80% or 100% of a daily or monthly limit (once per period). */
export async function checkUsageAlerts(agencyId: string, opts: { maxAgeSeconds?: number } = {}) {
  const view = await usageFor(agencyId, opts);
  const [profile] = await db.select({ alerts: s.agencyProfile.mailUsageAlerts }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  const { fire, sent } = dueAlerts(view.usage, profile?.alerts ?? []);
  if (!fire.length) return { view, alerted: [] as string[] };
  await db.update(s.agencyProfile).set({ mailUsageAlerts: [...sent].slice(-24) }).where(eq(s.agencyProfile.agencyId, agencyId));
  await sendLimitEmail(agencyId, view, fire).catch((e) => console.error("limit email", e));
  return { view, alerted: fire.map((f) => f.key) };
}

/** Which limit emails are due: the highest threshold crossed per period, unless already sent for that period. */
export function dueAlerts(usage: MailUsage, already: string[]) {
  const sent = new Set(already);
  const fire: { period: "daily" | "monthly"; threshold: number; key: string }[] = [];
  for (const period of ["daily", "monthly"] as const) {
    const p = usage[period];
    if (!p.limit) continue;
    const at = THRESHOLDS.find((t) => pct(p) >= t);
    if (!at) continue;
    const tag = `${period}:${(p.resetsAt ?? "").slice(0, 10)}`;
    if (sent.has(`${tag}:${at}`)) continue;
    fire.push({ period, threshold: at, key: `${tag}:${at}` });
    for (const t of THRESHOLDS) if (t <= at) sent.add(`${tag}:${t}`);
  }
  return { fire, sent };
}

export async function sendLimitEmail(agencyId: string, view: UsageView, fire: { period: "daily" | "monthly"; threshold: number }[], to?: string[]) {
  const { emailShell, mailEnabled, mailDomain, resend } = await import("@/lib/mail");
  if (!mailEnabled()) return;
  const people = await db
    .select({ email: s.user.email, name: s.user.name })
    .from(s.member)
    .innerJoin(s.user, eq(s.user.id, s.member.userId))
    .where(and(eq(s.member.organizationId, agencyId), inArray(s.member.role, ["owner", "admin"])));
  if (to) people.splice(0, people.length, ...to.map((email) => ({ email, name: email })));
  if (!people.length) return;
  const [org] = await db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, agencyId));
  const base = process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";
  const worst = fire.sort((a, b) => b.threshold - a.threshold)[0];
  const p = view.usage[worst.period];
  const reached = worst.threshold >= 100;
  const resets = p.resetsAt ? new Date(p.resetsAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" }) : "the next period";
  const where = view.source === "resend" ? `your Resend account${view.account ? ` (${view.account})` : ""}` : "Lodgely's shared sending";
  const subject = reached ? `Email limit reached: ${p.used.toLocaleString()} of ${p.limit?.toLocaleString()} ${worst.period === "daily" ? "today" : "this month"}` : `You've used ${pct(p)}% of your ${worst.period} email limit`;
  const bar = Math.min(100, pct(p));
  const body = `<p style="margin:0 0 6px;font-size:13px;color:#71717a">${org?.name ?? "Your agency"} · Email usage</p>
<h1 style="margin:0 0 14px;font-size:20px">${reached ? "You've hit your email limit" : "You're close to your email limit"}</h1>
<p>${org?.name ?? "Your agency"} has sent <b>${p.used.toLocaleString()} of ${p.limit?.toLocaleString()}</b> emails ${worst.period === "daily" ? "today" : "this month"} through ${where}.</p>
<div style="height:8px;border-radius:99px;background:#f4f4f5;overflow:hidden;margin:14px 0"><div style="height:8px;width:${bar}%;background:${reached ? "#e11d48" : "#f59e0b"}"></div></div>
<p>${reached ? `New emails may be refused until the limit resets on <b>${resets}</b> (Sydney time). Mail still arrives and is saved in Lodgely.` : `The limit resets on <b>${resets}</b> (Sydney time).`}</p>
<p>${view.source === "resend" ? "To send more, upgrade your Resend plan, or spread non-urgent emails out." : "Connect your own Resend account in Settings → Connectors to send on your own plan (Resend's free plan allows 3,000 a month, 100 a day)."}</p>
<p style="margin-top:22px"><a href="${base}/app/settings/email" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:99px;font-size:14px">View email usage</a></p>`;
  await resend("/emails", {
    method: "POST",
    body: JSON.stringify({ from: `Lodgely <alerts@${mailDomain()}>`, to: people.map((x) => x.email), subject, html: emailShell(body, "You get this because you're an owner or admin of this agency on Lodgely."), text: `${subject}. ${p.used} of ${p.limit} used. Resets ${resets}. ${base}/app/settings/email` }),
  });
}
