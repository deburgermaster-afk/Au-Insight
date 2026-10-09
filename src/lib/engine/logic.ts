import { ageOn, todayISO, type CaseFacts, type FactKey } from "./facts";
import { calculatePoints } from "./points";

/**
 * A small JSON condition language with three-valued (Kleene) logic.
 * Rules are plain data so they can be stored in `criteria_rules.logic`
 * and reviewed without touching code.
 */
export type Condition =
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition }
  | { fact: FactKey; op: "isTrue" | "isFalse" }
  | { fact: FactKey; op: "eq" | "neq" | "gte" | "gt" | "lte" | "lt"; value: string | number | boolean }
  | { fact: FactKey; op: "in" | "includesAny"; value: (string | number)[] }
  | { ageUnder: number }
  | { pointsAtLeast: number; nomination?: "state" | "regional" };

export type Truth = "met" | "not_met" | "unknown";

export type ConditionResult = { truth: Truth; missing: FactKey[]; detail?: string };

const uniq = <T,>(xs: T[]) => [...new Set(xs)];

export function evaluateCondition(c: Condition, facts: CaseFacts): ConditionResult {
  if ("all" in c) {
    const rs = c.all.map((x) => evaluateCondition(x, facts));
    const missing = uniq(rs.flatMap((r) => r.missing));
    const failed = rs.find((r) => r.truth === "not_met");
    if (failed) return { truth: "not_met", missing: [], detail: failed.detail };
    if (rs.some((r) => r.truth === "unknown")) return { truth: "unknown", missing };
    return { truth: "met", missing: [], detail: rs.map((r) => r.detail).filter(Boolean).join("; ") || undefined };
  }
  if ("any" in c) {
    const rs = c.any.map((x) => evaluateCondition(x, facts));
    const passed = rs.find((r) => r.truth === "met");
    if (passed) return { truth: "met", missing: [], detail: passed.detail };
    if (rs.some((r) => r.truth === "unknown")) return { truth: "unknown", missing: uniq(rs.flatMap((r) => r.missing)) };
    return { truth: "not_met", missing: [] };
  }
  if ("not" in c) {
    const r = evaluateCondition(c.not, facts);
    const flip: Record<Truth, Truth> = { met: "not_met", not_met: "met", unknown: "unknown" };
    return { truth: flip[r.truth], missing: r.missing };
  }
  if ("ageUnder" in c) {
    if (!facts.dateOfBirth) return { truth: "unknown", missing: ["dateOfBirth"] };
    const age = ageOn(facts.dateOfBirth, facts.assessmentDate ?? todayISO());
    return { truth: age < c.ageUnder ? "met" : "not_met", missing: [], detail: `Age ${age} at assessment date` };
  }
  if ("pointsAtLeast" in c) {
    const p = calculatePoints(facts, { nomination: c.nomination ?? null });
    const missing = uniq(p.factors.flatMap((f) => f.missing));
    if (p.min >= c.pointsAtLeast) return { truth: "met", missing: [], detail: `${p.min} points` };
    if (p.max < c.pointsAtLeast) {
      return { truth: "not_met", missing: [], detail: `At most ${p.max} points (needs ${c.pointsAtLeast})` };
    }
    return { truth: "unknown", missing, detail: `Between ${p.min} and ${p.max} points` };
  }

  const value = facts[c.fact];
  if (value === undefined) return { truth: "unknown", missing: [c.fact] };
  const ok = (b: boolean): ConditionResult => ({ truth: b ? "met" : "not_met", missing: [] });

  switch (c.op) {
    case "isTrue":
      return ok(value === true);
    case "isFalse":
      return ok(value === false);
    case "eq":
      return ok(value === c.value);
    case "neq":
      return ok(value !== c.value);
    case "gte":
      return ok(Number(value) >= Number(c.value));
    case "gt":
      return ok(Number(value) > Number(c.value));
    case "lte":
      return ok(Number(value) <= Number(c.value));
    case "lt":
      return ok(Number(value) < Number(c.value));
    case "in":
      return ok(c.value.includes(value as string | number));
    case "includesAny":
      return ok(Array.isArray(value) && value.some((v) => c.value.includes(v)));
  }
}
