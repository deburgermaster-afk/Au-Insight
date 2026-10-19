import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { BookingShell } from "@/components/booking/shell";
import { ManageBooking } from "@/components/booking/manage";
import { db, schema as s } from "@/db";
import { hashToken } from "@/lib/booking";

const nowMs = () => Date.now();

export const metadata = { title: "Your booking", robots: { index: false } };

export default async function Manage({ params }: PageProps<"/book/manage/[token]">) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [r] = await db
    .select({ a: s.appointments, type: s.bookingTypes, agency: s.organization, staff: s.user.name })
    .from(s.appointments)
    .innerJoin(s.organization, eq(s.organization.id, s.appointments.agencyId))
    .leftJoin(s.bookingTypes, eq(s.bookingTypes.id, s.appointments.bookingTypeId))
    .leftJoin(s.user, eq(s.user.id, s.appointments.staffId))
    .where(eq(s.appointments.manageTokenHash, hashToken(token)));
  if (!r) notFound();
  return (
    <BookingShell agency={r.agency.name} logo={r.agency.logo}>
      <ManageBooking
        token={token}
        agency={r.agency.slug}
        booking={{ past: r.a.endsAt.getTime() < nowMs(), title: r.type?.name ?? r.a.title, startsAt: r.a.startsAt.toISOString(), endsAt: r.a.endsAt.toISOString(), status: r.a.status, videoUrl: r.a.videoUrl, location: r.a.location, staff: r.staff, typeSlug: r.type?.slug ?? null, minutes: r.type?.minutes ?? 30, mode: r.type?.mode ?? "video" }}
      />
    </BookingShell>
  );
}
