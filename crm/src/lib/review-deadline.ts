// ART (Administrative Review Tribunal) application deadlines after a refusal or cancellation.
// Pure date maths, used on the server and in the calculator dialog. The decision letter states the
// deadline and always governs; this works it out so it's diarised the day the decision arrives.

export const DECISIONS = {
  onshore: { label: "Visa refused or cancelled, applicant in Australia", days: 28, unit: "days", note: "Migration Act Part 5: 28 days after the applicant is notified." },
  detention: { label: "Applicant in immigration detention", days: 7, unit: "working", note: "7 working days after notification." },
  offshoreFamily: { label: "Offshore visa refused, Australian sponsor applies", days: 70, unit: "days", note: "Family-sponsored offshore refusals: the sponsor has 70 days." },
  sponsorNomination: { label: "Sponsorship or nomination refused", days: 28, unit: "days", note: "The business has 28 days after notification." },
  protection: { label: "Protection visa refused", days: 28, unit: "days", note: "Migration Act Part 7: 28 days after notification." },
  character: { label: "Refused or cancelled on character (s501, delegate)", days: 9, unit: "days", note: "9 days after notification." },
} as const;
export type DecisionKind = keyof typeof DECISIONS | "custom";

export const METHODS = {
  email: { label: "Email", note: "Email: notified at the end of the day it was sent." },
  hand: { label: "Handed to the person", note: "By hand: notified that day." },
  postAus: { label: "Post to an Australian address", note: "Post within Australia: notified 7 working days after the date on the letter." },
  postOverseas: { label: "Post to an overseas address", note: "Post outside Australia: notified 21 days after the date on the letter." },
} as const;
export type Method = keyof typeof METHODS;

const iso = (d: Date) => d.toISOString().slice(0, 10);
const parse = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);
const nice = (d: Date) => d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function easterSunday(y: number) {
  // Anonymous Gregorian algorithm.
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(y, month - 1, day));
}

/** National public holidays (state-only days such as the King's Birthday aren't included). */
export function nationalHolidays(y: number) {
  const out = new Map<string, string>();
  const add = (d: Date, name: string) => out.set(iso(d), name);
  const observe = (d: Date, name: string) => {
    add(d, name);
    const wd = d.getUTCDay();
    if (wd === 6) add(addDays(d, 2), `${name} (observed)`);
    if (wd === 0) add(addDays(d, 1), `${name} (observed)`);
  };
  observe(new Date(Date.UTC(y, 0, 1)), "New Year's Day");
  observe(new Date(Date.UTC(y, 0, 26)), "Australia Day");
  const easter = easterSunday(y);
  add(addDays(easter, -2), "Good Friday");
  add(addDays(easter, 1), "Easter Monday");
  add(new Date(Date.UTC(y, 3, 25)), "Anzac Day");
  const xmas = new Date(Date.UTC(y, 11, 25));
  add(xmas, "Christmas Day");
  add(new Date(Date.UTC(y, 11, 26)), "Boxing Day");
  if (xmas.getUTCDay() === 6) { add(addDays(xmas, 2), "Christmas Day (observed)"); add(addDays(xmas, 3), "Boxing Day (observed)"); }
  if (xmas.getUTCDay() === 5) add(addDays(xmas, 3), "Boxing Day (observed)");
  if (xmas.getUTCDay() === 0) { add(addDays(xmas, 1), "Boxing Day"); add(addDays(xmas, 2), "Christmas Day (observed)"); }
  return out;
}

const holidayName = (d: Date) => nationalHolidays(d.getUTCFullYear()).get(iso(d));
const working = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !holidayName(d);
function addWorking(d: Date, n: number) {
  let x = d;
  let left = n;
  while (left > 0) {
    x = addDays(x, 1);
    if (working(x)) left--;
  }
  return x;
}

export type DeadlineInput = { decision: DecisionKind; method: Method; date: string; customDays?: number };

/**
 * date = when it was sent (email), handed over (hand) or the date on the letter (post).
 * Returns the deemed notification date, the last day to apply and the reasoning, line by line.
 */
export function reviewDeadline(input: DeadlineInput) {
  const sent = parse(input.date);
  const lines: string[] = [];
  let deemed = sent;
  if (input.method === "postAus") deemed = addWorking(sent, 7);
  else if (input.method === "postOverseas") deemed = addDays(sent, 21);
  lines.push(`${METHODS[input.method].note} Notified ${nice(deemed)}.`);
  const rule = input.decision === "custom" ? { days: Math.max(1, Math.min(365, input.customDays ?? 28)), unit: "days" as const, note: "Time limit entered by hand." } : DECISIONS[input.decision];
  let due = rule.unit === "working" ? addWorking(deemed, rule.days) : addDays(deemed, rule.days);
  lines.push(`${rule.note} ${rule.days} ${rule.unit === "working" ? "working days" : "days"} from ${nice(deemed)} is ${nice(due)}.`);
  if (rule.unit === "days" && !working(due)) {
    const why = holidayName(due) ?? (due.getUTCDay() === 6 ? "a Saturday" : "a Sunday");
    while (!working(due)) due = addDays(due, 1);
    lines.push(`That's ${why}, so it moves to the next working day, ${nice(due)}.`);
  }
  return { deemedOn: iso(deemed), dueOn: iso(due), days: rule.days, unit: rule.unit, explanation: lines };
}
