import { describe, expect, it } from "vitest";
import { wamProjection } from "./project.ts";
import type { RecordSummary } from "./index.ts";

const assertEquals = (a: unknown, b: unknown) => expect(a).toEqual(b);

const base: RecordSummary = {
  unitsPassed: 11,
  unitsFailed: 5,
  unitsEnrolled: 0,
  unitsCredited: 0,
  creditPassed: 132,
  creditFailed: 60,
  creditGranted: 0,
  creditUnknownUnits: 0,
  gpa: 2.1,
  gpaScale: "au7",
  wam: 40,
  failedByTerm: {},
  termsAtRisk: [],
  unknownGrades: [],
  terms: [{
    term: "T1",
    unitsPassed: 11,
    unitsFailed: 5,
    creditAttempted: 192,
    creditFailed: 60,
    gpa: 2.1,
    wam: 40,
    atRisk: false,
  }],
};

describe("wamProjection", () => {
  it("needed average for a target WAM over the remaining credit", () => {
    // 192 graded at 40; course of 288 credit, 132 passed: 156 remain. For 60: (60*348 - 40*192)/156 = 84.6
    const p = wamProjection(base, 288)!;
    assertEquals(p.remainingCredit, 156);
    assertEquals(p.targets.find((t) => t.wam === 60), {
      wam: 60,
      neededAverage: 84.6,
      reachable: true,
    });
    assertEquals(p.targets.find((t) => t.wam === 85)?.reachable, false);
    assertEquals(p.bestPossible, 66.9); // (40*192 + 100*156) / 348
    assertEquals(p.ifAverage.find((a) => a.average === 80)?.finalWam, 57.9);
  });

  it("no projection without a WAM or course length", () => {
    assertEquals(wamProjection({ ...base, wam: null }, 288), null);
    assertEquals(wamProjection(base, undefined), null);
  });

  it("a finished course has nothing left to change", () => {
    const p = wamProjection({
      ...base,
      creditPassed: 288,
      creditFailed: 0,
      wam: 70,
      terms: [],
    }, 288)!;
    assertEquals(p.remainingCredit, 0);
    assertEquals(p.targets.find((t) => t.wam === 65), {
      wam: 65,
      neededAverage: null,
      reachable: true,
    });
  });
});
