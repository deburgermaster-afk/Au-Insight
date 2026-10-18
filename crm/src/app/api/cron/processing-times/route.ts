import { syncProcessingTimes } from "@/lib/processing-times";

// Daily (from the worker's cron): copy Home Affairs' processing times from Immi Insight.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json({ rows: await syncProcessingTimes() });
  } catch (e) {
    console.error("processing times", e);
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
