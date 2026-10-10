// Occupation tools: the official skilled occupation lists (Home Affairs), SkillSelect invitation
// rounds and state nominations, and Jobs and Skills Australia's shortage ratings and labour-market
// data. Read through the database functions search_occupations, get_occupation, latest_rounds and
// rank_occupations (public data, row-level security applies).

import type { ToolCtx, ToolDef } from "./shared.ts";

export const SOURCES = {
  list: {
    title: "Skilled occupation list (Department of Home Affairs)",
    url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list",
  },
  rounds: {
    title: "SkillSelect invitation rounds (Department of Home Affairs)",
    url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds",
  },
  previous: {
    title: "SkillSelect previous rounds (Department of Home Affairs)",
    url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds",
  },
  shortage: {
    title: "Occupation Shortage List (Jobs and Skills Australia)",
    url: "https://www.jobsandskills.gov.au/data/occupation-shortages-analysis/occupation-shortage-list",
  },
  profiles: {
    title: "Occupation profiles data (Jobs and Skills Australia)",
    url: "https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles",
  },
  processing: {
    title: "Global visa processing times (Department of Home Affairs)",
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/global-visa-processing-times",
  },
};

const PATHWAY_DEF: ToolDef = {
  type: "function",
  function: {
    name: "pr_pathway",
    description:
      "Everything the official data says about getting permanent residence through one occupation, in one call: the visas it opens (189, 190, 491, 482, 186, 494) with Home Affairs processing times, the assessing authority (processing time, fee, validity), invitations (latest 189 minimum points, how often invited, by program year, the next round), every state's shortage rating and nominations (and its own occupation lists when available), the outlook (shortage history, jobs, projections) and a timeline (assessment, invitation, visa decision) with day ranges. Pass the user's points (from assess_visas) and state when known. Use it for every PR pathway or 'how long will it take' question, for each candidate occupation.",
    parameters: {
      type: "object",
      properties: {
        anzsco: { type: "string", description: "Six-digit ANZSCO code, or the occupation title" },
        points: { type: "number", description: "The user's points score, if known" },
        state: { type: "string", description: "The state or territory they live in or would move to" },
      },
      required: ["anzsco"],
    },
  },
};

const PROCESSING_DEF: ToolDef = {
  type: "function",
  function: {
    name: "processing_times",
    description:
      "Home Affairs' current processing times for any visa (and citizenship): the time within which 25%, 50%, 75% and 90% of applications were decided, by subclass and stream, with the date updated. Accepts a subclass ('189'), several ('820/801'), 'citizenship', or words ('partner', 'student').",
    parameters: {
      type: "object",
      properties: { visa: { type: "string", description: "Subclass, subclasses or words" } },
      required: ["visa"],
    },
  },
};

const STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

/** "Victoria" or "vic" → "VIC". */
export function stateCode(s: unknown): string | undefined {
  if (typeof s !== "string" || !s.trim()) return undefined;
  const t = s.trim().toLowerCase();
  const names: Record<string, string> = {
    "new south wales": "NSW",
    victoria: "VIC",
    queensland: "QLD",
    "south australia": "SA",
    "western australia": "WA",
    tasmania: "TAS",
    "northern territory": "NT",
    "australian capital territory": "ACT",
    canberra: "ACT",
  };
  return names[t] ?? (STATES.includes(t.toUpperCase()) ? t.toUpperCase() : undefined);
}

/** "subclass 189", "189 visa" → "189". */
export function subclassCode(v: unknown): string | undefined {
  const m = typeof v === "string" || typeof v === "number" ? /\b(\d{3})\b/.exec(String(v)) : null;
  return m?.[1];
}

/** The six-digit ANZSCO code in a string ("ANZSCO 261313", "261313"). */
export function anzscoCode(v: unknown): string | undefined {
  const m = typeof v === "string" || typeof v === "number" ? /\b(\d{6})\b/.exec(String(v)) : null;
  return m?.[1];
}

export const occupationDefs: ToolDef[] = [
  PATHWAY_DEF,
  PROCESSING_DEF,
  {
    type: "function",
    function: {
      name: "search_occupations",
      description:
        "Search the official skilled occupation lists (MLTSSL, STSOL, ROL, CSOL) with each occupation's eligible visas, assessing authority, Jobs and Skills Australia shortage rating, the latest 189 minimum points it was invited at, how many rounds invited it in 12 months, employment and median pay. Use to find an occupation's ANZSCO code, or to list occupations by field, list, visa or shortage.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Occupation words or ANZSCO code, e.g. 'software', 'accountant', '261313'",
          },
          list: { type: "string", enum: ["MLTSSL", "STSOL", "ROL", "CSOL"] },
          visa: {
            type: "string",
            description: "Visa subclass the occupation must be eligible for, e.g. 189, 190, 491, 482",
          },
          authority: {
            type: "string",
            description: "Assessing authority short name, e.g. ACS, Engineers Australia, VETASSESS",
          },
          shortage: { type: "boolean", description: "Only occupations rated in shortage" },
          state: { type: "string", description: "State for the state shortage rating" },
          limit: { type: "number", description: "At most 15" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_occupation",
      description:
        "Everything about one occupation: lists, visas and caveats, assessing authority, shortage rating by state for each year, labour-market profile (employment, pay, growth), every SkillSelect round that invited it with its minimum points, and the next round date. Use before advising on an occupation, its invitation chances or whether it is a good choice now.",
      parameters: {
        type: "object",
        properties: { anzsco: { type: "string", description: "Six-digit ANZSCO code, or the occupation title" } },
        required: ["anzsco"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "latest_rounds",
      description:
        "The latest SkillSelect invitation rounds: date, subclass, total invited, number of occupations and lowest minimum points, the next round date, monthly totals for the program year, and state and territory nominations by subclass.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Rounds to return, at most 24" } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rank_occupations",
      description:
        "Where are invitations easiest? Ranks occupations invited in the last 12 months by the lowest recent minimum points, then by how often they were invited, with shortage rating and lists. Filters: the user's points (maxPoints), a visa, a field keyword, a state. Use for 'which occupation gets invited with fewer points', 'is IT good now', or to compare a field's occupations.",
      parameters: {
        type: "object",
        properties: {
          maxPoints: { type: "number", description: "Only occupations whose latest minimum is at most this" },
          visa: { type: "string", description: "Visa subclass, e.g. 189 or 491" },
          field: { type: "string", description: "Words in the occupation title, e.g. 'engineer', 'ICT', 'nurse'" },
          state: { type: "string" },
          limit: { type: "number", description: "At most 25" },
        },
      },
    },
  },
];

type Row = Record<string, unknown>;
const s = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined);
const clampLimit = (v: unknown, def: number, max: number) => Math.max(1, Math.min(max, Math.round(Number(v) || def)));

export function occupationTools(ctx: ToolCtx) {
  const { supabase, cite } = ctx;

  async function search(args: Row) {
    const anzsco = anzscoCode(args.query);
    const params: Row = {
      p_query: anzsco ?? s(args.query) ?? null,
      p_list: s(args.list)?.toUpperCase() ?? null,
      p_visa: subclassCode(args.visa) ?? null,
      p_authority: s(args.authority) ?? null,
      p_shortage: args.shortage === true ? "Shortage" : null,
      p_state: stateCode(args.state) ?? null,
      p_limit: clampLimit(args.limit, 10, 15),
    };
    const { data, error } = await supabase.rpc("search_occupations", params);
    if (error) return { error: error.message };
    const rows = (data ?? []) as Row[];
    const n = cite(SOURCES.list);
    const m = rows.some((r) => r.shortage_national) ? cite(SOURCES.shortage) : undefined;
    return {
      total: rows[0]?.total_count ?? rows.length,
      occupations: rows.map((r) => ({
        anzsco: r.anzsco,
        title: r.title,
        lists: r.lists,
        visas: r.visas,
        authorities: r.authorities,
        shortageNational: r.shortage_national ?? null,
        shortageState: r.shortage_state ?? undefined,
        latestMinPoints189: r.last_min_points_189 ?? null,
        lastInvited: r.last_invited_round ?? null,
        roundsInvited12m: r.rounds_invited_12m ?? 0,
        employed: r.employed ?? undefined,
        medianWeeklyEarnings: r.median_weekly_earnings ?? undefined,
      })),
      sources: m ? [n, m] : [n],
    };
  }

  async function resolve(input: string): Promise<{ anzsco?: string; candidates?: string[]; error?: string }> {
    const code = anzscoCode(input);
    if (code) return { anzsco: code };
    const { data, error } = await supabase.rpc("search_occupations", { p_query: input, p_limit: 6 });
    if (error) return { error: error.message };
    const rows = (data ?? []) as Row[];
    if (!rows.length) return { error: `No listed occupation matches "${input}"` };
    const want = input.trim().toLowerCase();
    const exact = rows.find((r) => String(r.title).toLowerCase() === want);
    const best = exact ?? rows[0];
    return {
      anzsco: String(best.anzsco),
      candidates: rows.filter((r) => r !== best).map((r) => `${r.title} (${r.anzsco})`),
    };
  }

  async function detail(args: Row) {
    const input = s(args.anzsco ?? args.code ?? args.title);
    if (!input) return { error: "anzsco required" };
    const r = await resolve(input);
    if (!r.anzsco) return { error: r.error };
    const { data, error } = await supabase.rpc("get_occupation", { p_anzsco: r.anzsco });
    if (error) return { error: error.message };
    if (!data || (typeof data === "object" && !Object.keys(data as Row).length)) {
      return { error: `ANZSCO ${r.anzsco} is not on the skilled occupation lists` };
    }
    const d = data as Row;
    const rounds = Array.isArray(d.rounds) ? d.rounds as Row[] : [];
    const cites = [cite(SOURCES.list)];
    if (rounds.length) cites.push(cite(SOURCES.previous));
    if (Array.isArray(d.shortage) && d.shortage.length) cites.push(cite(SOURCES.shortage));
    if (d.profile && Object.keys(d.profile as Row).length) cites.push(cite(SOURCES.profiles));
    return {
      ...d,
      // Older rounds matter less for today's chances; keep the newest 24.
      rounds: rounds.slice(0, 24),
      roundsTotal: rounds.length,
      otherMatches: r.candidates?.length ? r.candidates : undefined,
      sources: cites,
    };
  }

  async function rounds(args: Row) {
    const { data, error } = await supabase.rpc("latest_rounds", { p_limit: clampLimit(args.limit, 8, 24) });
    if (error) return { error: error.message };
    return { ...(data as Row ?? {}), sources: [cite(SOURCES.rounds), cite(SOURCES.previous)] };
  }

  async function rank(args: Row) {
    const pts = Number(args.maxPoints);
    const { data, error } = await supabase.rpc("rank_occupations", {
      p_max_points: Number.isFinite(pts) && pts > 0 ? Math.round(pts) : null,
      p_visa: subclassCode(args.visa) ?? null,
      p_field: s(args.field, 80) ?? null,
      p_state: stateCode(args.state) ?? null,
      p_limit: clampLimit(args.limit, 12, 25),
    });
    if (error) return { error: error.message };
    const rows = (data ?? []) as Row[];
    return {
      occupations: rows,
      note: rows.length
        ? "Ranked by the official round results: lowest recent minimum points first. Past rounds don't guarantee future ones; check state nomination too."
        : "No occupation invited in the last 12 months matches. Try higher points, another field, or state nomination (190, 491).",
      sources: [cite(SOURCES.previous), cite(SOURCES.shortage)],
    };
  }

  async function pathway(args: Row) {
    const input = s(args.anzsco ?? args.occupation ?? args.code ?? args.title);
    if (!input) return { error: "anzsco required" };
    const r = await resolve(input);
    if (!r.anzsco) return { error: r.error };
    const pts = Number(args.points);
    const { data, error } = await supabase.rpc("pr_pathway", {
      p_anzsco: r.anzsco,
      p_points: Number.isFinite(pts) && pts > 0 ? Math.round(pts) : null,
      p_state: stateCode(args.state) ?? null,
    });
    if (error) return { error: error.message };
    if (!data) return { error: `ANZSCO ${r.anzsco} is not on the skilled occupation lists` };
    const d = data as Row;
    const sources = [cite(SOURCES.list), cite(SOURCES.previous), cite(SOURCES.processing), cite(SOURCES.shortage)];
    return {
      ...d,
      otherMatches: r.candidates?.length ? r.candidates : undefined,
      sources,
      note:
        "Durations are ranges from published data (processing times are the 50% and 90% marks). Steps without a published figure have no days: say so rather than guessing.",
    };
  }

  async function processing(args: Row) {
    const visa = s(args.visa ?? args.subclass, 60);
    const { data, error } = await supabase.rpc("processing_times", { p_subclass: visa ?? null });
    if (error) return { error: error.message };
    const rows = ((data ?? []) as Row[]).slice(0, 20).map((r) => ({
      subclass: r.subclass,
      stream: r.stream || undefined,
      visa: r.visa_name,
      p25: r.p25,
      p50: r.p50,
      p75: r.p75,
      p90: r.p90,
      updated: r.updated,
      note: r.note || undefined,
    }));
    return { times: rows, sources: [cite(SOURCES.processing)] };
  }

  return {
    pr_pathway: (a: Row) => pathway(a),
    processing_times: (a: Row) => processing(a),
    search_occupations: (a: Row) => search(a),
    get_occupation: (a: Row) => detail(a),
    latest_rounds: (a: Row) => rounds(a),
    rank_occupations: (a: Row) => rank(a),
  };
}
