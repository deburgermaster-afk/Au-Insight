import type { Condition } from "./logic";
import { POINTS_TEST_SOURCE } from "./points";

export type Source = { title: string; url: string };

export type Criterion = {
  id: string;
  title: string;
  /** Discretionary criteria (health, character, debts) are flagged, never decided. */
  discretionary?: boolean;
  condition: Condition;
  source: Source;
};

export type VisaRule = {
  subclass: string;
  stream: string;
  name: string;
  /** Rules apply to applications assessed on or after this date. */
  validFrom: string;
  validTo?: string;
  /**
   * "draft" until a person has checked every criterion against the cited
   * source. Draft rules are shown with a review badge in the UI.
   */
  reviewStatus: "draft" | "reviewed";
  criteria: Criterion[];
};

const HA = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing";
const REGS = { title: "Migration Regulations 1994 — Schedule 2", url: "https://www.legislation.gov.au/F1996B03551/latest/text" };
const PIC = { title: "Migration Regulations 1994 — Schedule 4 (Public interest criteria)", url: REGS.url };
const competentEnglish: Condition = { fact: "englishLevel", op: "in", value: ["competent", "proficient", "superior"] };

function common(page: Source): Criterion[] {
  return [
    { id: "invitation", title: "Invited to apply", condition: { fact: "invitationReceived", op: "isTrue" }, source: page },
    { id: "age", title: "Under 45 at the time of invitation", condition: { ageUnder: 45 }, source: page },
    {
      id: "skills_assessment",
      title: "Suitable skills assessment for the nominated occupation",
      condition: { fact: "positiveSkillsAssessment", op: "isTrue" },
      source: page,
    },
    { id: "english", title: "At least Competent English", condition: competentEnglish, source: page },
  ];
}

function discretionary(): Criterion[] {
  return [
    { id: "health", title: "Health requirement", discretionary: true, condition: { fact: "meetsHealth", op: "isTrue" }, source: PIC },
    { id: "character", title: "Character requirement", discretionary: true, condition: { fact: "meetsCharacter", op: "isTrue" }, source: PIC },
    {
      id: "debts",
      title: "No outstanding debts to the Australian Government (or arrangement to repay)",
      discretionary: true,
      condition: { fact: "hasCommonwealthDebt", op: "isFalse" },
      source: PIC,
    },
  ];
}

const p189 = { title: "Skilled Independent visa (subclass 189)", url: `${HA}/skilled-independent-189` };
const p190 = { title: "Skilled Nominated visa (subclass 190)", url: `${HA}/skilled-nominated-190` };
const p491 = { title: "Skilled Work Regional (Provisional) visa (subclass 491)", url: `${HA}/skilled-work-regional-provisional-491` };

export const visaRules: VisaRule[] = [
  {
    subclass: "189",
    stream: "Points-tested",
    name: p189.title,
    validFrom: "2024-12-07",
    reviewStatus: "draft",
    criteria: [
      ...common(p189),
      {
        id: "occupation",
        title: "Occupation on the Medium and Long-term Strategic Skills List",
        condition: { fact: "occupationLists", op: "includesAny", value: ["MLTSSL"] },
        source: p189,
      },
      { id: "points", title: "At least 65 points", condition: { pointsAtLeast: 65 }, source: POINTS_TEST_SOURCE },
      ...discretionary(),
    ],
  },
  {
    subclass: "190",
    stream: "Skilled Nominated",
    name: p190.title,
    validFrom: "2024-12-07",
    reviewStatus: "draft",
    criteria: [
      ...common(p190),
      {
        id: "occupation",
        title: "Occupation on the MLTSSL or STSOL",
        condition: { fact: "occupationLists", op: "includesAny", value: ["MLTSSL", "STSOL"] },
        source: p190,
      },
      { id: "nomination", title: "Nominated by a state or territory government", condition: { fact: "stateNomination", op: "isTrue" }, source: p190 },
      {
        id: "points",
        title: "At least 65 points (including 5 for nomination)",
        condition: { pointsAtLeast: 65, nomination: "state" },
        source: POINTS_TEST_SOURCE,
      },
      ...discretionary(),
    ],
  },
  {
    subclass: "491",
    stream: "Skilled Work Regional",
    name: p491.title,
    validFrom: "2024-12-07",
    reviewStatus: "draft",
    criteria: [
      ...common(p491),
      {
        id: "occupation",
        title: "Occupation on the MLTSSL, STSOL or ROL",
        condition: { fact: "occupationLists", op: "includesAny", value: ["MLTSSL", "STSOL", "ROL"] },
        source: p491,
      },
      {
        id: "nomination",
        title: "Nominated by a state/territory or sponsored by an eligible relative in a designated regional area",
        condition: { fact: "regionalNominationOrSponsorship", op: "isTrue" },
        source: p491,
      },
      {
        id: "points",
        title: "At least 65 points (including 15 for nomination/sponsorship)",
        condition: { pointsAtLeast: 65, nomination: "regional" },
        source: POINTS_TEST_SOURCE,
      },
      ...discretionary(),
    ],
  },
];

export { REGS as MIGRATION_REGULATIONS };
