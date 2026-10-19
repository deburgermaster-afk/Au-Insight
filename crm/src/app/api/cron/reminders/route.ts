import { sendDueReminders } from "@/lib/reminders";

// Every 10 minutes (the worker's cron): day-before reminders for appointments.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  return Response.json(await sendDueReminders());
}
