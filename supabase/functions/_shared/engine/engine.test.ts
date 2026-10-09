import { describe, expect, it } from "vitest";
import { ageOn, assessAll, assessVisa, calculatePoints, evaluateCondition, visaRules, type CaseFacts } from "./index.ts";

const rule = (subclass: string) => visaRules.find((r) => r.subclass === subclass)!;

const strong: CaseFacts = {
  dateOfBirth: "1992-03-15",
  assessmentDate: "2026-10-01",
  occupationCode: "261313",
  occupationLists: ["MLTSSL"],
  positiveSkillsAssessment: true,
  englishLevel: "superior",
  overseasSkilledYears: 8,
  australianSkilledYears: 0,
  highestQualification: "bachelor_or_masters",
  specialistEducation: false,
  australianStudyRequirement: false,
  professionalYear: false,
  credentialledCommunityLanguage: false,
  regionalStudy: false,
  partnerStatus: "single",
  invitationReceived: true,
  meetsHealth: true,
  meetsCharacter: true,
  hasCommonwealthDebt: false,
};

describe("ageOn", () => {
  it("counts birthdays exactly", () => {
    expect(ageOn("1990-10-02", "2026-10-01")).toBe(35);
    expect(ageOn("1990-10-01", "2026-10-01")).toBe(36);
  });
});

describe("points test", () => {
  it("scores a known profile exactly", () => {
    // age 34 → 25, superior → 20, 8y overseas → 15, bachelor → 15, single → 10
    const p = calculatePoints(strong);
    expect(p.min).toBe(85);
    expect(p.max).toBe(85);
  });

  it("caps combined employment at 20", () => {
    const p = calculatePoints({ ...strong, overseasSkilledYears: 8, australianSkilledYears: 8 });
    expect(p.factors.find((f) => f.key === "employment")!.max).toBe(20);
  });

  it("returns a range when facts are missing", () => {
    const p = calculatePoints({ dateOfBirth: "2000-01-01", assessmentDate: "2026-10-01" });
    expect(p.min).toBe(30);
    expect(p.max).toBeGreaterThan(65);
  });

  it("adds nomination points", () => {
    expect(calculatePoints(strong, { nomination: "regional" }).min).toBe(85); // fact unknown → 0..15
    expect(calculatePoints({ ...strong, regionalNominationOrSponsorship: true }, { nomination: "regional" }).min).toBe(100);
  });

  it("flags age 45+", () => {
    expect(calculatePoints({ ...strong, dateOfBirth: "1980-01-01" }).ageIneligible).toBe(true);
  });
});

describe("three-valued logic", () => {
  it("all() fails fast even with unknowns", () => {
    const r = evaluateCondition({ all: [{ fact: "invitationReceived", op: "isTrue" }, { fact: "englishLevel", op: "eq", value: "superior" }] }, {
      invitationReceived: false,
    });
    expect(r.truth).toBe("not_met");
  });

  it("any() succeeds even with unknowns", () => {
    const r = evaluateCondition({ any: [{ fact: "invitationReceived", op: "isTrue" }, { fact: "stateNomination", op: "isTrue" }] }, {
      stateNomination: true,
    });
    expect(r.truth).toBe("met");
  });

  it("decides points when the missing facts can't change the outcome", () => {
    const facts = { ...strong, partnerStatus: undefined };
    expect(evaluateCondition({ pointsAtLeast: 65 }, facts).truth).toBe("met");
  });
});

describe("visa assessment", () => {
  it("is eligible for 189 with a strong profile", () => {
    const a = assessVisa(rule("189"), strong);
    expect(a.outcome).toBe("eligible");
    expect(a.blockers).toEqual([]);
  });

  it("is not eligible for 189 when the occupation is only on STSOL", () => {
    const a = assessVisa(rule("189"), { ...strong, occupationLists: ["STSOL"] });
    expect(a.outcome).toBe("not_eligible");
    expect(a.blockers[0]).toMatch(/Medium and Long-term/);
  });

  it("asks the right questions when information is missing", () => {
    const a = assessVisa(rule("190"), { ...strong, stateNomination: undefined });
    expect(a.outcome).toBe("needs_info");
    expect(a.nextQuestions.map((q) => q.fact)).toEqual(["stateNomination"]);
  });

  it("flags discretionary criteria as a risk, not a refusal", () => {
    const a = assessVisa(rule("189"), { ...strong, meetsHealth: false });
    expect(a.outcome).toBe("eligible");
    expect(a.criteria.find((c) => c.id === "health")!.status).toBe("at_risk");
  });

  it("refuses at 45", () => {
    const a = assessVisa(rule("189"), { ...strong, dateOfBirth: "1981-09-30" });
    expect(a.outcome).toBe("not_eligible");
  });

  it("ranks eligible visas first", () => {
    const all = assessAll({ ...strong, stateNomination: undefined, regionalNominationOrSponsorship: undefined });
    expect(all[0].subclass).toBe("189");
    expect(all[0].outcome).toBe("eligible");
  });
});
