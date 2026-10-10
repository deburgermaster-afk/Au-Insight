import type { AqfLevel, CreditGuide } from "./index.ts";

const SOURCE = {
  title: "AQF Qualifications Pathways Policy (Australian Qualifications Framework Council)",
  url: "https://www.aqf.edu.au/download/416/aqf-qualifications-pathways-policy/10/aqf-qualifications-pathways-policy/pdf",
};

/** The policy's guideline credit for a completed qualification linked to a Bachelor Degree, by length. */
const INTO_BACHELOR: Record<string, { three: number; four: number }> = {
  "Advanced Diploma": { three: 50, four: 37.5 },
  "Associate Degree": { three: 50, four: 37.5 },
  Diploma: { three: 33, four: 25 },
};

function norm(level: string): string {
  const l = level.trim().toLowerCase();
  if (l.startsWith("advanced diploma")) return "Advanced Diploma";
  if (l.startsWith("associate degree")) return "Associate Degree";
  if (l === "diploma" || l.startsWith("diploma ")) return "Diploma";
  if (l.startsWith("bachelor honours")) return "Bachelor Honours Degree";
  if (l.startsWith("bachelor")) return "Bachelor Degree";
  return level.trim();
}

/**
 * Guideline credit under the AQF Qualifications Pathways Policy for moving from a completed qualification
 * (`from`) into a Bachelor Degree (`to`) of `toDurationYears` (3 or 4) in a related field. Providers
 * decide credit themselves and may give more or less; for other pairs, or unrelated fields, credit is
 * assessed unit by unit (credit transfer or recognition of prior learning), so no percentage is given.
 */
export function aqfCreditGuide(from: AqfLevel, to: AqfLevel, toDurationYears?: number, related = true): CreditGuide {
  const f = norm(from);
  const t = norm(to);
  const row = INTO_BACHELOR[f];
  if (!related) {
    return {
      percent: null,
      note:
        `The policy's guideline amounts apply to qualifications linked in the same field. For an unrelated ${f}, ` +
        "the provider assesses credit unit by unit (credit transfer or recognition of prior learning).",
      source: SOURCE,
    };
  }
  if (!row || t !== "Bachelor Degree") {
    return {
      percent: null,
      note: `The policy gives no guideline percentage for ${f} into ${t}. The provider assesses credit unit by ` +
        "unit (credit transfer or recognition of prior learning) and sets its own maximum.",
      source: SOURCE,
    };
  }
  if (toDurationYears !== 3 && toDurationYears !== 4) {
    return {
      percent: null,
      note: `Guideline credit for a related ${f}: ${row.three}% of a 3-year Bachelor Degree, ${row.four}% of a ` +
        "4-year one. Tell me the bachelor's length to pick one. Providers decide the final amount.",
      source: SOURCE,
    };
  }
  const percent = toDurationYears === 3 ? row.three : row.four;
  return {
    percent,
    note: `Guideline credit for a related ${f} into a ${toDurationYears}-year Bachelor Degree: ${percent}% of the ` +
      "degree. It is a guideline for agreed pathways; each provider decides the credit it grants.",
    source: SOURCE,
  };
}
