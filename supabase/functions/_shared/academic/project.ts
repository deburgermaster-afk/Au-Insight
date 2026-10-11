// What the rest of a course has to look like for a target WAM: deterministic, so the assistant never
// does this arithmetic itself. A course still in progress isn't a reason to say "not eligible": the
// question is what final WAM the student is heading for, and what it takes to reach a threshold.

import type { RecordSummary } from "./index.ts";

export type WamTarget = {
  wam: number; // the final WAM wanted
  neededAverage: number | null; // average mark needed in the remaining credit (null when nothing remains)
  reachable: boolean; // the needed average is at most 100
};

export type WamProjection = {
  currentWam: number;
  gradedCredit: number; // credit points the current WAM is worked out over (passed + failed)
  remainingCredit: number; // credit points still to be graded to finish the course
  bestPossible: number; // final WAM if every remaining unit scores 100
  targets: WamTarget[];
  ifAverage: { average: number; finalWam: number }[]; // final WAM for a given average from here on
  notes: string[];
};

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Projects the final WAM of the current course from the transcript summary and the course's total
 * credit points. Returns null when the record has no WAM or the course length is unknown.
 */
export function wamProjection(
  summary: RecordSummary | null | undefined,
  courseCredit: number | null | undefined,
  targets: number[] = [50, 55, 60, 65, 70, 75, 80, 85],
): WamProjection | null {
  if (!summary || summary.wam == null || !courseCredit || courseCredit <= 0) {
    return null;
  }
  const graded =
    (summary.terms ?? []).reduce((a, t) => a + t.creditAttempted, 0) ||
    summary.creditPassed - summary.creditGranted + summary.creditFailed;
  if (graded <= 0) return null;
  // Granted credit carries no mark; failed units still have to be passed, so they stay in what remains.
  const remaining = Math.max(0, courseCredit - summary.creditPassed);
  const wam = summary.wam;
  const finalFor = (avg: number) =>
    (wam * graded + avg * remaining) / (graded + remaining);
  const needed = (target: number) =>
    remaining > 0
      ? (target * (graded + remaining) - wam * graded) / remaining
      : null;
  return {
    currentWam: round1(wam),
    gradedCredit: round1(graded),
    remainingCredit: round1(remaining),
    bestPossible: round1(finalFor(100)),
    targets: targets.map((t) => {
      const n = needed(t);
      return {
        wam: t,
        neededAverage: n == null ? null : round1(Math.max(0, n)),
        reachable: n == null ? wam >= t : n <= 100,
      };
    }),
    ifAverage: [60, 65, 70, 75, 80, 85, 90].map((a) => ({
      average: a,
      finalWam: round1(finalFor(a)),
    })),
    notes: [
      "Worked out as a credit-weighted average with failed units kept in, the way most providers calculate WAM. Providers that drop a failed mark once the unit is passed, or weight later years more, give a higher figure: check the provider's WAM rules.",
    ],
  };
}
