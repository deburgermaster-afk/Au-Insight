import { expect } from "jsr:@std/expect@1";
import { aqfCreditGuide, studyPlan, summariseRecord } from "../_shared/academic/index.ts";
import { describeExtracted, normaliseExtracted } from "./docintel.ts";
import { changesQuery } from "./prompt.ts";
import { buildPlanInput, coeHistory, currentCourse, describeHistory, recordUnits } from "./study.ts";

const coePart = (
  provider: string,
  code: string,
  course: string,
  level: string,
  start: string,
  end: string,
  coe: string,
) => ({
  type: "coe",
  summary: `CoE for ${course} at ${provider}`,
  fields: [
    { key: "provider_name", label: "Provider", value: provider },
    { key: "provider_cricos_code", label: "Provider code", value: code },
    { key: "course_name", label: "Course", value: course },
    { key: "course_level", label: "Level", value: level },
    { key: "course_start", label: "Course start", value: start },
    { key: "course_end", label: "Course end", value: end },
    { key: "coe_code", label: "CoE code", value: coe },
    { key: "passport_number", label: "Passport", value: "N1234567" },
  ],
  dates: [{ label: "Course start", date: start }, { label: "Course end", date: end }],
});

// One PDF holding every CoE a student was issued: where she started, then each transfer.
const multiCoe = normaliseExtracted(
  {
    type: "coe",
    person: "Saima A",
    summary: "Four Confirmations of Enrolment",
    fields: [{ key: "provider_name", label: "Provider", value: "Charles Sturt University" }],
    dates: [],
    parts: [
      coePart("Kaplan Business School", "02426B", "Diploma of Business", "Diploma", "2023-02-20", "2024-02-10", "E1"),
      coePart(
        "Kaplan Business School",
        "02426B",
        "Bachelor of Business",
        "Bachelor Degree",
        "2024-03-04",
        "2026-11-20",
        "E2",
      ),
      coePart(
        "Torrens University",
        "03389E",
        "Bachelor of Business",
        "Bachelor Degree",
        "2024-09-02",
        "2026-12-12",
        "E3",
      ),
      coePart(
        "Charles Sturt University",
        "00005F",
        "Bachelor of Accounting",
        "Bachelor Degree",
        "15/07/2025",
        "2027-06-30",
        "E4",
      ),
    ],
  },
  { type: "coe", confidence: 0.9 },
);

Deno.test("keeps every CoE in a multi-CoE file and drops passport numbers", () => {
  expect(multiCoe.parts?.length).toBe(4);
  expect(multiCoe.parts?.[3].fields.find((f) => f.key === "course_start")?.value).toBe("2025-07-15");
  expect(multiCoe.parts?.some((p) => p.fields.some((f) => f.key === "passport_number"))).toBe(false);
  expect(describeExtracted(multiCoe)).toContain("This file holds 4 documents, oldest first:");
  // A single document has no parts.
  const single = normaliseExtracted({
    type: "coe",
    summary: "x",
    parts: [coePart("A", "1", "C", "Diploma", "2024-01-01", "2025-01-01", "Z")],
  }, {
    type: "coe",
    confidence: 0.9,
  });
  expect(single.parts).toBeUndefined();
});

Deno.test("builds the study history across files, oldest first, with each change", () => {
  const docs = [
    { id: "2", filename: "csu-coe.pdf", extracted: { ...multiCoe.parts![3], version: 1, person: null } },
    { id: "1", filename: "Saima after.pdf", extracted: multiCoe },
  ];
  const history = coeHistory(docs);
  // The CSU CoE is in both files: listed once.
  expect(history.map((c) => c.coeCode)).toEqual(["E1", "E2", "E3", "E4"]);
  expect(history[0].change).toEqual([]);
  expect(history[1].change).toEqual(["course level", "course"]);
  expect(history[2].change).toEqual(["provider"]);
  expect(history[3].change).toEqual(["provider", "course"]);
  const text = describeHistory(history);
  expect(text).toContain("1. Diploma of Business (Diploma) at Kaplan Business School, 2023-02-20 to 2024-02-10");
  expect(text).toContain("[changed provider from the CoE before]");
  expect(text).toContain("4. Bachelor of Accounting");
});

Deno.test("plans from the profile's current course, the transcript and the newest CoE", () => {
  const units = normaliseExtracted({
    type: "transcript",
    summary: "Transcript",
    units: [
      { code: "ACC100", name: "Accounting", credit: 8, grade: "D", mark: 74, term: "T3 2025" },
      { code: "ECO100", name: "Economics", credit: 8, grade: "P", mark: 55, term: "T3 2025" },
      { code: "LAW100", name: "Law", credit: 8, grade: "F", mark: 30, term: "T3 2025" },
    ],
  }, { type: "transcript", confidence: 0.9 });
  const docs = [
    { id: "1", filename: "Saima after.pdf", created_at: "2026-01-01", extracted: multiCoe },
    { id: "3", filename: "transcript.pdf", created_at: "2026-02-01", extracted: units },
  ];
  const { units: list } = recordUnits(docs);
  expect(list.length).toBe(3);
  const record = summariseRecord(list);
  const profile = {
    study: [
      { provider: "Kaplan", course: "Diploma of Business", status: "completed" },
      {
        provider: "Charles Sturt University",
        course: "Bachelor of Accounting",
        status: "ongoing",
        creditPointsTotal: 192,
        creditPerUnit: 8,
        termsPerYear: 3,
        standardUnitsPerTerm: 3,
      },
    ],
    currentVisa: { subclass: "500", expiry: "2027-09-15" },
  };
  expect(currentCourse(profile)?.course).toBe("Bachelor of Accounting");
  const { input, from } = buildPlanInput(profile, record, docs, "2026-10-10", { maxOverloadUnits: 4 });
  expect(input.courseCredit).toBe(192);
  expect(input.creditDone).toBe(16);
  expect(input.coeEnd).toBe("2027-06-30");
  expect(from.coeEnd).toBe("CoE document");
  expect(input.visaExpiry).toBe("2027-09-15");
  expect(from.maxOverloadUnits).toBe("you");
  const plan = studyPlan(input);
  expect(plan.remainingCredit).toBe(176);
  expect(plan.scenarios.length).toBeGreaterThan(0);
});

Deno.test("looks up recent changes with the user's visa, goal and question", () => {
  const q = changesQuery(
    { currentVisa: { subclass: "500", name: "Student visa" }, goals: { primary: "Graduate visa then PR" } },
    "Can I extend my visa onshore?",
  );
  expect(q.split(" ")).toEqual(expect.arrayContaining(["500", "student", "visa", "graduate", "extend", "onshore"]));
  expect(q.split(" ").filter((w) => w === "visa").length).toBe(1);
  expect(changesQuery({})).toBe("");
});

Deno.test("gives the AQF guideline credit into a bachelor", () => {
  expect(aqfCreditGuide("Diploma", "Bachelor Degree", 3).percent).toBe(33);
  expect(aqfCreditGuide("Advanced Diploma", "Bachelor Degree", 4).percent).toBe(37.5);
  expect(aqfCreditGuide("Associate Degree", "Bachelor Degree").percent).toBeNull();
  expect(aqfCreditGuide("Diploma", "Bachelor Degree", 3, false).percent).toBeNull();
  expect(aqfCreditGuide("Certificate IV", "Bachelor Degree", 3).source.url).toContain("aqf.edu.au");
});

Deno.test("reads states, subclasses and ANZSCO codes the way people write them", async () => {
  const { anzscoCode, stateCode, subclassCode } = await import("./occupations.ts");
  expect(stateCode("Victoria")).toBe("VIC");
  expect(stateCode("wa")).toBe("WA");
  expect(stateCode("Canberra")).toBe("ACT");
  expect(stateCode("Bali")).toBeUndefined();
  expect(subclassCode("subclass 491 visa")).toBe("491");
  expect(subclassCode(189)).toBe("189");
  expect(anzscoCode("Software Engineer (ANZSCO 261313)")).toBe("261313");
  expect(anzscoCode("software engineer")).toBeUndefined();
});
