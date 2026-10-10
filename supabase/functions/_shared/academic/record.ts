import type { GradeScale, RecordSummary, TermSummary, UnitResult, UnitStatus } from "./index.ts";

/**
 * Transcript summary: counts, credit, GPA, WAM and progress warnings from a list of units.
 *
 * Grades follow the scales most Australian providers use. Anything the engine can't read is
 * left out of the totals and reported (`unknownGrades`, `unitsUnclassified`, `notes`) instead
 * of being guessed.
 */

/** 7-point scale used by most Australian universities. */
const AU7: Record<string, number> = {
  HD: 7,
  D: 6,
  DN: 6,
  C: 5,
  CR: 5,
  P: 4,
  PA: 4,
  N: 0,
  F: 0,
  NN: 0,
  FL: 0,
  FA: 0,
  FF: 0,
};

/** 4-point scale. */
const AU4: Record<string, number> = {
  HD: 4,
  D: 3,
  DN: 3,
  C: 2,
  CR: 2,
  P: 1,
  PA: 1,
  N: 0,
  F: 0,
  NN: 0,
  FL: 0,
  FA: 0,
  FF: 0,
};

/** Spelled-out grades some transcripts use. "Credit" is not here: it usually means credit granted. */
const WORDS: Record<string, string> = { "HIGH DISTINCTION": "HD", DISTINCTION: "D", PASS: "P", FAIL: "F" };

/** Graded fails (0 grade points). */
const FAIL = new Set(["N", "F", "NN", "FL", "FA", "FF"]);
/** Ungraded fails (satisfactory/unsatisfactory units): failed, but no grade points. */
const UNGRADED_FAIL = new Set(["US", "NS", "UF", "NGF"]);
/** Ungraded passes: passed, but no grade points. */
const UNGRADED_PASS = new Set(["S", "SY", "UP", "PU", "NGP", "SAT"]);
/** Credit transfer, exemption, advanced standing, recognition of prior learning. */
const CREDIT = new Set([
  "CT",
  "EX",
  "AS",
  "ADV",
  "RPL",
  "CREDIT",
  "CREDIT TRANSFER",
  "ADVANCED STANDING",
  "EXEMPTION",
  "EXEMPT",
]);
const WITHDRAWN = new Set(["W", "WN", "WD", "WDN", "WITHDRAWN"]);
/** Results not out yet: result pending, deferred assessment, incomplete, in progress. */
const PENDING = new Set(["RP", "DEF", "DE", "I", "INC", "IP", "ENR", "ENROLLED"]);

/** Pass mark used to judge units that have a mark but no readable grade. */
export const PASS_MARK = 50;

const UNKNOWN_TERM = "Unknown term";

function normalise(grade: string | undefined | null): string {
  if (typeof grade !== "string") return "";
  const g = grade.trim().toUpperCase().replace(/\s+/g, " ");
  return WORDS[g] ?? g;
}

/** Grade points for a grade on a scale (case-insensitive); null if the scale doesn't know the grade. */
export function gradePoint(grade: string, scale: GradeScale = "au7"): number | null {
  const g = normalise(grade);
  const table = scale === "au4" ? AU4 : AU7;
  return g in table ? table[g] : null;
}

/** True if the grade is a status code the engine understands (credit, withdrawn, pending, ungraded). */
function isStatusCode(g: string): boolean {
  return CREDIT.has(g) || WITHDRAWN.has(g) || PENDING.has(g) || UNGRADED_PASS.has(g) || UNGRADED_FAIL.has(g);
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function validMark(mark: unknown): number | null {
  return typeof mark === "number" && Number.isFinite(mark) && mark >= 0 && mark <= 100 ? mark : null;
}

function validCredit(credit: unknown): number | null {
  return typeof credit === "number" && Number.isFinite(credit) && credit >= 0 ? credit : null;
}

type Inferred = { status: UnitStatus | null; byMark: boolean };

/** The unit's status as given, or inferred from its grade and mark. */
function inferStatus(u: UnitResult, scale: GradeScale): Inferred {
  if (u.status) return { status: u.status, byMark: false };
  const g = normalise(u.grade);
  const mark = validMark(u.mark);
  const byMark = (): Inferred => ({ status: mark! >= PASS_MARK ? "passed" : "failed", byMark: true });
  if (g) {
    if (FAIL.has(g) || UNGRADED_FAIL.has(g)) return { status: "failed", byMark: false };
    if (CREDIT.has(g)) return { status: "credit", byMark: false };
    if (WITHDRAWN.has(g)) return { status: "withdrawn", byMark: false };
    if (PENDING.has(g)) return { status: "enrolled", byMark: false };
    const point = gradePoint(g, scale);
    if (point !== null && point > 0) return { status: "passed", byMark: false };
    if (UNGRADED_PASS.has(g)) return { status: "passed", byMark: false };
    return mark !== null ? byMark() : { status: null, byMark: false };
  }
  if (mark !== null) return byMark();
  return { status: "enrolled", byMark: false };
}

/** Most common credit value among units that have one (first seen wins a tie). */
function commonCredit(units: UnitResult[]): number | null {
  const counts = new Map<number, number>();
  for (const u of units) {
    const c = validCredit(u.credit);
    if (c !== null && c > 0) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = 0;
  for (const [c, n] of counts) {
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

const PERIOD_WORDS: Record<string, number> = { one: 1, first: 1, two: 2, second: 2, three: 3, third: 3, four: 4 };

/**
 * Sort key for a term name such as "2025 Semester 1", "T2 2024", "Summer 2025" or "Spring session 2023".
 * Terms without a year sort last, in the order they first appear.
 */
function termOrder(term: string): number {
  if (term === UNKNOWN_TERM) return Number.MAX_SAFE_INTEGER;
  const t = term.toLowerCase();
  const year = /\b(19|20)\d{2}\b/.exec(t);
  let rank = 50;
  if (/summer/.test(t)) rank = 0;
  else if (/winter/.test(t)) rank = 15;
  else if (/autumn/.test(t)) rank = 10;
  else if (/spring/.test(t)) rank = 20;
  else {
    const m = /(?:semester|sem|trimester|tri|term|session|study period|teaching period|sp|tp|\bs|\bt|\bq)\s*-?\s*(\d|one|two|three|four|first|second|third)\b/
      .exec(t);
    if (m) rank = 10 * (PERIOD_WORDS[m[1]] ?? Number(m[1]));
  }
  return (year ? Number(year[0]) : 9000) * 100 + rank;
}

function unitKey(u: UnitResult): string | null {
  const k = (u.code ?? u.name ?? "").trim().toUpperCase();
  return k || null;
}

function label(u: UnitResult): string {
  return (u.code ?? u.name ?? "").trim();
}

/**
 * Summarise a transcript.
 *
 * - Status is taken from the unit, or inferred: fail grades → failed; CT/EX/AS/ADV/RPL/"credit" →
 *   credit; W/WN/WD/WDN → withdrawn; no grade and no mark → enrolled; a passing grade → passed;
 *   only a mark → passed at 50 or more.
 * - `creditPassed` includes granted credit; `creditGranted` is that credit on its own.
 * - GPA is credit-weighted over passed and failed units with a grade the scale knows; WAM is
 *   credit-weighted over passed and failed units with a mark. A unit without a credit value is
 *   weighted as the most common unit credit on the record (or 1 if none has one).
 * - A term is "at risk" when failed credit is at least half of the credit attempted in it.
 */
export function summariseRecord(units: UnitResult[], scale: GradeScale = "au7"): RecordSummary {
  const list = Array.isArray(units) ? units.filter((u) => u && typeof u === "object") : [];
  const common = commonCredit(list);
  const weightOf = (u: UnitResult) => validCredit(u.credit) ?? common ?? 1;

  let unitsPassed = 0, unitsFailed = 0, unitsEnrolled = 0, unitsCredited = 0, unitsWithdrawn = 0;
  let unitsUnclassified = 0, creditUnknownUnits = 0;
  let creditPassed = 0, creditFailed = 0, creditGranted = 0, creditEnrolled = 0;
  let gpaSum = 0, gpaWeight = 0, wamSum = 0, wamWeight = 0;
  let markOnly = 0, imputedGraded = 0;
  const unknown = new Map<string, string>();
  const unclassifiedGrades = new Set<string>();
  const gradeCounts: Record<string, number> = {};
  const failCount = new Map<string, { label: string; n: number }>();
  const passedKeys = new Set<string>();
  const enrolledKeys = new Set<string>();

  type TermAcc = {
    first: number;
    passed: number;
    failed: number;
    attempted: number;
    failedCredit: number;
    gpaSum: number;
    gpaW: number;
    wamSum: number;
    wamW: number;
  };
  const termAcc = new Map<string, TermAcc>();

  list.forEach((u, i) => {
    const g = normalise(u.grade);
    const point = g ? gradePoint(g, scale) : null;
    if (g && point === null && !FAIL.has(g) && !isStatusCode(g) && !unknown.has(g)) {
      unknown.set(g, String(u.grade).trim());
    }
    const credit = validCredit(u.credit);
    if (credit === null) creditUnknownUnits++;
    const { status, byMark } = inferStatus(u, scale);
    if (byMark) markOnly++;
    const key = unitKey(u);
    const c = credit ?? 0;

    switch (status) {
      case "passed":
        unitsPassed++;
        creditPassed += c;
        if (key) passedKeys.add(key);
        break;
      case "failed":
        unitsFailed++;
        creditFailed += c;
        if (key) {
          const f = failCount.get(key) ?? { label: label(u), n: 0 };
          f.n++;
          failCount.set(key, f);
        }
        break;
      case "credit":
        unitsCredited++;
        creditPassed += c;
        creditGranted += c;
        break;
      case "enrolled":
        unitsEnrolled++;
        creditEnrolled += c;
        if (key) enrolledKeys.add(key);
        break;
      case "withdrawn":
        unitsWithdrawn++;
        break;
      default:
        unitsUnclassified++;
        if (g) unclassifiedGrades.add(String(u.grade).trim());
    }

    if (status !== "passed" && status !== "failed") return;

    const w = weightOf(u);
    if (credit === null && point !== null) imputedGraded++;
    const mark = validMark(u.mark);
    if (point !== null) {
      gpaSum += point * w;
      gpaWeight += w;
      const band = FAIL.has(g) ? "N" : g === "DN" ? "D" : g === "CR" ? "C" : g === "PA" ? "P" : g;
      gradeCounts[band] = (gradeCounts[band] ?? 0) + 1;
    }
    if (mark !== null) {
      wamSum += mark * w;
      wamWeight += w;
    }

    const term = (u.term ?? "").trim() || UNKNOWN_TERM;
    const t = termAcc.get(term) ??
      { first: i, passed: 0, failed: 0, attempted: 0, failedCredit: 0, gpaSum: 0, gpaW: 0, wamSum: 0, wamW: 0 };
    t.attempted += w;
    if (status === "passed") t.passed++;
    else {
      t.failed++;
      t.failedCredit += w;
    }
    if (point !== null) {
      t.gpaSum += point * w;
      t.gpaW += w;
    }
    if (mark !== null) {
      t.wamSum += mark * w;
      t.wamW += w;
    }
    termAcc.set(term, t);
  });

  const ordered = [...termAcc.entries()].sort((a, b) =>
    termOrder(a[0]) - termOrder(b[0]) || a[1].first - b[1].first
  );
  const terms: TermSummary[] = ordered.map(([term, t]) => ({
    term,
    unitsPassed: t.passed,
    unitsFailed: t.failed,
    creditAttempted: round2(t.attempted),
    creditFailed: round2(t.failedCredit),
    gpa: t.gpaW > 0 ? round2(t.gpaSum / t.gpaW) : null,
    wam: t.wamW > 0 ? round2(t.wamSum / t.wamW) : null,
    atRisk: t.failedCredit > 0 && t.attempted > 0 && t.failedCredit >= t.attempted / 2,
  }));

  const failedByTerm: Record<string, number> = {};
  for (const t of terms) if (t.creditFailed > 0) failedByTerm[t.term] = t.creditFailed;
  const termsAtRisk = terms.filter((t) => t.atRisk).map((t) => t.term);

  const repeatedFails = [...failCount.values()].filter((f) => f.n > 1).map((f) => f.label);
  const failedNotRepassed = [...failCount.entries()]
    .filter(([k]) => !passedKeys.has(k) && !enrolledKeys.has(k))
    .map(([, f]) => f.label);

  const gpa = gpaWeight > 0 ? round2(gpaSum / gpaWeight) : null;
  const wam = wamWeight > 0 ? round2(wamSum / wamWeight) : null;
  const attempted = unitsPassed + unitsFailed;

  const notes: string[] = [];
  if (markOnly > 0) {
    notes.push(
      `${markOnly} ${
        markOnly === 1 ? "unit has" : "units have"
      } a mark but no grade we could read; mark-only units judged against a pass mark of ${PASS_MARK} (check your provider's pass mark).`,
    );
  }
  if (unitsUnclassified > 0) {
    const grades = [...unclassifiedGrades];
    notes.push(
      `${unitsUnclassified} ${unitsUnclassified === 1 ? "unit has a result" : "units have results"} we couldn't read${
        grades.length ? ` (${grades.join(", ")})` : ""
      }, so ${unitsUnclassified === 1 ? "it is" : "they are"} left out of the totals.`,
    );
  }
  if (creditUnknownUnits > 0 && list.length > 0) {
    notes.push(
      `${creditUnknownUnits} ${
        creditUnknownUnits === 1 ? "unit has" : "units have"
      } no credit value, so the credit totals leave ${creditUnknownUnits === 1 ? "it" : "them"} out.`,
    );
  }
  if (imputedGraded > 0) {
    notes.push(
      common !== null
        ? `For GPA and WAM, ${imputedGraded} graded ${
          imputedGraded === 1 ? "unit" : "units"
        } without a credit value ${imputedGraded === 1 ? "was" : "were"} weighted as ${common} credit points, the most common unit value on your record.`
        : "No unit has a credit value, so GPA and WAM weight every unit equally.",
    );
  }
  if (unitsWithdrawn > 0) {
    notes.push(
      "Withdrawn units don't count as passed or failed here; some providers record a late withdrawal as a fail, so check the grade key on your transcript.",
    );
  }
  if (wam !== null) {
    notes.push(
      "This WAM is a simple credit-weighted average of your marks; some providers weight later years more or leave some units out.",
    );
  }
  if (termsAtRisk.length > 0) {
    notes.push(
      `You failed at least half of the credit you attempted in ${
        termsAtRisk.join(", ")
      }. Providers commonly review academic progress when that happens, so check your provider's academic progress policy.`,
    );
  }
  if (repeatedFails.length > 0) {
    notes.push(
      `You've failed ${
        repeatedFails.join(", ")
      } more than once; failing a unit twice is another common academic progress trigger.`,
    );
  }
  if (failedNotRepassed.length > 0) {
    notes.push(`Still to pass after a fail: ${failedNotRepassed.join(", ")}.`);
  }

  return {
    unitsPassed,
    unitsFailed,
    unitsEnrolled,
    unitsCredited,
    creditPassed: round2(creditPassed),
    creditFailed: round2(creditFailed),
    creditGranted: round2(creditGranted),
    creditUnknownUnits,
    gpa,
    gpaScale: scale,
    wam,
    failedByTerm,
    termsAtRisk,
    unknownGrades: [...unknown.values()],
    notes,
    unitsWithdrawn,
    unitsUnclassified,
    creditEnrolled: round2(creditEnrolled),
    commonUnitCredit: common,
    passRate: attempted > 0 ? Math.round((unitsPassed / attempted) * 1000) / 10 : null,
    gradeCounts,
    terms,
    repeatedFails,
    failedNotRepassed,
  };
}
