import { ageOn, todayISO, type CaseFacts, type FactKey } from "./facts.ts";

/**
 * Points test for General Skilled Migration (subclasses 189, 190, 491),
 * Migration Regulations 1994, Schedule 6D.
 *
 * Unknown facts produce a [min, max] range instead of a guess, so the
 * engine can still decide when the outcome doesn't depend on them.
 */
export const POINTS_TEST_SOURCE = {
  title: "Migration Regulations 1994 — Schedule 6D (General points test)",
  url: "https://www.legislation.gov.au/F1996B03551/latest/text",
} as const;

export const PASS_MARK = 65;

export type PointsFactor = {
  key: string;
  label: string;
  min: number;
  max: number;
  /** Facts that, once answered, would collapse min/max to one value. */
  missing: FactKey[];
  note?: string;
};

export type PointsResult = {
  min: number;
  max: number;
  passMark: number;
  factors: PointsFactor[];
  /** True when the applicant is outside the age range that can score (45+). */
  ageIneligible: boolean;
};

type Options = { nomination?: "state" | "regional" | null };

function known(key: string, label: string, value: number, note?: string): PointsFactor {
  return { key, label, min: value, max: value, missing: [], note };
}

function unknown(key: string, label: string, values: number[], missing: FactKey[]): PointsFactor {
  return { key, label, min: Math.min(...values), max: Math.max(...values), missing };
}

function bool(key: string, label: string, fact: FactKey, value: boolean | undefined, points: number) {
  return value === undefined ? unknown(key, label, [0, points], [fact]) : known(key, label, value ? points : 0);
}

export function agePoints(age: number): number | null {
  if (age < 18) return 0;
  if (age < 25) return 25;
  if (age < 33) return 30;
  if (age < 40) return 25;
  if (age < 45) return 15;
  return null;
}

export const englishPoints = { none: 0, functional: 0, vocational: 0, competent: 0, proficient: 10, superior: 20 } as const;

export function overseasEmploymentPoints(years: number): number {
  if (years >= 8) return 15;
  if (years >= 5) return 10;
  if (years >= 3) return 5;
  return 0;
}

export function australianEmploymentPoints(years: number): number {
  if (years >= 8) return 20;
  if (years >= 5) return 15;
  if (years >= 3) return 10;
  if (years >= 1) return 5;
  return 0;
}

export const qualificationPoints = {
  none: 0,
  recognised_by_assessing_authority: 10,
  diploma_or_trade: 10,
  bachelor_or_masters: 15,
  doctorate: 20,
} as const;

export const partnerPoints = {
  single: 10,
  partner_citizen_or_pr: 10,
  partner_skilled: 10,
  partner_competent_english: 5,
  partner_other: 0,
} as const;

/** Combined overseas + Australian employment points are capped at 20. */
const EMPLOYMENT_CAP = 20;

export function calculatePoints(facts: CaseFacts, options: Options = {}): PointsResult {
  const factors: PointsFactor[] = [];
  let ageIneligible = false;

  if (facts.dateOfBirth) {
    const age = ageOn(facts.dateOfBirth, facts.assessmentDate ?? todayISO());
    const pts = agePoints(age);
    if (pts === null) ageIneligible = true;
    factors.push(known("age", "Age", pts ?? 0, `Age ${age} at assessment date`));
  } else {
    factors.push(unknown("age", "Age", [0, 30], ["dateOfBirth"]));
  }

  factors.push(
    facts.englishLevel
      ? known("english", "English language", englishPoints[facts.englishLevel])
      : unknown("english", "English language", [0, 20], ["englishLevel"]),
  );

  const overseas = facts.overseasSkilledYears;
  const aus = facts.australianSkilledYears;
  const oMin = overseas === undefined ? 0 : overseasEmploymentPoints(overseas);
  const oMax = overseas === undefined ? 15 : oMin;
  const aMin = aus === undefined ? 0 : australianEmploymentPoints(aus);
  const aMax = aus === undefined ? 20 : aMin;
  const empMissing: FactKey[] = [];
  if (overseas === undefined) empMissing.push("overseasSkilledYears");
  if (aus === undefined) empMissing.push("australianSkilledYears");
  factors.push({
    key: "employment",
    label: "Skilled employment (combined, max 20)",
    min: Math.min(EMPLOYMENT_CAP, oMin + aMin),
    max: Math.min(EMPLOYMENT_CAP, oMax + aMax),
    missing: empMissing,
  });

  factors.push(
    facts.highestQualification
      ? known("qualification", "Educational qualification", qualificationPoints[facts.highestQualification])
      : unknown("qualification", "Educational qualification", [0, 20], ["highestQualification"]),
  );

  factors.push(bool("specialist", "Specialist education (STEM research)", "specialistEducation", facts.specialistEducation, 10));
  factors.push(bool("aus_study", "Australian study requirement", "australianStudyRequirement", facts.australianStudyRequirement, 5));
  factors.push(bool("professional_year", "Professional Year", "professionalYear", facts.professionalYear, 5));
  factors.push(bool("ccl", "Credentialled community language", "credentialledCommunityLanguage", facts.credentialledCommunityLanguage, 5));
  factors.push(bool("regional_study", "Study in regional Australia", "regionalStudy", facts.regionalStudy, 5));

  factors.push(
    facts.partnerStatus
      ? known("partner", "Partner", partnerPoints[facts.partnerStatus])
      : unknown("partner", "Partner", [0, 10], ["partnerStatus"]),
  );

  if (options.nomination === "state") {
    factors.push(bool("nomination", "State/territory nomination (190)", "stateNomination", facts.stateNomination, 5));
  } else if (options.nomination === "regional") {
    factors.push(
      bool("nomination", "Regional nomination/sponsorship (491)", "regionalNominationOrSponsorship", facts.regionalNominationOrSponsorship, 15),
    );
  }

  return {
    min: factors.reduce((s, f) => s + f.min, 0),
    max: factors.reduce((s, f) => s + f.max, 0),
    passMark: PASS_MARK,
    factors,
    ageIneligible,
  };
}
