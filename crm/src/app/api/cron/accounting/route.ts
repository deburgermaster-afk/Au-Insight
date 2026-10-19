import { isNotNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { syncAgencyToXero } from "@/lib/accounting";

// Every 10 minutes (the worker's cron): agencies that switched on automatic sync get their new and
// changed invoices and office receipts pushed to Xero, a small batch each.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const agencies = await db.select({ id: s.agencyProfile.agencyId, a: s.agencyProfile.accounting }).from(s.agencyProfile).where(isNotNull(s.agencyProfile.accounting));
  const out: Record<string, unknown> = {};
  for (const ag of agencies.filter((x) => x.a?.autoSync)) {
    try {
      out[ag.id] = await syncAgencyToXero(ag.id, 15);
    } catch (e) {
      out[ag.id] = { error: e instanceof Error ? e.message : String(e) };
    }
  }
  return Response.json({ agencies: Object.keys(out).length, results: out });
}
