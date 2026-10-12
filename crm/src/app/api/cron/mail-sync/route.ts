import { revalidateTag } from "next/cache";
import { db, schema as s } from "@/db";
import { agencyTag } from "@/lib/data";
import { syncStale } from "@/lib/mail-connect";

// Scheduled catch-up for connected Gmail/Outlook mailboxes (Vercel Cron sends the CRON_SECRET).
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const r = await syncStale(0);
  const agencies = await db.selectDistinct({ a: s.mailConnections.agencyId }).from(s.mailConnections);
  for (const { a } of agencies) revalidateTag(agencyTag(a), { expire: 0 });
  return Response.json(r);
}
