// Study tools: the student's CoE history (across every document, including files that hold several
// CoEs), their academic record from transcripts, and the study plan from the academic engine. Used by
// the agent as tools and by the app through the direct endpoint.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type PlanInput,
  type PlanResult,
  type RecordSummary,
  studyPlan,
  summariseRecord,
  type UnitResult,
} from "../_shared/academic/index.ts";
import { dateOf, type Extracted, field, isExtracted } from "./docintel.ts";
import { isoDate, num, type ToolDef } from "./shared.ts";

type DocRow = { id: string; filename: string; created_at?: string; extracted: unknown };

/** One CoE the student held, from a CoE document or one part of a multi-CoE file. */
export type CoeEntry = {
  provider: string | null;
  providerCode: string | null;
  course: string | null;
  courseCode: string | null;
  level: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
  coeCode: string | null;
  document: string;
  /** What changed from the CoE before: provider, course level, or course. */
  change: string[];
};

type CoeSource = Pick<Extracted, "fields" | "dates" | "summary"> & { type: string };

function coeFrom(e: CoeSource, document: string): Omit<CoeEntry, "change"> {
  const asExtracted = e as unknown as Extracted;
  return {
    provider: field(asExtracted, "provider_name") ?? null,
    providerCode: field(asExtracted, "provider_cricos_code") ?? null,
    course: field(asExtracted, "course_name") ?? null,
    courseCode: field(asExtracted, "course_cricos_code") ?? null,
    level: field(asExtracted, "course_level") ?? null,
    start: dateOf(asExtracted, ["course_start"], /start/i) ?? null,
    end: dateOf(asExtracted, ["course_end"], /end|finish/i) ?? null,
    status: field(asExtracted, "coe_status") ?? null,
    coeCode: field(asExtracted, "coe_code") ?? null,
    document,
  };
}

const same = (a: string | null, b: string | null) =>
  !!a && !!b && a.toLowerCase().replace(/[^a-z0-9]/g, "") === b.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Every CoE across the user's documents, oldest first, with what changed from one to the next. */
export function coeHistory(docs: DocRow[]): CoeEntry[] {
  const raw: Omit<CoeEntry, "change">[] = [];
  for (const d of docs) {
    if (!isExtracted(d.extracted)) continue;
    const e = d.extracted;
    const parts = (e.parts ?? []).filter((p) => p.type === "coe");
    if (parts.length) for (const p of parts) raw.push(coeFrom(p, d.filename));
    else if (e.type === "coe") raw.push(coeFrom(e, d.filename));
  }
  // The same CoE can appear in two files: keep one per CoE code (or per course + start).
  const seen = new Set<string>();
  const unique = raw.filter((c) => {
    const key = c.coeCode ?? `${c.courseCode ?? c.course}|${c.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort((a, b) => (a.start ?? "9999").localeCompare(b.start ?? "9999"));
  return unique.map((c, i) => {
    const prev = unique[i - 1];
    const change: string[] = [];
    if (prev) {
      if (!same(prev.provider, c.provider) && !same(prev.providerCode, c.providerCode)) change.push("provider");
      if (prev.level && c.level && !same(prev.level, c.level)) change.push("course level");
      if (!same(prev.course, c.course)) change.push("course");
    }
    return { ...c, change };
  });
}

/** One line per CoE for the agent's context ("Study history from CoEs: …"). */
export function describeHistory(history: CoeEntry[]): string {
  if (!history.length) return "";
  const lines = history.map((c, i) => {
    const what = [c.course, c.level && `(${c.level})`, c.provider && `at ${c.provider}`].filter(Boolean).join(" ");
    const when = [c.start, c.end].filter(Boolean).join(" to ");
    const status = c.status ? `, CoE status ${c.status}` : "";
    const changed = c.change.length ? ` [changed ${c.change.join(" and ")} from the CoE before]` : "";
    return `${i + 1}. ${what || "Course"}${when ? `, ${when}` : ""}${status}${changed} (from ${c.document})`;
  });
  return `Study history from the CoEs in their documents, oldest first:\n${lines.join("\n")}`;
}

/** Every unit from transcripts, newest transcript first, without repeats. */
export function recordUnits(docs: DocRow[]): { units: UnitResult[]; documents: { id: string; filename: string }[] } {
  const units: UnitResult[] = [];
  const documents: { id: string; filename: string }[] = [];
  const seen = new Set<string>();
  const sorted = [...docs].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  for (const d of sorted) {
    if (!isExtracted(d.extracted) || d.extracted.type !== "transcript" || !d.extracted.units?.length) continue;
    documents.push({ id: d.id, filename: d.filename });
    for (const u of d.extracted.units) {
      const key = `${u.code ?? u.name}|${u.term ?? ""}|${u.grade ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      units.push(u);
    }
  }
  return { units, documents };
}

type Profile = Record<string, unknown>;

/** The course the student is on now: marked current, else the last ongoing one, else the last one. */
export function currentCourse(profile: Profile): Record<string, unknown> | null {
  const study = Array.isArray(profile.study) ? profile.study as Record<string, unknown>[] : [];
  return study.find((s) => s.current === true) ?? [...study].reverse().find((s) => s.status === "ongoing") ??
    study.at(-1) ?? null;
}

/** The latest date a matching document shows (e.g. the newest CoE's course end). */
function latestDocDate(docs: DocRow[], type: string, keys: string[], label: RegExp): string | undefined {
  const dates: string[] = [];
  for (const d of docs) {
    if (!isExtracted(d.extracted)) continue;
    const e = d.extracted;
    if (e.type === type) {
      const v = dateOf(e, keys, label);
      if (v) dates.push(v);
    }
    for (const p of e.parts ?? []) {
      if (p.type !== type) continue;
      const v = dateOf(p as unknown as Extracted, keys, label);
      if (v) dates.push(v);
    }
  }
  return dates.sort().at(-1);
}

/** PlanInput from the profile, the academic record and the documents; `overrides` win. */
export function buildPlanInput(
  profile: Profile,
  record: RecordSummary | null,
  docs: DocRow[],
  today: string,
  overrides: Record<string, unknown> = {},
): { input: PlanInput; from: Record<string, string> } {
  const course = currentCourse(profile) ?? {};
  const from: Record<string, string> = {};
  const input: PlanInput = { today };
  const set = <K extends keyof PlanInput>(key: K, value: PlanInput[K] | undefined, source: string) => {
    if (value === undefined || value === null || (typeof value === "number" && Number.isNaN(value))) return;
    input[key] = value;
    from[key] = source;
  };
  set("courseCredit", num(course.creditPointsTotal), "profile");
  set("creditPerUnit", num(course.creditPerUnit), "profile");
  const granted = num(course.creditGranted);
  set("creditGranted", granted ?? (record?.creditGranted || undefined), granted !== undefined ? "profile" : "transcript");
  const done = num(course.creditPointsCompleted);
  if (done !== undefined) set("creditDone", done, "profile");
  else if (record) set("creditDone", Math.max(0, record.creditPassed - record.creditGranted), "transcript");
  if (record?.creditEnrolled) set("creditEnrolled", record.creditEnrolled, "transcript");
  set("termsPerYear", num(course.termsPerYear), "profile");
  set("standardUnits", num(course.standardUnitsPerTerm), "profile");
  set("maxOverloadUnits", num(course.maxOverloadUnits), "profile");
  const next = isoDate(course.nextTermStart);
  if (next) set("termStarts", [next], "profile");
  const coeEnd = isoDate(course.coeEnd) ?? latestDocDate(docs, "coe", ["course_end"], /end|finish/i);
  set("coeEnd", coeEnd ?? undefined, isoDate(course.coeEnd) ? "profile" : "CoE document");
  const visa = (profile.currentVisa ?? {}) as Record<string, unknown>;
  const visaExpiry = isoDate(visa.expiry) ?? latestDocDate(docs, "visa_grant", ["visa_expiry"], /expir|stay until|must leave/i);
  set("visaExpiry", visaExpiry ?? undefined, isoDate(visa.expiry) ? "profile" : "visa grant document");
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined || v === null || v === "") continue;
    (input as Record<string, unknown>)[k] = v;
    from[k] = "you";
  }
  return { input, from };
}

/** Loads what the study tools need for the signed-in user (RLS applies). */
export async function loadStudyContext(supabase: SupabaseClient) {
  const [caseRow, docsRes] = await Promise.all([
    supabase.from("cases").select("profile").order("created_at").limit(1).maybeSingle(),
    supabase.from("documents").select("id, filename, created_at, extracted").order("created_at").limit(100),
  ]);
  const profile = (caseRow.data?.profile ?? {}) as Profile;
  const docs = (docsRes.data ?? []) as DocRow[];
  return { profile, docs };
}

export async function academicRecord(supabase: SupabaseClient) {
  const { docs } = await loadStudyContext(supabase);
  const { units, documents } = recordUnits(docs);
  return { summary: units.length ? summariseRecord(units) : null, units, documents };
}

export async function studyPlanFor(supabase: SupabaseClient, today: string, overrides: Record<string, unknown> = {}) {
  const { profile, docs } = await loadStudyContext(supabase);
  const { units } = recordUnits(docs);
  const record = units.length ? summariseRecord(units) : null;
  const { input, from } = buildPlanInput(profile, record, docs, today, overrides);
  const plan: PlanResult = studyPlan(input);
  return { plan, record, input, inputFrom: from, history: coeHistory(docs), sources: [] as unknown[] };
}

export const studyDefs: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "study_plan",
      description:
        "Can they finish their course on time? Runs the academic engine on their current course (profile), transcripts and CoE/visa dates: remaining units, study periods left before the CoE end and visa expiry, and dated scenarios (standard load, summer/winter terms, overload, credit, cross-institutional, combined). Pass any fact the user just told you as an override (e.g. creditPerUnit, standardUnits, maxOverloadUnits from the provider's policy).",
      parameters: {
        type: "object",
        properties: {
          courseCredit: { type: "number", description: "Credit points for the whole course" },
          creditPerUnit: { type: "number" },
          creditDone: { type: "number", description: "Credit points passed (excluding credit granted)" },
          creditGranted: { type: "number" },
          termsPerYear: { type: "number" },
          termStarts: { type: "array", items: { type: "string" }, description: "Upcoming study period start dates" },
          termWeeks: { type: "number" },
          standardUnits: { type: "number" },
          maxOverloadUnits: { type: "number" },
          extraTermsPerYear: { type: "number" },
          extraTermUnits: { type: "number" },
          crossInstUnits: { type: "number" },
          additionalCreditPossible: { type: "number" },
          coeEnd: { type: "string" },
          visaExpiry: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "academic_record",
      description:
        "Their academic record from uploaded transcripts and marksheets: every unit with grade and credit, units passed and failed, credit passed and granted, GPA, WAM and study periods at risk.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "study_history",
      description:
        "Every CoE in their documents (including files that hold several CoEs), oldest first: provider, course, level, dates, CoE status, and what changed from one to the next (provider, course level, course).",
      parameters: { type: "object", properties: {} },
    },
  },
];

export function studyTools(supabase: SupabaseClient, today: () => string) {
  return {
    async study_plan(args: Record<string, unknown>) {
      const r = await studyPlanFor(supabase, today(), args);
      return { plan: r.plan, record: r.record, input: r.input, inputFrom: r.inputFrom };
    },
    async academic_record() {
      const r = await academicRecord(supabase);
      return { summary: r.summary, units: r.units.slice(0, 120), documents: r.documents };
    },
    async study_history() {
      const { docs } = await loadStudyContext(supabase);
      return { coes: coeHistory(docs) };
    },
  };
}
