// Visa eligibility check: the client's record (age, location, current visa and conditions, English,
// occupation) and a few answers from the agent, tested against each visa's core criteria. Results
// are pass / fail / check per criterion, with a points estimate for points-tested visas. It's a
// screening aid, not advice: the criteria are simplified and policy changes often.

export type EnglishLevel = "functional" | "vocational" | "competent" | "proficient" | "superior";
export type Status = "pass" | "fail" | "check";
export type Check = { id: string; label: string; status: Status; detail: string };

export type EligProfile = {
  age: number | null;
  onshore: boolean;
  currentVisa: string | null;
  conditions: string[];
  englishTest: string | null;
  englishScore: string | null;
  nationality: string | null;
  occupation: { title: string; anzsco: string | null; lists: string[] } | null;
};

/** Agent's answers: true / false, or undefined when not known yet. */
export type Answers = Record<string, boolean | undefined>;
export type PointsInput = Record<string, number>;

const LEVELS: EnglishLevel[] = ["functional", "vocational", "competent", "proficient", "superior"];
const atLeast = (have: EnglishLevel | null, need: EnglishLevel) => (have ? LEVELS.indexOf(have) >= LEVELS.indexOf(need) : null);

/** Reads an English result like "7.0 (no band < 6.5)", "L7 R7 W8 S7" or "79 each" into a level. */
export function englishLevel(test: string | null, score: string | null): EnglishLevel | null {
  if (!test || !score) return null;
  const nums = (score.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return null;
  // The lowest band decides the level ("no band < 6.5" means each band is at least 6.5).
  const each = Math.min(...nums);
  const t = test.toLowerCase();
  if (t.includes("ielts")) return each >= 8 ? "superior" : each >= 7 ? "proficient" : each >= 6 ? "competent" : each >= 5 ? "vocational" : nums[0] >= 4.5 ? "functional" : null;
  if (t.includes("pte")) return each >= 79 ? "superior" : each >= 65 ? "proficient" : each >= 50 ? "competent" : each >= 36 ? "vocational" : each >= 30 ? "functional" : null;
  if (t.includes("toefl")) return nums.length >= 4 ? (nums.every((n, i) => n >= [28, 29, 30, 26][i]) ? "superior" : nums.every((n, i) => n >= [24, 24, 27, 23][i]) ? "proficient" : nums.every((n, i) => n >= [12, 13, 21, 18][i]) ? "competent" : null) : null;
  if (t.includes("oet")) return /\bA\b/.test(score) ? "superior" : /\bB\b/.test(score) ? "proficient" : null;
  return null;
}

type Rule = {
  age?: [number, number]; // inclusive min, exclusive max (e.g. under 45 → [18, 45])
  english?: EnglishLevel;
  where?: "onshore" | "offshore";
  prior?: string[]; // current visa must be one of these
  lists?: string[]; // occupation must be on one of these lists
  points?: number; // nomination/sponsorship points added (5 for 190, 15 for 491)
  pointsTest?: boolean;
  questions?: [string, string][]; // [id, question] the agent answers
};

const SKILLED_Q: [string, string][] = [
  ["skills", "Positive skills assessment for the nominated occupation"],
  ["invited", "SkillSelect invitation received (or EOI lodged)"],
];
const SPONSOR_Q: [string, string][] = [
  ["nomination", "Approved (or lodged) employer nomination"],
  ["experience", "Required work experience in the occupation"],
];

const RULES: Record<string, Rule> = {
  "189": { age: [18, 45], english: "competent", lists: ["MLTSSL"], pointsTest: true, questions: SKILLED_Q },
  "190": { age: [18, 45], english: "competent", lists: ["MLTSSL", "STSOL", "CSOL"], pointsTest: true, points: 5, questions: [...SKILLED_Q, ["nominated", "State or territory nomination"]] },
  "491": { age: [18, 45], english: "competent", lists: ["MLTSSL", "STSOL", "ROL", "CSOL"], pointsTest: true, points: 15, questions: [...SKILLED_Q, ["nominated", "State nomination or eligible relative sponsorship in a regional area"]] },
  "191": { prior: ["491", "494"], questions: [["income", "Taxable income at or above the threshold for 3 income years"], ["regional", "Lived and worked in a designated regional area"]] },
  "482": { english: "vocational", lists: ["CSOL", "MLTSSL", "STSOL"], questions: SPONSOR_Q },
  "186": { age: [18, 45], english: "competent", lists: ["CSOL", "MLTSSL"], questions: [...SPONSOR_Q, ["skills", "Positive skills assessment (Direct Entry), or 2 years with the sponsor (TRT)"]] },
  "494": { age: [18, 45], english: "competent", lists: ["MLTSSL", "STSOL", "ROL", "CSOL"], questions: [...SPONSOR_Q, ["skills", "Positive skills assessment"]] },
  "485": { age: [18, 36], english: "competent", where: "onshore", prior: ["500", "485", "010", "020"], questions: [["cricos", "Completed a CRICOS-registered course of at least 2 academic years in Australia"], ["recent", "Course completed within the last 6 months"], ["afp", "AFP police check applied for"]] },
  "500": { questions: [["coe", "Confirmation of Enrolment (CoE) from a registered provider"], ["funds", "Funds for tuition, living costs and travel"], ["oshc", "Overseas Student Health Cover arranged"], ["gs", "Genuine Student statement prepared"]] },
  "590": { age: [21, 120], questions: [["student", "Student is under 18 (or has exceptional reasons)"], ["parent", "Applicant is the parent, custodian or an eligible relative"]] },
  "820/801": { where: "onshore", questions: [["sponsor", "Partner is an Australian citizen, PR or eligible NZ citizen"], ["genuine", "Genuine and continuing relationship (married or 12 months de facto, or registered)"]] },
  "309/100": { where: "offshore", questions: [["sponsor", "Partner is an Australian citizen, PR or eligible NZ citizen"], ["genuine", "Genuine and continuing relationship"]] },
  "300": { age: [18, 120], where: "offshore", questions: [["sponsor", "Fiancé(e) is an Australian citizen, PR or eligible NZ citizen"], ["met", "Have met in person as adults"], ["marry", "Intend to marry within 9 months of grant"]] },
  "600": { questions: [["funds", "Funds for the visit"], ["genuine", "Genuine temporary visitor with reasons to return"]] },
  "417": { age: [18, 31], where: "offshore", questions: [["passport", "Holds a passport from an eligible 417 country"], ["funds", "About AUD 5,000 plus a return ticket or funds for one"]] },
  "462": { age: [18, 31], where: "offshore", english: "functional", questions: [["passport", "Holds a passport from an eligible 462 country"], ["education", "Meets the education requirement"], ["ballot", "Selected in the ballot (where the country uses one)"]] },
  "476": { age: [18, 31], english: "competent", questions: [["degree", "Engineering degree from a recognised institution in the last 2 years"]] },
  "188": { age: [18, 55], questions: [["nominated", "State or territory nomination"], ["assets", "Business and personal assets for the stream"]] },
  "888": { prior: ["188"], where: "onshore", questions: [["met", "Met the 188 business or investment requirements"], ["nominated", "State or territory nomination"]] },
  "858": { questions: [["record", "Internationally recognised record of exceptional achievement"], ["nominator", "Nominated by a person or organisation with a national reputation"]] },
  "870": { questions: [["sponsor", "Approved parent sponsor (child who is a citizen or PR)"], ["insurance", "Health insurance for the stay"]] },
  "103": { where: "offshore", questions: [["bof", "Passes the balance of family test"], ["sponsor", "Child has lived lawfully in Australia for 2 years"]] },
  "143": { where: "offshore", questions: [["bof", "Passes the balance of family test"], ["aos", "Assurance of Support available"]] },
  "804": { age: [67, 120], where: "onshore", questions: [["bof", "Passes the balance of family test"]] },
  "864": { age: [67, 120], where: "onshore", questions: [["bof", "Passes the balance of family test"], ["aos", "Assurance of Support available"]] },
  "884": { age: [67, 120], where: "onshore", questions: [["bof", "Passes the balance of family test"]] },
  "173": { where: "offshore", questions: [["bof", "Passes the balance of family test"]] },
  "101": { age: [0, 25], where: "offshore", questions: [["parent", "Parent is an Australian citizen, PR or eligible NZ citizen"]] },
  "802": { age: [0, 25], where: "onshore", questions: [["parent", "Parent is an Australian citizen, PR or eligible NZ citizen"]] },
  "866": { where: "onshore", questions: [["claims", "Has protection claims (refugee or complementary protection)"]] },
  "887": { prior: ["489", "495", "496", "475", "487"], where: "onshore", questions: [["regional", "Lived 2 years and worked 1 year full-time in a designated regional area"]] },
  "407": { age: [18, 120], english: "functional", questions: [["nomination", "Approved training nomination"]] },
  "400": { questions: [["specialist", "Highly specialised skills for short-term work"]] },
  "408": { questions: [["activity", "Eligible activity with a sponsor or supporter"]] },
  "786": { prior: ["449"] },
  "851": { prior: ["785", "790"] },
  "155/157": { questions: [["pr", "Is or was an Australian permanent resident"], ["residence", "2 years' residence in the last 5 (155), or compelling reasons (157)"]] },
  CIT: { age: [18, 120], where: "onshore", questions: [["pr", "Permanent resident for at least 12 months"], ["residence", "4 years' lawful residence with no more than 12 months away"]] },
};

// Visas that can only be granted to people who apply in Australia: a No Further Stay condition blocks them.
const NO_FURTHER_STAY = ["8503", "8534", "8535"];

export const hasRules = (code: string) => code in RULES;
export const questionsFor = (code: string) => RULES[code]?.questions ?? [];
export const isPointsTested = (code: string) => Boolean(RULES[code]?.pointsTest);

/** Points test factors the record can't tell us; each has choices with points. */
export const POINT_FACTORS: { key: string; label: string; choices: [string, number][] }[] = [
  { key: "overseas", label: "Skilled work outside Australia (last 10 years)", choices: [["Under 3 years", 0], ["3–4 years", 5], ["5–7 years", 10], ["8+ years", 15]] },
  { key: "australian", label: "Skilled work in Australia (last 10 years)", choices: [["Under 1 year", 0], ["1–2 years", 5], ["3–4 years", 10], ["5–7 years", 15], ["8+ years", 20]] },
  { key: "education", label: "Qualification", choices: [["None that counts", 0], ["Diploma or trade", 10], ["Bachelor or Masters", 15], ["Doctorate", 20]] },
  { key: "partner", label: "Partner", choices: [["Partner, no skills or English", 0], ["Partner has competent English", 5], ["Single, or partner is citizen/PR", 10], ["Skilled partner", 10]] },
  { key: "extra", label: "Other points (Australian study, specialist education, regional study, NAATI, Professional Year)", choices: [["None", 0], ["5", 5], ["10", 10], ["15", 15], ["20", 20], ["25", 25], ["30", 30]] },
];

function agePoints(age: number | null) {
  if (age == null) return null;
  return age < 18 || age >= 45 ? 0 : age < 25 ? 25 : age < 33 ? 30 : age < 40 ? 25 : 15;
}
const englishPoints = (l: EnglishLevel | null) => (l === "superior" ? 20 : l === "proficient" ? 10 : l === "competent" ? 0 : null);

export type EligResult = {
  code: string;
  checks: Check[];
  verdict: "likely" | "possible" | "unlikely";
  points: { total: number; parts: { label: string; pts: number | null }[]; pass: boolean; complete: boolean } | null;
};

export function checkEligibility(code: string, p: EligProfile, answers: Answers = {}, pts: PointsInput = {}): EligResult {
  const r = RULES[code] ?? {};
  const checks: Check[] = [];
  const add = (id: string, label: string, status: Status, detail: string) => checks.push({ id, label, status, detail });
  const level = englishLevel(p.englishTest, p.englishScore);

  if (r.age) {
    const [min, max] = r.age;
    const lim = max >= 120 ? `${min} or over` : min <= 0 ? `under ${max}` : `${min}–${max - 1}`;
    if (p.age == null) add("age", `Age ${lim}`, "check", "Date of birth isn't on the record.");
    else if (p.age >= min && p.age < max) add("age", `Age ${lim}`, "pass", `Client is ${p.age}.`);
    else {
      // Some passports get extended limits (417/462 to 35; 485 to 50 for some streams).
      const soft = (["417", "462"].includes(code) && p.age < 36) || (code === "485" && p.age < 50);
      add("age", `Age ${lim}`, soft ? "check" : "fail", `Client is ${p.age}.${soft ? " Some passports or streams allow a higher age: check." : ""}`);
    }
  }

  if (r.english) {
    const need = r.english;
    const ok = atLeast(level, need);
    if (ok == null) add("english", `${need[0].toUpperCase()}${need.slice(1)} English`, "check", p.englishTest ? `Couldn't read "${p.englishTest} ${p.englishScore ?? ""}". Check the test and bands.` : "No English test on the record (passport holders of the UK, US, Canada, NZ and Ireland are exempt).");
    else add("english", `${need[0].toUpperCase()}${need.slice(1)} English`, ok ? "pass" : "fail", `${p.englishTest} ${p.englishScore}: ${level}.`);
  }

  if (r.where) {
    const here = p.onshore ? "onshore" : "offshore";
    let status: Status = here === r.where ? "pass" : r.where === "offshore" ? "check" : "fail";
    let detail = here === r.where ? `Client is ${here}.` : r.where === "offshore" ? "Client is in Australia: this visa is applied for and granted outside Australia." : "Client is outside Australia: this visa is applied for in Australia.";
    if (code === "300" || code === "309/100") detail += here === "onshore" ? " They can lodge while visiting but must be offshore at grant." : "";
    if (code === "417" && p.currentVisa === "417") {
      status = "pass";
      detail = "Second or third Working Holiday visa: can apply in Australia.";
    }
    add("location", r.where === "onshore" ? "Applies in Australia" : "Applies outside Australia", status, detail);
  }

  if (p.onshore && p.conditions.some((c) => NO_FURTHER_STAY.includes(c))) {
    const c = p.conditions.filter((x) => NO_FURTHER_STAY.includes(x)).join(", ");
    add("nfs", "No Further Stay condition", r.where === "offshore" ? "pass" : "fail", r.where === "offshore" ? `Condition ${c} doesn't stop an offshore application.` : `Condition ${c} means most visas can't be applied for in Australia unless it's waived.`);
  }

  // Since 2 Oct 2026, Working Holiday Makers apply for a student visa from outside Australia; since
  // 1 July 2024 visitors and Temporary Graduates can't apply for one onshore.
  if (code === "500" && p.onshore && p.currentVisa && ["417", "462", "600", "601", "651", "485"].includes(p.currentVisa)) add("onshore500", "Can apply for a student visa in Australia", "fail", `Holders of a ${p.currentVisa} must apply for a student visa from outside Australia.`);

  if (r.prior) {
    const ok = p.currentVisa ? r.prior.includes(p.currentVisa) : null;
    add("prior", `Holds a ${r.prior.join(" / ")}`, ok == null ? "check" : ok ? "pass" : code === "485" ? "check" : "fail", ok == null ? "Current visa isn't on the record." : ok ? `Holds a ${p.currentVisa}.` : `Holds a ${p.currentVisa}${code === "485" ? ": must have held a student visa in the last 6 months." : "."}`);
  }

  if (r.lists) {
    if (!p.occupation) add("occupation", `Occupation on the ${r.lists.join(" / ")}`, "check", "No occupation on the record.");
    else if (!p.occupation.lists.length) add("occupation", `Occupation on the ${r.lists.join(" / ")}`, "check", `Couldn't match "${p.occupation.title}" to an ANZSCO occupation.`);
    else {
      const on = p.occupation.lists.filter((l) => r.lists!.includes(l));
      add("occupation", `Occupation on the ${r.lists.join(" / ")}`, on.length ? "pass" : "fail", `${p.occupation.title}${p.occupation.anzsco ? ` (${p.occupation.anzsco})` : ""} is on ${p.occupation.lists.join(", ") || "no list"}.${on.length ? "" : code === "190" || code === "491" ? " States may have their own lists: check." : ""}`);
    }
  }

  for (const [id, q] of r.questions ?? []) {
    const a = answers[id];
    add(id, q, a === true ? "pass" : a === false ? "fail" : "check", a === true ? "Confirmed by agent." : a === false ? "Not met." : "Not answered yet.");
  }

  let points: EligResult["points"] = null;
  if (r.pointsTest) {
    const parts: { label: string; pts: number | null }[] = [
      { label: "Age", pts: agePoints(p.age) },
      { label: "English", pts: englishPoints(level) },
      ...POINT_FACTORS.map((f) => ({ label: f.label.replace(/ \(.*\)$/, ""), pts: pts[f.key] ?? null })),
    ];
    if (r.points) parts.push({ label: code === "190" ? "State nomination" : "Nomination or regional sponsorship", pts: r.points });
    const total = parts.reduce((a, x) => a + (x.pts ?? 0), 0);
    const complete = parts.every((x) => x.pts != null);
    points = { total, parts, pass: total >= 65, complete };
    add("points", "At least 65 points", total >= 65 ? "pass" : complete ? "fail" : "check", `${total} points${complete ? "" : " so far (some factors not entered)"}. Invitation cut-offs are usually higher than 65.`);
  }

  const fails = checks.filter((c) => c.status === "fail").length;
  const open = checks.filter((c) => c.status === "check").length;
  return { code, checks, points, verdict: fails ? "unlikely" : open ? "possible" : "likely" };
}

export function ageOn(dob: string | Date | null | undefined, at = new Date()) {
  if (!dob) return null;
  const d = new Date(dob);
  let a = at.getFullYear() - d.getFullYear();
  if (at.getMonth() < d.getMonth() || (at.getMonth() === d.getMonth() && at.getDate() < d.getDate())) a--;
  return a;
}

/** The screening criteria for a visa, as plain sentences (for the visa library page). */
export function criteriaFor(code: string): string[] {
  const r = RULES[code];
  if (!r) return [];
  const out: string[] = [];
  if (r.age) out.push(r.age[1] >= 120 ? `Aged ${r.age[0]} or over` : r.age[0] <= 0 ? `Under ${r.age[1]}` : `Aged ${r.age[0]}–${r.age[1] - 1}`);
  if (r.english) out.push(`${r.english[0].toUpperCase()}${r.english.slice(1)} English (or exempt)`);
  if (r.where) out.push(r.where === "onshore" ? "Apply in Australia" : "Apply outside Australia");
  if (r.prior) out.push(`Holds (or held) a ${r.prior.join(" / ")}`);
  if (r.lists) out.push(`Occupation on the ${r.lists.join(" / ")}`);
  if (r.pointsTest) out.push(`At least 65 points${r.points ? ` (incl. ${r.points} for nomination)` : ""}`);
  for (const [, q] of r.questions ?? []) out.push(q);
  return out;
}
