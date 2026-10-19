import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { appBase, hashToken, icsCalendar } from "@/lib/booking";

// "Add to Outlook / Apple": the booking as a calendar file, found by the client's private manage token.
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return new Response("Not found", { status: 404 });
  const [r] = await db
    .select({ a: s.appointments, agency: s.organization.name })
    .from(s.appointments)
    .innerJoin(s.organization, eq(s.organization.id, s.appointments.agencyId))
    .where(eq(s.appointments.manageTokenHash, hashToken(token)));
  if (!r) return new Response("Not found", { status: 404 });
  const body = icsCalendar(r.agency, [
    { uid: r.a.id, start: r.a.startsAt, end: r.a.endsAt, title: `${r.a.title.split(":")[0]} with ${r.agency}`, description: `${r.a.videoUrl ? `Join: ${r.a.videoUrl}\n\n` : ""}Reschedule or cancel: ${appBase()}/book/manage/${token}`, location: r.a.videoUrl ?? r.a.location, url: r.a.videoUrl, cancelled: r.a.status === "cancelled" },
  ]);
  return new Response(body, { headers: { "content-type": "text/calendar; charset=utf-8", "content-disposition": 'attachment; filename="booking.ics"', "cache-control": "no-store" } });
}
