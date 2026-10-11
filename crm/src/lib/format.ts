import { TZDate, tz } from "@date-fns/tz";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";

// Dates render in the agency's time zone on both the server (UTC on Vercel) and in the browser, so
// server HTML and hydration agree and "today" means today in Australia.
export const AGENCY_TZ = "Australia/Sydney";
const inTz = { in: tz(AGENCY_TZ) };

const toDate = (d: Date | string) => {
  if (typeof d !== "string") return d;
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split("-").map(Number);
    return new TZDate(y, m - 1, day, AGENCY_TZ);
  }
  return parseISO(d);
};

export const aud = (n: number | string | null | undefined, decimals = 0) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(Number(n ?? 0));

export const dmy = (d: Date | string | null | undefined) => (d ? format(toDate(d), "d MMM yyyy", inTz) : "—");
export const dm = (d: Date | string | null | undefined) => (d ? format(toDate(d), "d MMM", inTz) : "—");
export const time = (d: Date | string) => format(toDate(d), "h:mm a", inTz);
export const ago = (d: Date | string) => `${formatDistanceToNowStrict(toDate(d))} ago`;
export const daysUntil = (d: Date | string) => differenceInCalendarDays(toDate(d), new Date(), inTz);
/** Today's date (yyyy-mm-dd) in the agency's time zone. */
export const todayIso = () => format(new Date(), "yyyy-MM-dd", inTz);

export function relativeDays(d: Date | string | null | undefined) {
  if (!d) return "—";
  const n = daysUntil(d);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export const fullName = (c: { firstName: string; lastName: string }) => `${c.firstName} ${c.lastName}`;

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() || "?";
}
