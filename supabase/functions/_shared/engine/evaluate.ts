import { factQuestions, todayISO, type CaseFacts, type FactKey } from "./facts.ts";
import { evaluateCondition } from "./logic.ts";
import { calculatePoints, type PointsResult } from "./points.ts";
import { visaRules, type Source, type VisaRule } from "./visas.ts";

export type CriterionStatus = "met" | "not_met" | "unknown" | "at_risk";

export type CriterionResult = {
  id: string;
  title: string;
  status: CriterionStatus;
  discretionary: boolean;
  detail?: string;
  missing: { fact: FactKey; question: string }[];
  source: Source;
};

export type Outcome = "eligible" | "not_eligible" | "needs_info";

export type VisaAssessment = {
  subclass: string;
  stream: string;
  name: string;
  outcome: Outcome;
  reviewStatus: VisaRule["reviewStatus"];
  assessedAt: string;
  criteria: CriterionResult[];
  points?: PointsResult;
  blockers: string[];
  /** Ordered, de-duplicated questions that would settle the outcome. */
  nextQuestions: { fact: FactKey; question: string }[];
};

const nomination = { "190": "state", "491": "regional" } as const;

export function rulesInForce(on: string, rules: VisaRule[] = visaRules): VisaRule[] {
  return rules.filter((r) => r.validFrom <= on && (!r.validTo || on < r.validTo));
}

export function assessVisa(rule: VisaRule, facts: CaseFacts): VisaAssessment {
  const criteria: CriterionResult[] = rule.criteria.map((c) => {
    const r = evaluateCondition(c.condition, facts);
    let status: CriterionStatus = r.truth;
    // A discretionary criterion is a risk to flag, never an automatic refusal.
    if (c.discretionary && r.truth === "not_met") status = "at_risk";
    return {
      id: c.id,
      title: c.title,
      status,
      discretionary: !!c.discretionary,
      detail: r.detail,
      missing: r.missing.map((fact) => ({ fact, question: factQuestions[fact] })),
      source: c.source,
    };
  });

  const outcome: Outcome = criteria.some((c) => c.status === "not_met")
    ? "not_eligible"
    : criteria.some((c) => c.status === "unknown")
      ? "needs_info"
      : "eligible";

  const seen = new Set<FactKey>();
  const nextQuestions = criteria
    .flatMap((c) => c.missing)
    .filter((q) => (seen.has(q.fact) ? false : (seen.add(q.fact), true)));

  const isPointsTested = rule.criteria.some((c) => "pointsAtLeast" in c.condition);

  return {
    subclass: rule.subclass,
    stream: rule.stream,
    name: rule.name,
    outcome,
    reviewStatus: rule.reviewStatus,
    assessedAt: facts.assessmentDate ?? todayISO(),
    criteria,
    points: isPointsTested
      ? calculatePoints(facts, { nomination: nomination[rule.subclass as keyof typeof nomination] ?? null })
      : undefined,
    blockers: criteria.filter((c) => c.status === "not_met").map((c) => c.title + (c.detail ? ` — ${c.detail}` : "")),
    nextQuestions,
  };
}

const rank: Record<Outcome, number> = { eligible: 0, needs_info: 1, not_eligible: 2 };

/** Assess every visa in force on the assessment date, best options first. */
export function assessAll(facts: CaseFacts, rules: VisaRule[] = visaRules): VisaAssessment[] {
  const on = facts.assessmentDate ?? todayISO();
  return rulesInForce(on, rules)
    .map((r) => assessVisa(r, facts))
    .sort((a, b) => rank[a.outcome] - rank[b.outcome] || (b.points?.min ?? 0) - (a.points?.min ?? 0));
}
