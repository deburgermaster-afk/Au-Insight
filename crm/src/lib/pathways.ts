import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { completeJson } from "@/lib/llm";
import { searchCourses } from "@/lib/occupations";

// ── Shape of a suggestion ──────────────────────────────────────────────────────────────────────
const Step = z.object({
  kind: z.enum(["study", "english", "skills", "work", "visa", "pr"]),
  title: z.string().describe("Short action, e.g. 'Finish Master of Professional Accounting'"),
  visa: z.string().nullable().describe("Visa subclass for this step, e.g. '485', or null"),
  months: z.number().describe("Estimated duration of this step in months"),
  detail: z.string().describe("One or two sentences: what to do and why it matters for this student"),
  overlapsPrevious: z.boolean().describe("True when this step runs at the same time as the previous step (e.g. skilled work during the 485)"),
});
const SecondaryCourse = z.object({
  name: z.string().describe("Course type, e.g. 'Professional Year in Accounting'"),
  level: z.string(),
  why: z.string().describe("How it shortens the route or adds points"),
  pointsGain: z.number().nullable().describe("Skilled migration points it adds, if any"),
  searchTerms: z.string().describe("2-4 words to search CRICOS for this course, e.g. 'professional year accounting'"),
});
export const PathwaySchema = z.object({
  headline: z.string().describe("The recommended route in under 12 words"),
  summary: z.string().describe("2-3 sentences for the agent explaining the recommendation"),
  confidence: z.enum(["low", "medium", "high"]),
  basedOn: z.string().describe("What the suggestion is based on, e.g. '9 similar students at this agency'"),
  totalMonths: z.number().describe("Estimated months from today to permanent residence"),
  pointsEstimate: z.number().nullable().describe("Estimated skilled points at EOI time, or null if not points-tested"),
  steps: z.array(Step).describe("The route in order, 4-8 steps, ending at permanent residence"),
  alternatives: z.array(z.object({ title: z.string(), visas: z.string(), months: z.number(), note: z.string() })).describe("1-3 other routes worth considering"),
  secondaryCourses: z.array(SecondaryCourse).describe("2-4 additional or follow-on courses that help"),
  risks: z.array(z.string()).describe("2-4 things that could break or slow the route"),
});
export type Pathway = z.infer<typeof PathwaySchema> & {
  mode: "agency_pattern" | "fastest_pr";
  courses?: Record<number, { code: string; name: string; provider: string; tuition: string | null } | null>;
};

/** Start and end month of each step, letting overlapping steps run alongside the one before. */
export function schedule(steps: { months: number; overlapsPrevious?: boolean }[]) {
  // A step starts when the one before it ends, or alongside it when it overlaps.
  const out: { from: number; to: number }[] = [];
  for (const [i, x] of steps.entries()) {
    const prev = out[i - 1];
    const from = !prev ? 0 : x.overlapsPrevious ? prev.from : prev.to;
    out.push({ from, to: from + x.months });
  }
  return { slots: out, total: Math.max(0, ...out.map((o) => o.to)) };
}

// ── Context ────────────────────────────────────────────────────────────────────────────────────
const levelOf = (course: string) =>
  /phd|doctor/i.test(course)
    ? "Doctorate"
    : /master/i.test(course)
      ? "Masters"
      : /graduate (diploma|certificate)/i.test(course)
        ? "Graduate diploma"
        : /bachelor/i.test(course)
          ? "Bachelor"
          : /advanced diploma|diploma/i.test(course)
            ? "Diploma"
            : /certificate/i.test(course)
              ? "Certificate"
              : "Other";
const field = (course: string) => course.toLowerCase().replace(/master of|bachelor of|graduate|diploma of|certificate (iii|iv) in|advanced|professional|\(.*?\)/g, " ").split(/\W+/).filter((w) => w.length > 3);
const ageOf = (dob: string | null) => (dob ? Math.floor((Date.now() - new Date(dob).getTime()) / 3.15576e10) : null);

export async function pathwayContext(agencyId: string, clientId: string) {
  const [client] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, clientId)));
  if (!client) return null;
  const [apps, matters, profile] = await Promise.all([
    db.select({ a: s.studentApplications, inst: s.institutions.name }).from(s.studentApplications).leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId)).where(eq(s.studentApplications.clientId, clientId)).orderBy(desc(s.studentApplications.createdAt)),
    db.select().from(s.matters).where(eq(s.matters.clientId, clientId)),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  const current = apps[0] ?? null;
  const level = current ? levelOf(current.a.course) : null;
  const words = new Set(current ? field(current.a.course) : (client.occupation ?? "").toLowerCase().split(/\W+/));

  // Similar students this agency has worked with: same nationality, level or field of study.
  const others = await db
    .select({ a: s.studentApplications, inst: s.institutions.name, c: s.clients })
    .from(s.studentApplications)
    .innerJoin(s.clients, eq(s.clients.id, s.studentApplications.clientId))
    .leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId))
    .where(and(eq(s.studentApplications.agencyId, agencyId), ne(s.studentApplications.clientId, clientId)));
  const scored = new Map<string, { score: number; client: typeof s.clients.$inferSelect; courses: { course: string; institution: string | null; status: string; level: string }[] }>();
  for (const r of others) {
    const lv = levelOf(r.a.course);
    let score = 0;
    if (client.nationality && r.c.nationality === client.nationality) score += 1;
    if (level && lv === level) score += 1;
    if (field(r.a.course).some((w) => words.has(w))) score += 2;
    const prev = scored.get(r.c.id);
    const entry = { course: r.a.course, institution: r.inst, status: r.a.status, level: lv };
    if (prev) {
      prev.score = Math.max(prev.score, score);
      prev.courses.push(entry);
    } else scored.set(r.c.id, { score, client: r.c, courses: [entry] });
  }
  const similar = [...scored.values()].filter((x) => x.score >= 2).sort((a, b) => b.score - a.score).slice(0, 25);
  const theirMatters = similar.length ? await db.select().from(s.matters).where(inArray(s.matters.clientId, similar.map((x) => x.client.id))) : [];
  const histories = similar.map((x) => ({
    nationality: x.client.nationality,
    currentVisa: x.client.currentVisa,
    occupation: x.client.occupation,
    studies: x.courses,
    visas: theirMatters.filter((m) => m.clientId === x.client.id).map((m) => ({ visa: m.visaCode, stage: m.stage, outcome: m.outcome })),
  }));
  // Enough of a pattern when at least 3 similar students went on to a further course or visa.
  const informative = histories.filter((h) => h.visas.length || h.studies.length > 1).length;
  const mode: Pathway["mode"] = informative >= 3 ? "agency_pattern" : "fastest_pr";
  return {
    mode,
    agency: { services: profile[0]?.services ?? [], state: profile[0]?.state ?? null },
    student: {
      age: ageOf(client.dateOfBirth),
      nationality: client.nationality,
      onshore: client.onshore,
      currentVisa: client.currentVisa,
      visaExpiry: client.visaExpiry,
      occupation: client.occupation,
      anzsco: client.anzsco,
      english: client.englishTest ? `${client.englishTest} ${client.englishScore ?? ""}`.trim() : null,
      currentCourse: current ? { course: current.a.course, level, institution: current.inst, intake: current.a.intake, status: current.a.status } : null,
      otherCourses: apps.slice(1).map((r) => ({ course: r.a.course, institution: r.inst, status: r.a.status })),
      matters: matters.map((m) => ({ visa: m.visaCode, stage: m.stage, outcome: m.outcome })),
    },
    similar: histories,
  };
}
export type PathwayContext = NonNullable<Awaited<ReturnType<typeof pathwayContext>>>;

// ── xKiro (the provider Immi Insight uses) ─────────────────────────────────────────────────────
export async function pathwayFromXkiro(ctx: PathwayContext): Promise<{ pathway: Pathway; model: string } | null> {
  const r = await completeJson(PathwaySchema, SYSTEM, `Mode: ${ctx.mode}\nToday: ${new Date().toISOString().slice(0, 10)}\n\n<context>\n${JSON.stringify(ctx, null, 1)}\n</context>`);
  return r ? { pathway: { ...r.value, mode: ctx.mode }, model: r.model } : null;
}

// ── Claude ─────────────────────────────────────────────────────────────────────────────────────
export const PATHWAY_MODEL = "claude-opus-5-5";

const SYSTEM = `You help registered migration agents in Australia plan study-to-permanent-residence pathways for international students.

Work only with real Australian visa subclasses and current settings as you understand them (for example 500 Student, 485 Temporary Graduate, 189, 190, 491, 191, 482 / Skills in Demand, 186, 494, 820/801 partner). Settings change often, so phrase durations and requirements as estimates and flag anything the agent must verify.

You will receive the student's profile and, when available, anonymised histories of similar students this agency has worked with.
- When the mode is "agency_pattern", build the route around what this agency has actually done for similar students (courses, institutions, visas, outcomes) and say how many similar students it is based on.
- When the mode is "fastest_pr", there is not enough agency history: give the fastest realistic route to permanent residence from the student's current visa and current course, and recommend secondary or follow-on courses (for example a Professional Year, NAATI CCL, a regional campus, a course for an occupation on current skills lists) that shorten it or add points.

Be specific to this student: use their age, course level, field, English, nationality and visa expiry. Durations are months from today. Keep every text field short and concrete. This is decision support for a registered agent, not advice to the student.`;

export async function pathwayFromClaude(ctx: PathwayContext): Promise<Pathway | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic();
  const response = await client.beta.messages.parse({
    model: PATHWAY_MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: betaZodOutputFormat(PathwaySchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: `Mode: ${ctx.mode}\nToday: ${new Date().toISOString().slice(0, 10)}\n\n<context>\n${JSON.stringify(ctx, null, 1)}\n</context>` }],
  });
  if (response.stop_reason === "refusal" || !response.parsed_output) return null;
  return { ...response.parsed_output, mode: ctx.mode };
}

// ── Rules engine (no API key, or Claude declined) ──────────────────────────────────────────────
export function pathwayFromRules(ctx: PathwayContext): Pathway {
  const st = ctx.student;
  const lvl = st.currentCourse?.level ?? null;
  const age = st.age ?? 26;
  const course = st.currentCourse?.course ?? "current course";
  const higherEd = lvl === "Masters" || lvl === "Bachelor" || lvl === "Doctorate";
  const months = (iso: string | null | undefined, fallback: number) => (iso ? Math.max(1, Math.round((new Date(iso).getTime() - Date.now()) / 2.63e9)) : fallback);
  const studyLeft = months(st.visaExpiry, lvl === "Masters" ? 14 : 18);
  const fieldText = course.toLowerCase();
  const py = /account|financ|comput|information tech|software|data|engineer/.test(fieldText);
  const shortage = /nurs|teach|early childhood|social work|aged care|engineer|cook|chef/.test(fieldText);

  // Learned from the agency's own students when there is enough history.
  const counts = new Map<string, number>();
  const followOn = new Map<string, number>();
  for (const h of ctx.similar) {
    for (const v of h.visas) counts.set(v.visa, (counts.get(v.visa) ?? 0) + 1);
    for (const c of h.studies.slice(1)) followOn.set(c.course, (followOn.get(c.course) ?? 0) + 1);
  }
  const topVisas = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const topCourse = [...followOn.entries()].sort((a, b) => b[1] - a[1])[0];

  // Field-specific assessing authority and registration.
  const assessor = /nurs|midwi/.test(fieldText)
    ? { who: "ANMAC", reg: "AHPRA registration as a registered nurse" }
    : /account|financ/.test(fieldText)
      ? { who: "CPA Australia, CA ANZ or IPA", reg: null }
      : /comput|information tech|software|data|cyber/.test(fieldText)
        ? { who: "ACS", reg: null }
        : /engineer/.test(fieldText)
          ? { who: "Engineers Australia", reg: null }
          : /teach|education|early childhood/.test(fieldText)
            ? { who: "AITSL", reg: "State teacher registration" }
            : /social work/.test(fieldText)
              ? { who: "AASW", reg: null }
              : /cook|chef|hospitality|commercial cookery/.test(fieldText)
                ? { who: "TRA", reg: null }
                : { who: "the relevant assessing authority", reg: null };
  const started = st.currentCourse?.status === "enrolled" && (st.currentVisa === "500" || st.currentVisa === null);
  const courseMonths = lvl === "Masters" ? 24 : lvl === "Bachelor" ? 36 : lvl === "Doctorate" ? 42 : lvl === "Graduate diploma" ? 12 : lvl === "Diploma" ? 18 : 12;

  const steps: (Omit<Pathway["steps"][number], "overlapsPrevious"> & { overlapsPrevious?: boolean })[] = [];
  if (!started) {
    steps.push({ kind: "visa", title: `Student visa for ${st.currentCourse?.intake ?? "the next intake"}`, visa: "500", months: 3, detail: `Lodge once the CoE is issued${st.currentVisa && st.currentVisa !== "500" ? `; plan the change from the ${st.currentVisa} carefully (no further-stay conditions, onshore eligibility)` : ""}. Show Genuine Student evidence and funds.` });
    steps.push({ kind: "study", title: `Complete ${course}`, visa: "500", months: courseMonths, detail: "Keep enrolment, attendance and health cover current; part-time work rights apply during study." });
  } else {
    steps.push({ kind: "study", title: `Finish ${course}`, visa: "500", months: studyLeft, detail: "Complete the course on time and keep enrolment, attendance and health cover current." });
  }
  if (assessor.reg) steps.push({ kind: "skills", title: assessor.reg, visa: null, months: 3, detail: "Professional registration is needed to work in the occupation and usually before the skills assessment." });
  const soFar = Math.round(steps.reduce((t, x) => t + x.months, 0) / 12);
  if (higherEd && age + soFar <= 35) {
    steps.push({ kind: "visa", title: "Apply for Temporary Graduate visa", visa: "485", months: lvl === "Doctorate" ? 36 : 24, detail: "Post-Higher Education Work stream: full work rights while building skilled experience. Apply within 6 months of completion." });
  } else if (!higherEd) {
    steps.push({ kind: "skills", title: "Trade or skills assessment", visa: null, months: 4, detail: "Vocational graduates usually need a positive skills assessment (often TRA) before work or employer routes open." });
  }
  const after485 = steps.some((x) => x.visa === "485");
  steps.push({ kind: "english", overlapsPrevious: after485, title: "Lift English to Proficient or Superior", visa: null, months: 3, detail: "IELTS 7 or 8 (or PTE 65/79) adds 10–20 points and is the quickest points gain." });
  steps.push({ kind: "skills", overlapsPrevious: after485, title: `Skills assessment with ${assessor.who}`, visa: null, months: 3, detail: "Assess against the nominated occupation; needed for every points-tested and most employer visas." });
  if (higherEd) {
    steps.push({ kind: "work", overlapsPrevious: after485, title: "Gain 1 year of skilled work in Australia", visa: "485", months: 12, detail: "One year adds 5 points and strengthens state nomination; employer sponsorship may open in parallel." });
    steps.push({ kind: "visa", title: "State nomination: EOI for 190 or 491", visa: "190", months: 6, detail: "Target states nominating the occupation; 491 regional adds 15 points and leads to 191 PR after 3 years." });
    steps.push({ kind: "pr", title: "Skilled Nominated permanent visa", visa: "190", months: 9, detail: "Lodge after invitation; processing commonly runs several months." });
  } else {
    steps.push({ kind: "work", title: "Employer sponsorship", visa: "482", months: 24, detail: "Skills in Demand visa with an approved sponsor; two years with the employer opens the permanent route." });
    steps.push({ kind: "pr", title: "Employer Nomination (Temporary Residence Transition)", visa: "186", months: 9, detail: "Permanent visa after qualifying time with the sponsoring employer." });
  }

  const secondary: Pathway["secondaryCourses"] = [];
  if (py) secondary.push({ name: "Professional Year program", level: "Non AQF Award", why: "One-year structured program with an internship in accounting, IT or engineering.", pointsGain: 5, searchTerms: fieldText.includes("account") ? "professional year accounting" : fieldText.includes("engineer") ? "professional year engineering" : "professional year computer" });
  secondary.push({ name: "NAATI Credentialed Community Language test", level: "Test, not a course", why: "Passing the CCL test adds 5 points in weeks, not years.", pointsGain: 5, searchTerms: "" });
  if (higherEd && !shortage) secondary.push({ name: "Graduate study in a shortage occupation", level: "Masters", why: "Switching to nursing, teaching or social work opens occupations states nominate often.", pointsGain: null, searchTerms: "master nursing" });
  if (!higherEd) secondary.push({ name: "Bachelor or Masters in the same field", level: "Bachelor", why: "A higher-education award opens the 485 and points-tested routes.", pointsGain: 5, searchTerms: fieldText.split(" ").slice(-2).join(" ") || "bachelor" });
  secondary.push({ name: "Regional campus study (2 years)", level: "Any", why: "Studying in a designated regional area adds 5 points and can extend the 485.", pointsGain: 5, searchTerms: "" });

  const total = schedule(steps).total;
  const agency = ctx.mode === "agency_pattern";
  return {
    mode: ctx.mode,
    headline: higherEd ? (age <= 35 ? "485 → skilled experience → state-nominated PR" : "Employer sponsorship → permanent residence") : "Skills assessment → employer sponsorship → 186",
    summary: agency
      ? `Similar students at this agency most often went on to ${topVisas.map(([v, n]) => `${v} (${n})`).join(", ") || "further study"}${topCourse ? `, and ${topCourse[1]} took ${topCourse[0]}` : ""}. This route follows that pattern for ${course}.`
      : `Not enough similar students at this agency yet, so this is the fastest common route from ${st.currentVisa ?? "a student visa"} and ${course}. Points boosters below can shorten it.`,
    confidence: agency ? "medium" : "low",
    basedOn: agency ? `${ctx.similar.length} similar students at this agency (rules estimate)` : "General study-to-PR settings (rules estimate)",
    totalMonths: Math.max(12, total),
    pointsEstimate: higherEd ? (age < 25 ? 25 : age < 33 ? 30 : age < 40 ? 25 : 15) + 15 + 10 + 5 + 5 : null,
    steps: steps.map((x) => ({ ...x, overlapsPrevious: x.overlapsPrevious ?? false })),
    alternatives: [
      { title: "Regional route", visas: "491 → 191", months: 48, note: "Lower invitation points; must live and work regionally for 3 years." },
      { title: "Employer sponsorship", visas: "482 → 186", months: 36, note: "Needs an approved sponsor in the nominated occupation." },
    ],
    secondaryCourses: secondary.slice(0, 4),
    risks: [
      st.visaExpiry ? `Student visa expires ${st.visaExpiry}; plan the 485 or a new 500 before then.` : "Visa expiry not recorded; check it first.",
      age >= 33 ? "Age points drop at 33 and 40; earlier EOI lodgement helps." : "Occupation lists and state nomination criteria change each program year.",
      "Invitation cut-offs for popular occupations can sit well above 65 points.",
    ],
  };
}

/** Looks up a real CRICOS course for each secondary course, cheapest first. */
export async function attachCourses(p: Pathway): Promise<Pathway> {
  const found = await Promise.all(
    p.secondaryCourses.map(async (c) => {
      if (!c.searchTerms.trim()) return null;
      try {
        const [hit] = await searchCourses(c.searchTerms);
        return hit ? { code: hit.code, name: hit.name, provider: hit.provider_names?.split(/[;,]/)[0]?.trim() ?? hit.provider_code, tuition: hit.annual_tuition } : null;
      } catch {
        return null;
      }
    }),
  );
  return { ...p, courses: Object.fromEntries(found.map((f, i) => [i, f])) };
}
