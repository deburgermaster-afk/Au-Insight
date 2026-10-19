import "server-only";
import { TZDate } from "@date-fns/tz";
import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { BookingHours } from "@/db/crm-schema";
import { AGENCY_TZ } from "@/lib/format";

// Online booking: which times a booking type can be booked (the agency's hours, minus what the
// eligible staff already have on), and who takes each booking.

export const DEFAULT_HOURS: BookingHours = {
  mon: [["09:00", "17:00"]],
  tue: [["09:00", "17:00"]],
  wed: [["09:00", "17:00"]],
  thu: [["09:00", "17:00"]],
  fri: [["09:00", "17:00"]],
  sat: [],
  sun: [],
};
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const BOOKABLE_ROLES = ["owner", "admin", "supervisor", "agent"];

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
export const newToken = () => randomBytes(24).toString("base64url");

/** A unique video room per booking (Jitsi Meet: free, no account needed for clients). */
export const videoRoom = () => `https://meet.jit.si/Lodgely-${randomBytes(9).toString("base64url").replace(/[^A-Za-z0-9]/g, "")}`;

/** The agency behind a public booking link, with its active booking types. */
export async function bookingAgency(slug: string) {
  const [org] = await db.select({ id: s.organization.id, name: s.organization.name, slug: s.organization.slug, logo: s.organization.logo }).from(s.organization).where(eq(s.organization.slug, slug));
  if (!org) return null;
  const [p] = await db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, org.id));
  if (!p?.bookingEnabled) return null;
  const types = await db.select().from(s.bookingTypes).where(and(eq(s.bookingTypes.agencyId, org.id), eq(s.bookingTypes.active, true))).orderBy(asc(s.bookingTypes.sort), asc(s.bookingTypes.name));
  return { org, profile: p, hours: p.bookingHours ?? DEFAULT_HOURS, types };
}

type Type = typeof s.bookingTypes.$inferSelect;

/** Staff who can take this type: the ones chosen, or every agent, supervisor, admin and owner. */
export async function staffPool(agencyId: string, type: Type) {
  const members = await db.select({ id: s.user.id, name: s.user.name, email: s.user.email, role: s.member.role }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(eq(s.member.organizationId, agencyId));
  return type.staffIds.length ? members.filter((m) => type.staffIds.includes(m.id)) : members.filter((m) => BOOKABLE_ROLES.includes(m.role));
}

const local = (date: string, hhmm: string) => {
  const [y, m, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  return new Date(new TZDate(y, m - 1, d, h, mi, AGENCY_TZ).getTime());
};
const isoDay = (d: Date) => new TZDate(d, AGENCY_TZ).toISOString().slice(0, 10);

/**
 * Open start times per day, in the agency's time zone, from `from` for `days` days. A time is open
 * when at least one staff member in the pool has nothing booked (plus the buffer) overlapping it.
 */
export async function openSlots(agencyId: string, hours: BookingHours, type: Type, from: string, days: number) {
  const pool = await staffPool(agencyId, type);
  if (!pool.length) return { days: [] as { date: string; slots: string[] }[], pool };
  const now = Date.now();
  const earliest = now + type.minNoticeHours * 3600_000;
  const latest = now + type.maxDaysAhead * 864e5;
  const start = local(from, "00:00");
  const end = new Date(start.getTime() + days * 864e5 + 864e5);
  const busy = await db
    .select({ staffId: s.appointments.staffId, startsAt: s.appointments.startsAt, endsAt: s.appointments.endsAt })
    .from(s.appointments)
    .where(and(eq(s.appointments.agencyId, agencyId), ne(s.appointments.status, "cancelled"), inArray(s.appointments.staffId, pool.map((p) => p.id)), lt(s.appointments.startsAt, end), gte(s.appointments.endsAt, start)));
  const buffer = type.bufferMinutes * 60_000;
  const len = type.minutes * 60_000;
  const step = (type.minutes <= 30 ? 15 : 30) * 60_000;
  const out: { date: string; slots: string[] }[] = [];
  for (let i = 0; i < days; i++) {
    const day = isoDay(new Date(start.getTime() + i * 864e5 + 12 * 3600_000));
    const key = DAY_KEYS[new TZDate(local(day, "12:00"), AGENCY_TZ).getDay()];
    const slots: string[] = [];
    for (const [a, b] of hours[key] ?? []) {
      const close = local(day, b).getTime();
      for (let t = local(day, a).getTime(); t + len <= close; t += step) {
        if (t < earliest || t > latest) continue;
        const free = pool.some((p) => !busy.some((x) => x.staffId === p.id && x.startsAt.getTime() < t + len + buffer && x.endsAt.getTime() + buffer > t));
        if (free) slots.push(new Date(t).toISOString());
      }
    }
    out.push({ date: day, slots });
  }
  return { days: out, pool };
}

/** Whoever in the pool is free at that time, preferring the one with the fewest bookings that day. */
export async function pickStaff(agencyId: string, type: Type, startsAt: Date) {
  const pool = await staffPool(agencyId, type);
  const len = type.minutes * 60_000;
  const buffer = type.bufferMinutes * 60_000;
  const dayStart = local(isoDay(startsAt), "00:00");
  const dayEnd = new Date(dayStart.getTime() + 864e5);
  const rows = await db
    .select({ staffId: s.appointments.staffId, startsAt: s.appointments.startsAt, endsAt: s.appointments.endsAt })
    .from(s.appointments)
    .where(and(eq(s.appointments.agencyId, agencyId), ne(s.appointments.status, "cancelled"), lt(s.appointments.startsAt, dayEnd), gte(s.appointments.endsAt, dayStart)));
  const t = startsAt.getTime();
  const free = pool.filter((p) => !rows.some((x) => x.staffId === p.id && x.startsAt.getTime() < t + len + buffer && x.endsAt.getTime() + buffer > t));
  free.sort((a, b) => rows.filter((x) => x.staffId === a.id).length - rows.filter((x) => x.staffId === b.id).length);
  return free[0] ?? null;
}

const icsDate = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** One or more events as an iCalendar file (RFC 5545), for "add to calendar" and staff feeds. */
export function icsCalendar(name: string, events: { uid: string; start: Date; end: Date; title: string; description?: string; location?: string | null; url?: string | null; cancelled?: boolean }[]) {
  const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Lodgely//Bookings//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsText(name)}`];
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}@lodgely`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(e.start)}`,
      `DTEND:${icsDate(e.end)}`,
      `SUMMARY:${icsText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
      ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      `STATUS:${e.cancelled ? "CANCELLED" : "CONFIRMED"}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

/** A Google Calendar "add event" link. */
export function googleCalendarUrl(e: { start: Date; end: Date; title: string; details?: string; location?: string | null }) {
  const u = new URL("https://calendar.google.com/calendar/render");
  u.searchParams.set("action", "TEMPLATE");
  u.searchParams.set("text", e.title);
  u.searchParams.set("dates", `${icsDate(e.start)}/${icsDate(e.end)}`);
  if (e.details) u.searchParams.set("details", e.details);
  if (e.location) u.searchParams.set("location", e.location);
  return u.toString();
}

export const appBase = () => process.env.BETTER_AUTH_URL ?? "https://lodgely.mapcn.workers.dev";
