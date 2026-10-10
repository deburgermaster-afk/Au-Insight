// Academic progress engine: deterministic, like the visa rules engine. Given a student's units
// (from transcripts or the profile) and their course and visa dates, it computes progress, GPA and
// WAM, and every way to finish on time. Unknowns are never guessed: they come back in `missing`
// with the question to ask. Provider-specific numbers (load per term, overload limit, credit
// allowed) are inputs, because every provider sets its own.
//
// CONTRACT FILE: the types and function signatures below are fixed (the chat tools and the app
// are built against them). Implementations live in sibling modules and are re-exported here.

export type GradeScale = "au7" | "au4";

export type UnitStatus = "passed" | "failed" | "enrolled" | "withdrawn" | "credit";

/** One unit (subject) from a transcript. Credit is in the provider's credit points. */
export type UnitResult = {
  code?: string;
  name?: string;
  credit?: number;
  grade?: string; // HD, D, DN, C, CR, P, PA, N, F, NN, WN, CT, ...
  mark?: number; // 0-100
  term?: string; // e.g. "2025 Semester 1"
  status?: UnitStatus;
};

export type RecordSummary = {
  unitsPassed: number;
  unitsFailed: number;
  unitsEnrolled: number;
  unitsCredited: number;
  creditPassed: number; // credit points passed (includes granted credit)
  creditFailed: number;
  creditGranted: number;
  creditUnknownUnits: number; // units with no credit value
  gpa: number | null; // on `gpaScale`, credit-weighted
  gpaScale: GradeScale;
  wam: number | null; // credit-weighted average mark of graded units with marks
  failedByTerm: Record<string, number>; // failed credit points per term
  termsAtRisk: string[]; // terms where failed credit was at least half of the credit attempted
  unknownGrades: string[]; // grade strings the scale doesn't know
  // Optional extras (added by the engine; consumers may ignore them).
  notes?: string[]; // plain sentences about how the summary was worked out
  unitsWithdrawn?: number;
  unitsUnclassified?: number; // units whose result couldn't be read (unknown grade, no mark, no status)
  creditEnrolled?: number; // credit points in progress (feeds PlanInput.creditEnrolled)
  commonUnitCredit?: number | null; // most common credit value of a unit (a hint for PlanInput.creditPerUnit)
  passRate?: number | null; // percent of attempted (passed + failed) units passed
  gradeCounts?: Record<string, number>; // graded results by band: HD, D, C, P, N (fail)
  terms?: TermSummary[]; // per study period, oldest first (best effort from the term names)
  repeatedFails?: string[]; // units failed more than once
  failedNotRepassed?: string[]; // failed units with no later pass and no current enrolment (still to clear)
};

/** Results for one study period of a transcript. */
export type TermSummary = {
  term: string;
  unitsPassed: number;
  unitsFailed: number;
  creditAttempted: number; // passed + failed credit (a unit without credit counts as the most common unit credit)
  creditFailed: number;
  gpa: number | null;
  wam: number | null;
  atRisk: boolean; // failed credit was at least half of the credit attempted
};

export type Missing = { fact: string; question: string };

export type PlanInput = {
  today: string; // YYYY-MM-DD
  courseCredit?: number; // credit points needed for the whole course
  creditPerUnit?: number; // credit points of a standard unit
  creditDone?: number; // credit points passed so far (excluding granted credit)
  creditGranted?: number; // credit transfer / RPL already granted
  creditEnrolled?: number; // credit points in progress this term (counted if passed)
  termsPerYear?: number; // main study periods per year (2 for semesters, 3 for trimesters)
  termStarts?: string[]; // known start dates (YYYY-MM-DD) of upcoming main study periods
  standardUnits?: number; // units per main study period at a full-time load
  maxOverloadUnits?: number; // most units the provider allows in a study period with approval
  extraTermsPerYear?: number; // summer/winter terms the provider runs
  extraTermUnits?: number; // units allowed in each summer/winter term
  crossInstUnits?: number; // units the student could take at another provider (cross-institutional)
  additionalCreditPossible?: number; // further credit (points) the student could still apply for
  coeEnd?: string; // CoE end date (YYYY-MM-DD)
  visaExpiry?: string; // student visa expiry (YYYY-MM-DD)
  termWeeks?: number; // optional: weeks from the start to the end of a main study period (incl. exams)
  extraTermWeeks?: number; // optional: length of a summer/winter term in weeks (estimated as 6 when unknown)
};

export type ScenarioId = "standard" | "extra_terms" | "overload" | "credit" | "cross_institutional" | "combined";

export type Scenario = {
  id: ScenarioId;
  label: string;
  unitsPerMainTerm: number;
  termsNeeded: number; // main study periods still needed
  finishBy: string | null; // YYYY-MM estimate of the last study period's end
  finishesBeforeCoe: boolean | null;
  finishesBeforeVisa: boolean | null;
  needs: string[]; // what the student must arrange (approval, credit application...)
  // Optional extras (added by the engine; consumers may ignore them).
  finishDate?: string | null; // YYYY-MM-DD estimate of the last study period's end
  daysToSpareCoe?: number | null; // CoE end minus finish date (negative = finishes after the CoE end)
  daysToSpareVisa?: number | null; // visa expiry minus finish date
  unitsToStudy?: number; // units still to pass in this scenario
  extraTermsNeeded?: number; // summer/winter terms used
  crossInstUnitsUsed?: number; // units taken at another provider
  creditApplied?: number; // further credit points assumed granted
};

export type PlanStatus = "on_track" | "at_risk" | "cannot_finish" | "needs_info" | "completed";

export type PlanResult = {
  status: PlanStatus;
  remainingCredit: number | null;
  remainingUnits: number | null;
  mainTermsUntilCoeEnd: number | null;
  mainTermsUntilVisaExpiry: number | null;
  requiredUnitsPerTerm: number | null; // to finish by the CoE end with main terms only
  scenarios: Scenario[];
  notes: string[];
  missing: Missing[];
  // Optional extras (added by the engine; consumers may ignore them).
  progressPercent?: number | null; // share of the course passed or credited
  daysUntilCoeEnd?: number | null;
  daysUntilVisaExpiry?: number | null;
  fastestScenario?: ScenarioId | null; // scenario with the earliest finish
  simplestOnTime?: ScenarioId | null; // first scenario (fewest arrangements) that finishes by the CoE end
  calendar?: StudyPeriod[]; // upcoming study periods the plan walked through
  estimatedDates?: boolean; // true when some study period dates are estimates
};

/** One upcoming study period in the plan's calendar. */
export type StudyPeriod = {
  kind: "main" | "extra"; // extra = summer/winter term
  start: string; // YYYY-MM-DD
  end: string | null; // YYYY-MM-DD, null if it can't be estimated
  estimated: boolean; // start or end is an estimate
};

/** AQF level names as used by CRICOS ("Diploma", "Bachelor Degree", ...). */
export type AqfLevel = string;

export type CreditGuide = {
  percent: number | null; // guideline share of the destination course, if the policy gives one
  note: string;
  source: { title: string; url: string };
  years?: number | null; // optional: the guideline credit in years of full-time study
};

export { gradePoint, summariseRecord } from "./record.ts";
export { studyPlan } from "./plan.ts";
export { aqfCreditGuide } from "./credit.ts";
