import type { Missing, PlanInput, PlanResult, PlanStatus, Scenario, ScenarioId, StudyPeriod } from "./index.ts";

/**
 * Study plan: how much of the course is left and every way to finish it, checked against the
 * CoE end date and the visa expiry.
 *
 * Everything provider-specific (credit points, load per study period, overload limit, summer and
 * winter terms, cross-institutional units, further credit) is an input. A missing input becomes a
 * question in `missing`; scenarios that need it are left out and the notes say what to find out.
 * Study period dates that aren't given are estimated, and the notes say so.
 */

const DAY = 86_400_000;
/** Most main study periods the calendar will hold. */
const MAX_MAIN_PERIODS = 80;
/** Summer/winter term length when the provider's isn't known. */
const DEFAULT_EXTRA_WEEKS = 6;
/** A finish this close to a deadline gets a "check exact dates" note. */
const CLOSE_CALL_DAYS = 28;

const COE_EXTENSION_NOTE =
  "Finishing after your CoE end date means asking your provider to extend the CoE; if that goes past your visa expiry you would need a new visa.";

/** Order used for `simplestOnTime`: fewer arrangements first. */
const EFFORT_ORDER: ScenarioId[] = ["standard", "extra_terms", "credit", "overload", "cross_institutional", "combined"];

const NEEDS = {
  extra: "enrolment in summer/winter terms (check which of your remaining units run then)",
  overload: "provider approval for overload (check their policy and GPA requirement)",
  credit: "apply for credit/RPL",
  cross: "permission from home provider + enrolment at the other provider",
  crossLoad: "approval for the higher total load (home units plus the other provider's)",
};

type Period = {
  kind: "main" | "extra";
  start: number;
  end: number | null;
  estimated: boolean;
};

// ---------- small date and number helpers (UTC midnight timestamps) ----------

/** Parses YYYY-MM-DD (anything after the date, like a time, is ignored); null if not a real date. */
function parseDate(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  const dt = new Date(t);
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo && dt.getUTCDate() === d ? t : null;
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const yearMonth = (t: number) => iso(t).slice(0, 7);
const addDays = (t: number, days: number) => t + Math.round(days) * DAY;
const daysBetween = (from: number, to: number) => Math.round((to - from) / DAY);

/** Adds a (possibly fractional or negative) number of months; the fraction is added as days. */
function addMonths(t: number, months: number): number {
  const whole = Math.floor(months);
  const frac = months - whole;
  const d = new Date(t);
  const y = d.getUTCFullYear(), m = d.getUTCMonth() + whole;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const r = Date.UTC(y, m, Math.min(d.getUTCDate(), lastDay));
  return frac > 0 ? addDays(r, frac * 30.44) : r;
}

const positive = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n > 0 ? n : undefined;
const nonNegative = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : undefined;
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmtNum = (n: number) => String(round2(n));
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

// ---------- the walk ----------

type Walk = {
  done: boolean;
  mainsUsed: number;
  extrasUsed: number;
  crossUsed: number;
  finish: number | null; // end of the last period used (null if unknown or not finished)
  left: number;
};

/** Steps through the calendar taking units each period until none are left. */
function walk(
  periods: Period[],
  today: number,
  units: number,
  perMain: number,
  extraUnits: number,
  crossUnits: number,
  crossCap: number,
): Walk {
  let left = units, crossLeft = Math.min(crossUnits, units);
  let mainsUsed = 0, extrasUsed = 0, crossUsed = 0;
  let finish: number | null = today, unknownEnd = false;
  if (left <= 0) return { done: true, mainsUsed, extrasUsed, crossUsed, finish, left: 0 };
  for (const p of periods) {
    let take: number;
    if (p.kind === "extra") {
      if (extraUnits <= 0) continue;
      take = Math.min(left, extraUnits);
      extrasUsed++;
    } else {
      take = Math.min(left, perMain);
      const cross = Math.min(crossLeft, crossCap, left - take);
      if (cross > 0) {
        take += cross;
        crossLeft -= cross;
        crossUsed += cross;
      }
      mainsUsed++;
    }
    left -= take;
    if (p.end === null) unknownEnd = true;
    else if (finish !== null && p.end > finish) finish = p.end;
    if (left <= 0) return { done: true, mainsUsed, extrasUsed, crossUsed, finish: unknownEnd ? null : finish, left: 0 };
  }
  return { done: false, mainsUsed, extrasUsed, crossUsed, finish: null, left };
}

/**
 * Builds the study plan.
 *
 * - remainingCredit = courseCredit − creditDone − creditGranted − creditEnrolled (enrolled units are
 *   counted as passing); remainingUnits = ceil(remainingCredit / creditPerUnit).
 * - The calendar starts from `today`: known `termStarts`, then main periods every 12/termsPerYear
 *   months after the last known start (or after today if none). A main period lasts `termWeeks`
 *   (estimated as 75% of the gap between starts when unknown). Summer/winter terms (about 6 weeks)
 *   sit in the gaps after main periods, the year's last gap first.
 * - Scenarios walk the calendar: standard, extra_terms, overload, credit, cross_institutional and
 *   combined. A scenario is only built when its numbers are known.
 * - Status: completed (nothing left), needs_info (a required fact is missing), on_track (standard
 *   load finishes by the CoE end), at_risk (another scenario does, or something finishes by the visa
 *   expiry), cannot_finish (nothing does).
 */
export function studyPlan(input: PlanInput): PlanResult {
  const today = parseDate(input?.today);
  if (today === null) throw new RangeError("studyPlan: `today` must be a YYYY-MM-DD date");

  const courseCredit = positive(input.courseCredit);
  const creditPerUnit = positive(input.creditPerUnit);
  const creditDone = nonNegative(input.creditDone);
  const creditGranted = nonNegative(input.creditGranted) ?? 0;
  const creditEnrolled = nonNegative(input.creditEnrolled) ?? 0;
  const standardUnits = positive(input.standardUnits);
  const maxOverloadUnits = positive(input.maxOverloadUnits);
  const extraTermsPerYear = Math.round(nonNegative(input.extraTermsPerYear) ?? 0);
  const extraTermUnits = positive(input.extraTermUnits);
  const crossInstUnits = positive(input.crossInstUnits);
  const additionalCredit = positive(input.additionalCreditPossible);
  const termWeeks = positive(input.termWeeks);
  const extraWeeks = positive(input.extraTermWeeks) ?? DEFAULT_EXTRA_WEEKS;
  const coeEnd = parseDate(input.coeEnd);
  const visaExpiry = parseDate(input.visaExpiry);
  const givenPerYear = positive(input.termsPerYear) ? Math.round(input.termsPerYear!) || undefined : undefined;
  const knownStarts = [
    ...new Set(
      (Array.isArray(input.termStarts) ? input.termStarts : []).map(parseDate).filter((t): t is number => t !== null),
    ),
  ].sort((a, b) => a - b);

  const notes: string[] = [];
  const missing: Missing[] = [];
  const ask = (fact: string, question: string) => missing.push({ fact, question });

  if (courseCredit === undefined) ask("courseCredit", "How many credit points does your whole course need?");
  if (creditPerUnit === undefined) {
    ask("creditPerUnit", "How many credit points is one standard unit (subject) worth in your course?");
  }
  if (creditDone === undefined) {
    ask("creditDone", "How many credit points have you passed so far, not counting credit you were granted?");
  }
  if (standardUnits === undefined) {
    ask("standardUnits", "How many units make a full-time load in one study period at your provider?");
  }
  if (coeEnd === null) ask("coeEnd", "What is the course end date on your CoE?");
  if (givenPerYear === undefined && knownStarts.length === 0) {
    ask(
      "termsPerYear",
      "How many main study periods does your provider run each year (for example 2 semesters or 3 trimesters), and when does the next one start?",
    );
  }

  // ---------- remaining credit ----------
  let remainingCredit: number | null = null;
  let remainingUnits: number | null = null;
  if (courseCredit !== undefined && creditDone !== undefined) {
    remainingCredit = Math.max(0, round2(courseCredit - creditDone - creditGranted - creditEnrolled));
    if (creditPerUnit !== undefined) {
      remainingUnits = Math.max(0, Math.ceil(remainingCredit / creditPerUnit - 1e-9));
      const exact = remainingCredit / creditPerUnit;
      if (remainingCredit > 0 && Math.abs(exact - Math.round(exact)) > 1e-9) {
        notes.push(
          `Your remaining ${fmtNum(remainingCredit)} credit points aren't a whole number of ${
            fmtNum(creditPerUnit)
          }-point units, so we rounded up to ${plural(remainingUnits, "unit")}.`,
        );
      }
    }
  }
  const completed = remainingCredit !== null && remainingCredit <= 0;
  if (creditEnrolled > 0 && remainingCredit !== null) {
    notes.push(
      completed
        ? `You'll have all the credit your course needs once you pass the ${
          fmtNum(creditEnrolled)
        } credit points you're enrolled in now.`
        : `We counted the ${
          fmtNum(creditEnrolled)
        } credit points you're enrolled in now as passed; if you fail any, they add to what's left.`,
    );
  } else if (completed) {
    notes.push("You've passed or been credited all the credit points your course needs.");
  }

  // ---------- calendar ----------
  let perYear = givenPerYear;
  if (perYear === undefined && knownStarts.length >= 2) {
    const gaps = knownStarts.slice(1).map((t, i) => daysBetween(knownStarts[i], t));
    const guess = Math.round(365.25 / median(gaps));
    if (guess >= 1 && guess <= 6) {
      perYear = guess;
      notes.push(`From the study period dates you gave, we assumed ${perYear} main study periods a year.`);
    }
  }
  const spacing = perYear ? 12 / perYear : null; // months between main period starts
  const endEstimated = termWeeks === undefined;
  const mainEnd = (start: number): number | null =>
    termWeeks !== undefined ? addDays(start, termWeeks * 7) : spacing !== null ? addMonths(start, spacing * 0.75) : null;

  const mains: Period[] = knownStarts.filter((t) => t >= today).map((t) => ({
    kind: "main",
    start: t,
    end: mainEnd(t),
    estimated: endEstimated,
  }));
  const minPerMain = Math.min(standardUnits ?? 1, maxOverloadUnits ?? Infinity);
  const neededMains = remainingUnits !== null ? Math.ceil(remainingUnits / minPerMain) + 1 : 2;
  const horizon = Math.max(coeEnd ?? 0, visaExpiry ?? 0);
  let generated = false;
  if (spacing !== null) {
    const anchor = knownStarts.length ? knownStarts[knownStarts.length - 1] : today;
    for (let k = 1; mains.length < MAX_MAIN_PERIODS; k++) {
      const s = addMonths(anchor, k * spacing);
      if (s < today) continue;
      const last = mains[mains.length - 1];
      if (mains.length >= neededMains && last && last.start > horizon) break;
      mains.push({ kind: "main", start: s, end: mainEnd(s), estimated: true });
      generated = true;
    }
  } else if (knownStarts.length > 0 && remainingUnits !== null && remainingUnits > 0) {
    if (!missing.some((m) => m.fact === "termsPerYear")) {
      ask(
        "termsPerYear",
        "How many main study periods does your provider run each year (for example 2 semesters or 3 trimesters)? We need it to plan past the dates you gave.",
      );
    }
  }

  // Summer/winter terms go in the gaps after main periods. The period before the first upcoming one
  // (the current one, if known) is included so the coming summer/winter term counts too.
  const extras: Period[] = [];
  const extraLeverKnown = extraTermsPerYear > 0 && extraTermUnits !== undefined;
  if (extraLeverKnown && mains.length > 0) {
    const pastStarts = knownStarts.filter((t) => t < today);
    const prevStart = pastStarts.length
      ? pastStarts[pastStarts.length - 1]
      : spacing !== null
      ? addMonths(mains[0].start, -spacing)
      : null;
    const seq: Period[] = prevStart !== null
      ? [{ kind: "main", start: prevStart, end: mainEnd(prevStart), estimated: true }, ...mains]
      : mains;
    const byYear = new Map<number, { after: Period; gap: number; idx: number }[]>();
    for (let i = 0; i + 1 < seq.length; i++) {
      const after = seq[i];
      if (after.end === null) continue;
      const year = new Date(after.start).getUTCFullYear();
      const list = byYear.get(year) ?? [];
      list.push({ after, gap: seq[i + 1].start - after.end, idx: i });
      byYear.set(year, list);
    }
    for (const list of byYear.values()) {
      const last = list[list.length - 1];
      const rest = list.slice(0, -1).sort((a, b) => b.gap - a.gap || a.idx - b.idx);
      for (const g of [last, ...rest].slice(0, extraTermsPerYear)) {
        const start = addDays(g.after.end!, 1);
        if (start < today) continue;
        extras.push({ kind: "extra", start, end: addDays(start, extraWeeks * 7), estimated: true });
      }
    }
  }
  const periods = [...mains, ...extras].sort((a, b) => a.start - b.start || (a.kind === "main" ? -1 : 1));

  // ---------- scenarios ----------
  const scenarios: Scenario[] = [];
  const canPlan = remainingUnits !== null && remainingUnits > 0 && standardUnits !== undefined;
  const overloadOk = maxOverloadUnits !== undefined && standardUnits !== undefined && maxOverloadUnits > standardUnits;
  const crossCapAt = (perMain: number) => Math.max(0, (maxOverloadUnits ?? (standardUnits ?? 0) + 1) - perMain);
  const creditUnits = additionalCredit !== undefined && remainingCredit !== null && creditPerUnit !== undefined
    ? Math.max(0, Math.ceil((remainingCredit - additionalCredit) / creditPerUnit - 1e-9))
    : null;

  const build = (
    id: ScenarioId,
    label: string,
    units: number,
    perMain: number,
    opts: { extras?: boolean; cross?: number; crossCap?: number; credit?: number },
    needs: string[],
  ): Scenario => {
    const w = walk(
      periods,
      today,
      units,
      perMain,
      opts.extras ? extraTermUnits ?? 0 : 0,
      opts.cross ?? 0,
      opts.crossCap ?? 0,
    );
    const finish = w.done ? w.finish : null;
    const perMainTotal = perMain + Math.min(opts.cross ?? 0, opts.crossCap ?? 0);
    const termsNeeded = w.done ? w.mainsUsed : w.mainsUsed + Math.ceil(w.left / Math.max(perMainTotal, 1));
    const s: Scenario = {
      id,
      label,
      unitsPerMainTerm: perMain,
      termsNeeded,
      finishBy: finish !== null ? yearMonth(finish) : null,
      finishesBeforeCoe: finish !== null && coeEnd !== null ? finish <= coeEnd : null,
      finishesBeforeVisa: finish !== null && visaExpiry !== null ? finish <= visaExpiry : null,
      needs,
      finishDate: finish !== null ? iso(finish) : null,
      daysToSpareCoe: finish !== null && coeEnd !== null ? daysBetween(finish, coeEnd) : null,
      daysToSpareVisa: finish !== null && visaExpiry !== null ? daysBetween(finish, visaExpiry) : null,
      unitsToStudy: units,
    };
    if (opts.extras) s.extraTermsNeeded = w.extrasUsed;
    if (opts.cross) s.crossInstUnitsUsed = w.crossUsed;
    if (opts.credit) s.creditApplied = opts.credit;
    return s;
  };

  const leversToExplore: string[] = [];
  if (canPlan) {
    const units = remainingUnits!;
    const std = standardUnits!;
    scenarios.push(build("standard", `Standard load (${plural(std, "unit")} per study period)`, units, std, {}, []));

    if (extraLeverKnown) {
      scenarios.push(
        build("extra_terms", "Standard load plus summer/winter terms", units, std, { extras: true }, [NEEDS.extra]),
      );
    } else {
      leversToExplore.push("summer/winter terms (whether your provider runs them and how many units you can take)");
    }

    if (overloadOk) {
      scenarios.push(
        build(
          "overload",
          `Overload (${plural(maxOverloadUnits!, "unit")} per study period)`,
          units,
          maxOverloadUnits!,
          {},
          [NEEDS.overload],
        ),
      );
    } else if (maxOverloadUnits === undefined) {
      leversToExplore.push("an overload (your provider's maximum load per study period and the GPA it asks for)");
    } else {
      notes.push("Your provider's maximum load is the same as the standard load, so an overload isn't an option.");
    }

    if (creditUnits !== null) {
      scenarios.push(
        build(
          "credit",
          `Standard load after ${fmtNum(additionalCredit!)} more credit points of credit`,
          creditUnits,
          std,
          { credit: additionalCredit },
          [NEEDS.credit],
        ),
      );
    } else {
      leversToExplore.push("more credit for study you've already done (credit transfer or RPL)");
    }

    const crossCap = crossCapAt(std);
    if (crossInstUnits !== undefined && crossCap > 0) {
      scenarios.push(
        build(
          "cross_institutional",
          "Standard load plus cross-institutional units",
          units,
          std,
          { cross: crossInstUnits, crossCap },
          [NEEDS.cross, NEEDS.crossLoad],
        ),
      );
    } else if (crossInstUnits === undefined) {
      leversToExplore.push("cross-institutional study (units you could take at another provider alongside your own)");
    } else {
      notes.push(
        "Your provider's maximum load equals the standard load, so cross-institutional units could replace home units but not speed things up.",
      );
    }

    // Combined: every lever that adds speed.
    const perMain = overloadOk ? maxOverloadUnits! : std;
    const combCap = crossInstUnits !== undefined ? crossCapAt(perMain) : 0;
    const levers = [overloadOk, extraLeverKnown, creditUnits !== null, combCap > 0].filter(Boolean).length;
    if (levers >= 2) {
      const needs = [
        ...(extraLeverKnown ? [NEEDS.extra] : []),
        ...(overloadOk ? [NEEDS.overload] : []),
        ...(creditUnits !== null ? [NEEDS.credit] : []),
        ...(combCap > 0 ? [NEEDS.cross, NEEDS.crossLoad] : []),
      ];
      scenarios.push(
        build("combined", "All options together", creditUnits ?? units, perMain, {
          extras: extraLeverKnown,
          cross: combCap > 0 ? crossInstUnits : 0,
          crossCap: combCap,
          credit: creditUnits !== null ? additionalCredit : undefined,
        }, needs),
      );
    }
  }

  // ---------- deadlines ----------
  const calendarComplete = (deadline: number) =>
    spacing !== null || (mains.length > 0 && mains[mains.length - 1].end !== null &&
      mains[mains.length - 1].end! > deadline);
  const termsUntil = (deadline: number | null): number | null => {
    if (deadline === null || !calendarComplete(deadline)) return null;
    if (mains.some((p) => p.end === null && p.start <= deadline)) return null;
    return mains.filter((p) => p.end !== null && p.end <= deadline).length;
  };
  const mainTermsUntilCoeEnd = termsUntil(coeEnd);
  const mainTermsUntilVisaExpiry = termsUntil(visaExpiry);
  const requiredUnitsPerTerm = remainingUnits !== null && mainTermsUntilCoeEnd
    ? Math.ceil(remainingUnits / mainTermsUntilCoeEnd)
    : null;

  // ---------- status ----------
  const standard = scenarios.find((s) => s.id === "standard");
  let status: PlanStatus;
  if (completed) status = "completed";
  else if (missing.length > 0) status = "needs_info";
  else if (standard?.finishesBeforeCoe) status = "on_track";
  else if (scenarios.some((s) => s.finishesBeforeCoe || s.finishesBeforeVisa)) status = "at_risk";
  else if (scenarios.length === 0 || scenarios.every((s) => s.finishBy === null)) status = "needs_info";
  else status = "cannot_finish";

  // ---------- notes ----------
  if (!completed) {
    if (generated) {
      notes.push(
        knownStarts.length
          ? `After the study period dates you gave, we spaced the next ones every ${
            fmtNum(spacing!)
          } months; add your provider's dates for a sharper plan.`
          : `We don't know your next study period dates, so we spaced them every ${
            fmtNum(spacing!)
          } months from today; add your provider's dates for a sharper plan.`,
      );
    }
    if (endEstimated && mains.some((p) => p.end !== null)) {
      notes.push(
        "Study period end dates are estimates; add how many weeks a study period runs (including exams) for exact dates.",
      );
    }
    if (extras.length > 0 && scenarios.some((s) => (s.extraTermsNeeded ?? 0) > 0)) {
      notes.push(
        `Summer/winter term dates are estimates (about ${
          plural(round1(extraWeeks), "week")
        } straight after a main study period).`,
      );
    }
    if (coeEnd !== null && coeEnd < today) notes.push(`Your CoE end date (${iso(coeEnd)}) has already passed.`);
    if (coeEnd !== null && visaExpiry !== null && visaExpiry < coeEnd) {
      notes.push(
        `Your visa expiry (${iso(visaExpiry)}) is before your CoE end date (${iso(coeEnd)}); check both dates.`,
      );
    }
    if (requiredUnitsPerTerm !== null && standardUnits !== undefined && requiredUnitsPerTerm > standardUnits) {
      notes.push(
        `To finish by your CoE end date with main study periods only you'd need ${
          plural(requiredUnitsPerTerm, "unit")
        } per study period, above the standard load of ${standardUnits}.`,
      );
      if (maxOverloadUnits !== undefined && requiredUnitsPerTerm > maxOverloadUnits) {
        notes.push(
          `That's more than the overload limit of ${maxOverloadUnits}, so you'd also need summer/winter terms, more credit or cross-institutional study.`,
        );
      }
    } else if (mainTermsUntilCoeEnd === 0 && remainingUnits !== null && remainingUnits > 0 && coeEnd !== null) {
      notes.push("No main study period finishes before your CoE end date.");
    }

    if (standard?.finishBy && coeEnd === null) {
      notes.push(`At a standard load you'd finish around ${standard.finishBy}.`);
    }
    if (standard?.finishBy && coeEnd !== null) {
      if (standard.finishesBeforeCoe) {
        notes.push(
          `At a standard load you'd finish around ${standard.finishBy}, before your CoE end date (${iso(coeEnd)}).`,
        );
      } else {
        notes.push(
          `At a standard load you'd finish around ${standard.finishBy}, after your CoE end date (${iso(coeEnd)}).`,
        );
        const onTime = scenarios.filter((s) => s.finishesBeforeCoe).map((s) => s.label);
        if (onTime.length) notes.push(`These options finish by your CoE end date: ${onTime.join("; ")}.`);
      }
      const spare = standard.daysToSpareCoe;
      if (typeof spare === "number" && Math.abs(spare) <= CLOSE_CALL_DAYS) {
        notes.push(
          spare >= 0
            ? `That leaves only ${plural(spare, "day")} before your CoE end date, so check the exact study period dates.`
            : `That's only ${plural(-spare, "day")} past your CoE end date, so check the exact study period dates.`,
        );
      }
    }
    if (standard?.finishesBeforeVisa === false && visaExpiry !== null) {
      notes.push(`At a standard load you'd finish after your visa expiry (${iso(visaExpiry)}).`);
    }
    if (scenarios.some((s) => s.finishesBeforeCoe === false)) notes.push(COE_EXTENSION_NOTE);
    if (status === "cannot_finish") {
      notes.push(
        "None of the options we could work out finishes by your CoE end date or visa expiry with the numbers we have.",
      );
    }
    if (canPlan && visaExpiry === null) notes.push("Add your visa expiry date to compare each option with it.");
    if (leversToExplore.length) {
      notes.push(`If you find out the numbers, we can also check: ${leversToExplore.join("; ")}.`);
    }
  }

  // ---------- extras for the app and the assistant ----------
  const withFinish = scenarios.filter((s) => s.finishDate);
  const fastest = withFinish.length
    ? withFinish.reduce((a, b) => (b.finishDate! < a.finishDate! ? b : a)).id
    : null;
  const simplestOnTime = EFFORT_ORDER.find((id) => scenarios.find((s) => s.id === id)?.finishesBeforeCoe) ?? null;
  const lastFinish = Math.max(...withFinish.map((s) => parseDate(s.finishDate)!), 0);
  const calendarEnd = Math.max(lastFinish, coeEnd ?? 0, visaExpiry ?? 0);
  const calendar: StudyPeriod[] = periods
    .filter((p) => p.start <= calendarEnd)
    .slice(0, 30)
    .map((p) => ({ kind: p.kind, start: iso(p.start), end: p.end !== null ? iso(p.end) : null, estimated: p.estimated }));

  return {
    status,
    remainingCredit,
    remainingUnits,
    mainTermsUntilCoeEnd,
    mainTermsUntilVisaExpiry,
    requiredUnitsPerTerm,
    scenarios,
    notes,
    missing,
    progressPercent: courseCredit !== undefined && creditDone !== undefined
      ? Math.min(100, round1(((creditDone + creditGranted) / courseCredit) * 100))
      : null,
    daysUntilCoeEnd: coeEnd !== null ? daysBetween(today, coeEnd) : null,
    daysUntilVisaExpiry: visaExpiry !== null ? daysBetween(today, visaExpiry) : null,
    fastestScenario: fastest,
    simplestOnTime,
    calendar,
    estimatedDates: periods.some((p) => p.estimated),
  };
}
