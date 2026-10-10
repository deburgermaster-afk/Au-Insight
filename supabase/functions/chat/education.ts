// Course and provider tools: the CRICOS register (every course offered to international students,
// with fees, duration, level and campuses), providers' crawled policy pages, and the AQF credit
// guideline. Read-only; every fact the model gets carries the number of its source.

import { aqfCreditGuide } from "../_shared/academic/index.ts";
import type { ToolCtx, ToolDef } from "./shared.ts";

/** The register these rows come from (data.gov.au publishes it as open data). */
export const CRICOS_URL = "https://cricos.education.gov.au/";
const CRICOS_TITLE = "CRICOS: Commonwealth Register of Institutions and Courses for Overseas Students";
/** Course cards shown under one answer, at most. */
export const COURSE_CARDS = 6;

/** A row of the search_courses database function (snake_case, as the app reads it). */
export type CourseRow = {
  course_code: string;
  course_name: string;
  provider_code: string;
  provider_name: string;
  provider_type?: string;
  website?: string;
  level?: string;
  field_broad?: string;
  field_narrow?: string;
  field_detailed?: string;
  duration_weeks?: number | null;
  tuition_fee?: number | null;
  non_tuition_fee?: number | null;
  total_cost?: number | null;
  annual_tuition?: number | null;
  work_component?: boolean;
  dual_qualification?: boolean;
  foundation?: boolean;
  vet_code?: string | null;
  expired?: boolean;
  campuses?: { name?: string; city?: string; state?: string }[];
  total_count?: number;
};

/** CRICOS level names, and what people call them. Unknown names pass through unchanged. */
const LEVEL_ALIASES: [RegExp, string[]][] = [
  [/^(phd|doctor(al|ate)?( degree)?|doctor of philosophy|professional doctorate)$/i, ["Doctoral Degree"]],
  [/^(mphil|master of philosophy|masters? by research|research masters?|masters? \(research\)|masters degree \(research\))$/i, [
    "Masters Degree (Research)",
  ]],
  [/^(research|research degrees?|hdr|higher degree by research)$/i, ["Masters Degree (Research)", "Doctoral Degree"]],
  [/^(masters? by coursework|coursework masters?|masters? \(coursework\)|masters degree \(coursework\))$/i, [
    "Masters Degree (Coursework)",
  ]],
  [/^(masters?|masters? degrees?|postgraduate)$/i, [
    "Masters Degree (Coursework)",
    "Masters Degree (Research)",
    "Masters Degree (Extended)",
  ]],
  [/^(extended masters?|masters degree \(extended\))$/i, ["Masters Degree (Extended)"]],
  [/^(honours|bachelor honours( degree)?|bachelor \(honours\))$/i, ["Bachelor Honours Degree"]],
  [/^(bachelor|bachelors?( degree)?|undergraduate|degree)$/i, ["Bachelor Degree"]],
  [/^(grad(uate)? dip(loma)?)$/i, ["Graduate Diploma"]],
  [/^(grad(uate)? cert(ificate)?)$/i, ["Graduate Certificate"]],
  [/^(associate degree)$/i, ["Associate Degree"]],
  [/^(adv(anced)? dip(loma)?)$/i, ["Advanced Diploma"]],
  [/^(dip(loma)?)$/i, ["Diploma"]],
  [/^(cert(ificate)? ?(iv|4))$/i, ["Certificate IV"]],
  [/^(cert(ificate)? ?(iii|3))$/i, ["Certificate III"]],
  [/^(cert(ificate)? ?(ii|2))$/i, ["Certificate II"]],
  [/^(cert(ificate)? ?(i|1))$/i, ["Certificate I"]],
  [/^(vet|vocational)$/i, ["Certificate III", "Certificate IV", "Diploma", "Advanced Diploma"]],
  [/^(elicos|english( course)?|non aqf( award)?)$/i, ["Non AQF Award"]],
  [/^(school|year 12|senior secondary)$/i, ["Senior Secondary Certificate of Education"]],
];

/** Maps level words ("PhD", "masters by research", "bachelor") to CRICOS level names. */
export function normaliseLevels(levels: unknown): string[] | undefined {
  if (!Array.isArray(levels)) return typeof levels === "string" && levels ? normaliseLevels([levels]) : undefined;
  const out = new Set<string>();
  for (const raw of levels) {
    const l = String(raw ?? "").trim();
    if (!l) continue;
    const hit = LEVEL_ALIASES.find(([re]) => re.test(l));
    for (const name of hit ? hit[1] : [l]) out.add(name);
  }
  return out.size ? [...out] : undefined;
}

const STATES: Record<string, string> = {
  "victoria": "VIC",
  "new south wales": "NSW",
  "queensland": "QLD",
  "western australia": "WA",
  "south australia": "SA",
  "tasmania": "TAS",
  "australian capital territory": "ACT",
  "northern territory": "NT",
};

export function normaliseState(s: unknown): string | undefined {
  const v = String(s ?? "").trim();
  if (!v) return undefined;
  return STATES[v.toLowerCase()] ?? v.toUpperCase();
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The few fields the model needs from a course row. */
export function compactCourse(r: CourseRow) {
  const weeks = r.duration_weeks ?? null;
  return {
    code: r.course_code,
    name: r.course_name,
    provider: r.provider_name,
    providerCode: r.provider_code,
    level: r.level,
    field: r.field_detailed || r.field_narrow || r.field_broad || undefined,
    durationWeeks: weeks,
    years: weeks ? round1(weeks / 52) : null,
    tuitionTotal: r.tuition_fee ?? null,
    tuitionPerYearEstimate: r.annual_tuition ?? null,
    nonTuitionFee: r.non_tuition_fee || undefined,
    totalCost: r.total_cost ?? null,
    campuses: (r.campuses ?? []).slice(0, 4).map((c) => [c.name, c.city, c.state].filter(Boolean).join(", ")),
    moreCampuses: (r.campuses?.length ?? 0) > 4 ? (r.campuses!.length - 4) : undefined,
    website: r.website || undefined,
    workComponent: r.work_component || undefined,
    expired: r.expired || undefined,
  };
}

const PROVIDER_CODE = /\b(\d{5}[A-Z])\b/i;
const COURSE_CODE = /\b(\d{6}[A-Z])\b/i;

export const educationDefs: ToolDef[] = [
  {
    type: "function",
    function: {
      name: "search_courses",
      description:
        "Search the CRICOS register: every course Australian providers may offer to international students, with tuition fees, duration, level, field and campuses. Use for 'which universities offer…', research degrees (researchOnly), cheapest or shortest options, or a provider's courses. Research degrees are usually named just 'Doctor of Philosophy' or 'Master of Philosophy': find them with researchOnly plus field (the broad field, e.g. 'Information Technology', 'Engineering', 'Health'), not with subject words in query. Fees are the register's whole-course figures; tuitionPerYearEstimate is tuition ÷ duration × 52 weeks.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Course name or subject words, e.g. 'data science', 'nursing'" },
          levels: {
            type: "array",
            items: { type: "string" },
            description:
              "CRICOS levels, e.g. 'Bachelor Degree', 'Bachelor Honours Degree', 'Masters Degree (Coursework)', 'Masters Degree (Research)', 'Doctoral Degree', 'Graduate Diploma', 'Diploma'. Words like 'PhD' or 'masters by research' work too.",
          },
          state: { type: "string", description: "State or territory, e.g. VIC" },
          city: { type: "string", description: "City or campus town" },
          provider: { type: "string", description: "Provider name or CRICOS provider code" },
          field: { type: "string", description: "Field of education, e.g. 'Information Technology'" },
          maxAnnualFee: { type: "number", description: "Highest tuition per year (AUD)" },
          researchOnly: { type: "boolean", description: "Only research degrees (masters by research and doctorates)" },
          sort: { type: "string", enum: ["relevance", "fee_asc", "fee_desc", "duration_asc", "name"] },
          limit: { type: "number", description: "At most 10" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_course",
      description:
        "One CRICOS course in full: fees (tuition, non-tuition, total, per-year estimate), duration, level, fields, work placement, campuses, the provider and its website, and the register date.",
      parameters: {
        type: "object",
        properties: { code: { type: "string", description: "CRICOS course code, e.g. 078241E" } },
        required: ["code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_provider",
      description:
        "A CRICOS provider (university, college or school): type, website, campuses, how many courses at each level. Give its CRICOS code or its name.",
      parameters: {
        type: "object",
        properties: { provider: { type: "string", description: "CRICOS provider code (e.g. 00116K) or name" } },
        required: ["provider"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_courses",
      description:
        "Compare up to four CRICOS courses side by side: fees, per-year estimate, duration, level, campuses, work placement.",
      parameters: {
        type: "object",
        properties: { codes: { type: "array", items: { type: "string" }, description: "CRICOS course codes" } },
        required: ["codes"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_university_policies",
      description:
        "Search providers' own policy pages, already collected: study load and overload, cross-institutional study, credit and recognition of prior learning, research degree (HDR) entry, fees, scholarships, course transfers and release letters. Returns numbered sources to cite as [n].",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Focused terms, e.g. 'overload approval maximum credit points'" },
          providerCodes: {
            type: "array",
            items: { type: "string" },
            description: "CRICOS provider codes (or names) to limit the search to",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "credit_guide",
      description:
        "The AQF Qualifications Pathways Policy guideline for credit from one qualification level towards another (e.g. Diploma into a Bachelor Degree). A guideline only: the provider's own credit policy decides.",
      parameters: {
        type: "object",
        properties: {
          from: { type: "string", description: "Completed qualification level, e.g. 'Diploma'" },
          to: { type: "string", description: "Destination level, e.g. 'Bachelor Degree'" },
          toDurationYears: { type: "number", description: "Length of the destination course in years" },
          related: { type: "boolean", description: "Whether the fields of study are related (default true)" },
        },
        required: ["from", "to"],
      },
    },
  },
];

/** Course, provider and policy tools. `courses` events show the top results as cards in the app. */
export function educationTools(ctx: ToolCtx) {
  const { supabase, emit, cite } = ctx;
  const searches = new Map<string, unknown>();
  let asAt: Promise<string | null> | undefined;

  /** The date of the register snapshot (from the last finished import), looked up once. */
  const registerDate = () =>
    asAt ??= (async () => {
      try {
        const { data } = await supabase.from("edu_import_runs").select("source_as_at")
          .not("finished_at", "is", null).order("finished_at", { ascending: false }).limit(1).maybeSingle();
        return (data?.source_as_at as string | null) ?? null;
      } catch {
        return null;
      }
    })();

  const citeRegister = async (date?: string | null) => {
    const d = date ?? await registerDate();
    return cite({ title: CRICOS_TITLE, section: d ? `Register data as at ${d}` : "Register data", url: CRICOS_URL });
  };

  async function searchRows(args: Record<string, unknown>): Promise<{ rows: CourseRow[]; error?: string }> {
    const params: Record<string, unknown> = {};
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : undefined);
    if (s(args.query)) params.p_query = s(args.query);
    const levels = normaliseLevels(args.levels);
    if (levels) params.p_levels = levels;
    if (s(args.state)) params.p_state = normaliseState(args.state);
    if (s(args.city)) params.p_city = s(args.city);
    if (s(args.provider)) params.p_provider = s(args.provider);
    if (s(args.field)) params.p_field = s(args.field);
    const fee = Number(args.maxAnnualFee);
    if (Number.isFinite(fee) && fee > 0) params.p_max_annual_fee = fee;
    if (args.researchOnly === true) params.p_research_only = true;
    if (["relevance", "fee_asc", "fee_desc", "duration_asc", "name"].includes(String(args.sort))) {
      params.p_sort = args.sort;
    }
    params.p_limit = Math.max(1, Math.min(10, Math.round(Number(args.limit) || 8)));
    const { data, error } = await supabase.rpc("search_courses", params);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as CourseRow[] };
  }

  /** A provider code from a code or a name (the provider whose name matches best). */
  async function resolveProvider(provider: string): Promise<{ code?: string; candidates?: string[]; error?: string }> {
    const code = PROVIDER_CODE.exec(provider)?.[1];
    if (code) return { code: code.toUpperCase() };
    const { rows, error } = await searchRows({ provider, limit: 10, sort: "name" });
    if (error) return { error };
    const byCode = new Map<string, string>();
    for (const r of rows) byCode.set(r.provider_code, r.provider_name);
    if (!byCode.size) return { error: `No CRICOS provider matches "${provider}"` };
    const want = provider.toLowerCase();
    const ranked = [...byCode].sort(([, a], [, b]) => nameScore(b, want) - nameScore(a, want));
    return { code: ranked[0][0], candidates: ranked.slice(1, 5).map(([c, n]) => `${n} (${c})`) };
  }

  return {
    resolveProvider,

    async search_courses(args: Record<string, unknown>) {
      const key = JSON.stringify(args);
      const earlier = searches.get(key);
      if (earlier) return { note: "Same search as before: these are the same results, use them.", ...earlier };
      const { rows, error } = await searchRows(args);
      if (error) return { error, results: [] };
      const n = await citeRegister();
      if (rows.length) emit({ type: "courses", items: rows.slice(0, COURSE_CARDS) });
      const result = {
        source: n,
        total: rows[0]?.total_count ?? rows.length,
        shown: rows.length,
        results: rows.map(compactCourse),
        note: rows.length
          ? "From the CRICOS register; cite it as [" + n + "]. The app shows the first cards under your answer."
          : "No courses matched. Try fewer filters, broader words, or another level name.",
      };
      searches.set(key, result);
      return result;
    },

    async get_course(args: Record<string, unknown>) {
      const code = COURSE_CODE.exec(String(args.code ?? ""))?.[1]?.toUpperCase();
      if (!code) return { error: "Give a CRICOS course code (six digits and a letter, e.g. 078241E)." };
      const { data, error } = await supabase.rpc("get_course", { p_code: code });
      if (error) return { error: error.message };
      if (!data) return { error: `No CRICOS course ${code}` };
      const c = data as CourseRow & Record<string, unknown>;
      const n = await citeRegister((c.as_at as string | undefined) ?? null);
      emit({ type: "courses", items: [c] });
      return { source: n, ...compactCourse(c), details: stripNulls(c) };
    },

    async get_provider(args: Record<string, unknown>) {
      const ask = String(args.provider ?? args.code ?? args.name ?? "").trim();
      if (!ask) return { error: "Give a provider name or CRICOS provider code." };
      const resolved = await resolveProvider(ask);
      if (!resolved.code) return { error: resolved.error };
      const { data, error } = await supabase.rpc("get_provider", { p_code: resolved.code });
      if (error) return { error: error.message };
      if (!data) return { error: `No CRICOS provider ${resolved.code}` };
      const p = data as Record<string, unknown>;
      const n = await citeRegister((p.as_at as string | undefined) ?? null);
      const locations = Array.isArray(p.locations) ? p.locations as Record<string, unknown>[] : [];
      return {
        source: n,
        ...stripNulls({ ...p, locations: undefined }),
        locations: locations.slice(0, 20).map((l) => [l.name, l.city, l.state].filter(Boolean).join(", ")),
        moreLocations: locations.length > 20 ? locations.length - 20 : undefined,
        otherMatches: resolved.candidates?.length ? resolved.candidates : undefined,
      };
    },

    async compare_courses(args: Record<string, unknown>) {
      const codes = [
        ...new Set(
          (Array.isArray(args.codes) ? args.codes : [])
            .map((c) => COURSE_CODE.exec(String(c))?.[1]?.toUpperCase())
            .filter((c): c is string => Boolean(c)),
        ),
      ].slice(0, 4);
      if (codes.length < 2) return { error: "Give two to four CRICOS course codes." };
      const got = await Promise.all(codes.map((code) => supabase.rpc("get_course", { p_code: code })));
      const rows = got.map((g) => g.data as (CourseRow & { as_at?: string }) | null).filter((r): r is CourseRow => !!r);
      if (!rows.length) return { error: "None of those codes is in the register." };
      const n = await citeRegister((rows[0] as { as_at?: string }).as_at ?? null);
      emit({ type: "courses", items: rows });
      const courses = rows.map(compactCourse);
      const best = (pick: (c: ReturnType<typeof compactCourse>) => number | null | undefined) =>
        courses.filter((c) => pick(c) != null).sort((a, b) => pick(a)! - pick(b)!)[0]?.code;
      return {
        source: n,
        courses,
        lowestTuitionPerYear: best((c) => c.tuitionPerYearEstimate),
        lowestTotalCost: best((c) => c.totalCost ?? c.tuitionTotal),
        shortest: best((c) => c.durationWeeks),
        notFound: codes.filter((c) => !rows.some((r) => r.course_code === c)),
      };
    },

    async search_university_policies(args: Record<string, unknown>) {
      const query = String(args.query ?? "").slice(0, 300).trim();
      if (!query) return { error: "Give search terms.", results: [] };
      const asked = Array.isArray(args.providerCodes) ? args.providerCodes.map((c) => String(c)).slice(0, 6) : [];
      const codes = (await Promise.all(asked.map(async (p) => (await resolveProvider(p)).code))).filter(
        (c): c is string => Boolean(c),
      );
      const key = `${query.toLowerCase()}|${codes.join(",")}`;
      const earlier = searches.get(key);
      if (earlier) return { note: "Same search as before: these are the same results, use them.", ...earlier };
      const { data, error } = await supabase.rpc("search_university_policies", {
        p_query: query,
        p_provider_codes: codes.length ? codes : null,
        p_limit: 6,
      });
      if (error) return { error: error.message, results: [] };
      const results = ((data ?? []) as {
        title: string;
        heading_path: string[] | null;
        url: string;
        content: string;
        version_fetched_at: string;
        provider_code: string | null;
      }[]).map((r) => {
        const section = (r.heading_path ?? []).slice(1).join(" › ");
        return {
          n: cite({ title: r.title, section, url: r.url }),
          providerCode: r.provider_code,
          title: r.title,
          section,
          url: r.url,
          retrieved: r.version_fetched_at,
          text: String(r.content ?? "").slice(0, 2000),
        };
      });
      const result = {
        results,
        note: results.length
          ? undefined
          : "No collected policy pages matched. Try search_official_site on the provider's own website.",
      };
      searches.set(key, result);
      return result;
    },

    credit_guide(args: Record<string, unknown>) {
      const from = String(args.from ?? "").trim();
      const to = String(args.to ?? "").trim();
      if (!from || !to) return Promise.resolve({ error: "Give both levels (from and to)." });
      try {
        const years = Number(args.toDurationYears);
        const guide = aqfCreditGuide(
          normaliseLevels([from])?.[0] ?? from,
          normaliseLevels([to])?.[0] ?? to,
          Number.isFinite(years) && years > 0 ? years : undefined,
          args.related !== false,
        );
        const n = cite({ title: guide.source.title, section: "Credit guidelines", url: guide.source.url });
        return Promise.resolve({
          ...guide,
          source: n,
          note: "A national guideline only. The provider's own credit policy and assessment decide what is granted.",
        });
      } catch (e) {
        return Promise.resolve({ error: e instanceof Error ? e.message : String(e) });
      }
    },
  };
}

/** How well a provider name matches what was asked: exact, prefix, all words, then shorter names. */
function nameScore(name: string, want: string) {
  const n = name.toLowerCase();
  if (n === want) return 100;
  let s = 0;
  if (n.startsWith(want)) s += 40;
  if (n.includes(want)) s += 20;
  const words = want.split(/\W+/).filter((w) => w.length > 2);
  s += words.filter((w) => n.includes(w)).length * 5;
  return s - n.length / 100;
}

function stripNulls(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === "") continue;
    out[k] = v;
  }
  return out;
}
