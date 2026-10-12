import { revalidateTag } from "next/cache";
import { eq, isNotNull, ne, and } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { agencyTag } from "@/lib/data";
import { syncStale } from "@/lib/mail-connect";
import { checkUsageAlerts } from "@/lib/mail-usage";
import { asAgency } from "@/lib/resend-connect";
import { type ResendDomain, saveDomain } from "@/lib/resend-setup";

// Daily catch-up (Vercel Cron sends the CRON_SECRET): connected Gmail/Outlook mailboxes, usage
// limit emails for agencies on their own Resend, and domains still waiting on DNS.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const r = await syncStale(0);
  const touched = new Set((await db.selectDistinct({ a: s.mailConnections.agencyId }).from(s.mailConnections)).map((x) => x.a));
  const connectors = await db.select().from(s.connectors).where(eq(s.connectors.kind, "resend"));
  let alerts = 0;
  for (const c of connectors) {
    alerts += (await checkUsageAlerts(c.agencyId, { maxAgeSeconds: 0 }).catch(() => ({ alerted: [] }))).alerted.length;
    touched.add(c.agencyId);
  }
  const pending = await db.select({ agencyId: s.agencyProfile.agencyId, id: s.agencyProfile.mailDomainId, via: s.agencyProfile.mailDomainVia }).from(s.agencyProfile).where(and(isNotNull(s.agencyProfile.mailDomainId), ne(s.agencyProfile.mailDomainStatus, "verified")));
  let domains = 0;
  for (const p of pending) {
    try {
      const c = connectors.find((x) => x.agencyId === p.agencyId);
      const { resend } = await import("@/lib/mail");
      const d = p.via === "resend" && c ? await asAgency<ResendDomain>(c, `/domains/${p.id}`) : await resend<ResendDomain>(`/domains/${p.id}`);
      await saveDomain(p.agencyId, d, p.via === "resend" ? "resend" : "lodgely");
      touched.add(p.agencyId);
      domains++;
    } catch (e) {
      console.error("cron domain", p.agencyId, e);
    }
  }
  for (const a of touched) revalidateTag(agencyTag(a), { expire: 0 });
  return Response.json({ ...r, alerts, domains });
}
