import { describe, expect, it } from "vitest";
import { normaliseEligibility } from "./eligibility.ts";

const cited = [
  { n: 1, title: "CRICOS", url: "https://cricos.education.gov.au/" },
  { n: 2, title: "Entry requirements", url: "https://study.unimelb.edu.au/x" },
];

describe("normaliseEligibility", () => {
  it("keeps a valid answer and only the sources it cited", () => {
    const e = normaliseEligibility({
      status: "eligible_if",
      headline: "Eligible once you finish your bachelor with a WAM of 65.",
      requirements: [{ name: "Academic", required: "Bachelor in IT", you: "Bachelor of IT, finishing 2028", met: true }, {}],
      conditions: ["Finish with WAM 65 (78 average in the remaining 96 credit points)"],
      toQualify: [],
      question: "What final WAM do you expect?",
      sources: [2],
    }, cited);
    expect(e.status).toBe("eligible_if");
    expect(e.requirements.length).toBe(1);
    expect(e.sources).toEqual([cited[1]]);
    expect(e.question).toBe("What final WAM do you expect?");
  });

  it("falls back safely on junk", () => {
    expect(normaliseEligibility({ status: "maybe", requirements: "x" }, cited).status).toBe("unknown");
    expect(normaliseEligibility(null, cited).headline).toContain("Try again");
  });

  it("never reports met for anything but true", () => {
    const e = normaliseEligibility({ status: "not_yet", requirements: [{ name: "English", required: "IELTS 6.5", you: "?", met: "yes" }] }, cited);
    expect(e.requirements[0].met).toBe(null);
  });
});
