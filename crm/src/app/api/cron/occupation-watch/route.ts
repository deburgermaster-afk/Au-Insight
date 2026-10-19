import { checkAllWatches } from "@/lib/occupation-watch";

// Hourly (the worker's cron): record each watched client's monthly EOI position and alert their case
// officer when a new invitation round's cut-off reaches their points.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await checkAllWatches());
}
