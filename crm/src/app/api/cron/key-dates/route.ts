import { runKeyDates } from "@/lib/key-dates";

// Once a day, early morning in Sydney: birthdays, grant anniversaries and sponsor obligations.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await runKeyDates());
}
