import { and, eq, gte } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { hashToken, icsCalendar } from "@/lib/booking";

// A staff member's appointments as a calendar feed (subscribe in Google, Outlook or Apple Calendar).
// The URL is private: whoever has it can see that person's appointment titles and times.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const raw = (await params).token.replace(/\.ics$/, "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(raw)) return new Response("Not found", { status: 404 });
  const [feed] = await db.select().from(s.calendarFeeds).where(eq(s.calendarFeeds.tokenHash, hashToken(raw)));
  if (!feed) return new Response("Not found", { status: 404 });
  const [org] = await db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, feed.agencyId));
  const rows = await db
    .select({ a: s.appointments, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.appointments)
    .leftJoin(s.clients, eq(s.clients.id, s.appointments.clientId))
    .where(and(eq(s.appointments.agencyId, feed.agencyId), eq(s.appointments.staffId, feed.userId), gte(s.appointments.startsAt, new Date(Date.now() - 30 * 864e5))))
    .limit(1000);
  const base = process.env.BETTER_AUTH_URL ?? "https://lodgely.mapcn.workers.dev";
  const body = icsCalendar(`Lodgely · ${org?.name ?? "Appointments"}`, rows.map(({ a, first, last }) => ({
    uid: a.id,
    start: a.startsAt,
    end: a.endsAt,
    title: a.title,
    description: [first ? `Client: ${first} ${last}` : null, a.videoUrl ? `Join: ${a.videoUrl}` : null, a.notes, a.clientId ? `${base}/app/clients/${a.clientId}` : null].filter(Boolean).join("\n"),
    location: a.videoUrl ?? a.location,
    url: a.videoUrl,
    cancelled: a.status === "cancelled",
  })));
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "private, max-age=300" } });
}
