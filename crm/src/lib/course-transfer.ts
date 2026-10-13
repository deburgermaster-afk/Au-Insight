// What changing course or provider means for an international student, so staff see it before
// they commit: provider release (ESOS National Code Standard 7), visa (course level), CoE and
// commission. Advice only; the agent confirms with the provider and Home Affairs guidance.

export const COMMISSION_BAN_FROM = "2026-03-31";

export type TransferFacts = {
  sameProvider: boolean;
  fromStatus: string;
  fromAqf: number | null;
  toAqf: number | null;
  fromStart: string | null;
  transferOn: string;
  onshore: boolean;
};

export type TransferCheck = { level: "block" | "warn" | "info"; text: string };

const monthsBetween = (a: string, b: string) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
};

export function releaseNeeded(f: TransferFacts) {
  if (f.sameProvider) return false;
  if (!["coe", "enrolled"].includes(f.fromStatus)) return false;
  if (!f.fromStart) return true; // can't tell: assume the 6 months haven't passed
  return monthsBetween(f.fromStart, f.transferOn) < 6;
}

export function transferChecks(f: TransferFacts): TransferCheck[] {
  const out: TransferCheck[] = [];
  if (releaseNeeded(f))
    out.push({ level: "warn", text: "The student hasn't finished 6 months of their principal course with the current provider, so they need a release letter from that provider before the new provider can enrol them (ESOS National Code, Standard 7)." });
  else if (!f.sameProvider && ["coe", "enrolled"].includes(f.fromStatus)) out.push({ level: "info", text: "More than 6 months into the principal course: no release letter is needed, but the current provider should still be told." });
  if (f.fromAqf != null && f.toAqf != null && f.toAqf < f.fromAqf && f.fromAqf > 0) {
    const doctorToMaster = f.fromAqf === 10 && f.toAqf === 9;
    out.push(
      doctorToMaster
        ? { level: "info", text: "Moving from a doctorate to a masters by research doesn't need a new student visa." }
        : { level: "block", text: `This is a lower AQF level (${f.fromAqf} → ${f.toAqf}). A student visa holder moving to a lower-level course generally needs to apply for a new student visa before changing.` },
    );
  }
  if (!f.sameProvider) out.push({ level: "info", text: "The new provider issues a new CoE and the old one is cancelled. The student must stay enrolled throughout (visa condition 8202): don't let the old CoE end before the new one starts." });
  if (f.onshore && !f.sameProvider && f.transferOn > COMMISSION_BAN_FROM)
    out.push({ level: "warn", text: "Onshore provider transfer: from 31 March 2026 the new provider can't pay the agency commission for it. The new application is marked commission-ineligible." });
  return out;
}
