// The structured profile the chat builds during the guided intake (cases.profile).

export const INTAKE_SECTIONS = [
  "personal",
  "arrival",
  "residence",
  "study",
  "currentVisa",
  "work",
  "partner",
  "english",
  "goals",
] as const;

const str = { type: "string" };
const bool = { type: "boolean" };

export const profileJsonSchema = {
  type: "object",
  description:
    "Only what the user said or their documents show. Send just the parts you learned; they are merged into the saved profile (lists replace the saved list, so send the whole list).",
  properties: {
    personal: {
      type: "object",
      properties: { name: str, dateOfBirth: { ...str, description: "YYYY-MM-DD" }, citizenship: str },
    },
    residence: {
      type: "object",
      description: "Where they live now",
      properties: {
        city: str,
        state: { ...str, description: "Australian state or territory" },
        since: str,
        regional: { ...bool, description: "Only if they or an official source said so" },
        willingToMove: str,
      },
    },
    arrival: {
      type: "object",
      properties: { date: str, visa: { ...str, description: "Visa name or subclass" }, city: str },
    },
    study: {
      type: "array",
      description: "Every course in Australia, oldest first, including ones they left.",
      items: {
        type: "object",
        properties: {
          provider: str,
          course: str,
          level: { ...str, description: "Qualification level" },
          start: str,
          end: str,
          status: { type: "string", enum: ["completed", "ongoing", "withdrawn", "deferred", "transferred"] },
          changedFrom: { ...str, description: "Previous provider, if they changed provider into this one" },
          current: { ...bool, description: "The course they are enrolled in now" },
          providerCode: { ...str, description: "CRICOS provider code" },
          cricosCode: { ...str, description: "CRICOS course code" },
          coeEnd: { ...str, description: "Course end date on the current CoE, YYYY-MM-DD" },
          creditPointsTotal: { type: "number", description: "Credit points the whole course needs" },
          creditPointsCompleted: {
            type: "number",
            description: "Credit points passed so far, excluding credit granted",
          },
          creditPerUnit: { type: "number", description: "Credit points of a standard unit" },
          creditGranted: {
            type: "number",
            description: "Credit points granted for prior study (RPL or credit transfer)",
          },
          termsPerYear: { type: "number", description: "Main study periods per year (2 semesters, 3 trimesters)" },
          standardUnitsPerTerm: { type: "number", description: "Full-time load in units per study period" },
          maxOverloadUnits: { type: "number", description: "Most units the provider allows in one study period" },
          summerWinterTerms: { ...bool, description: "Whether the provider runs summer or winter terms they can take" },
          nextTermStart: { ...str, description: "Start date of their next study period, YYYY-MM-DD" },
          note: str,
        },
      },
    },
    currentVisa: {
      type: "object",
      properties: {
        subclass: str,
        name: str,
        granted: str,
        expiry: str,
        conditions: { type: "array", items: str },
        status: { type: "string", enum: ["holding", "bridging", "expired", "applied", "none"] },
        pendingApplication: str,
      },
    },
    work: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["full-time", "part-time", "casual", "self-employed", "not working"] },
        occupation: str,
        employer: str,
        since: str,
        hoursPerWeek: { type: "number" },
        skilledYearsAustralia: { type: "number" },
        skilledYearsOverseas: { type: "number" },
        skillsAssessment: str,
      },
    },
    partner: {
      type: "object",
      properties: {
        has: bool,
        name: str,
        dateOfBirth: { ...str, description: "YYYY-MM-DD" },
        relationship: { type: "string", enum: ["married", "de facto", "engaged", "none"] },
        onYourVisa: { ...bool, description: "Included in the user's visa as a dependent" },
        visa: str,
        studying: bool,
        provider: str,
        course: str,
        providerChanges: str,
        working: str,
        occupation: str,
        english: str,
      },
    },
    dependents: {
      type: "array",
      items: { type: "object", properties: { relation: str, age: { type: "number" }, visa: str } },
    },
    english: { type: "object", properties: { test: str, score: str, date: str } },
    goals: { type: "object", properties: { primary: str, location: str, timeframe: str, notes: str } },
  },
};

export type Profile = Record<string, unknown>;

/** Merges a partial profile into the saved one: objects merge key by key, lists and values replace. */
export function mergeProfile(saved: Profile, update: Profile): Profile {
  const out: Profile = { ...saved };
  for (const [k, v] of Object.entries(update)) {
    if (v === null || v === undefined) continue;
    const old = out[k];
    out[k] = isObject(v) && isObject(old) ? mergeProfile(old, v) : v;
  }
  return out;
}

/** Intake sections the user hasn't covered yet. */
export function missingSections(profile: Profile): string[] {
  return INTAKE_SECTIONS.filter((s) => {
    const v = profile[s];
    return v === undefined || (Array.isArray(v) ? v.length === 0 : isObject(v) && Object.keys(v).length === 0);
  });
}

function isObject(v: unknown): v is Profile {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
