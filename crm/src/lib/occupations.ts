import "server-only";

// Occupation and SkillSelect data comes from the Immi Insight database (Supabase), which imports
// the occupation lists, the Jobs and Skills Australia shortage list, invitation rounds and the
// monthly SkillSelect EOI dashboard. These tables are public-read; the publishable key below is
// the same one shipped in the Immi Insight web app.
const URL = process.env.INSIGHT_SUPABASE_URL ?? "https://rzwntsessjeofmhwudhe.supabase.co";
const KEY = process.env.INSIGHT_SUPABASE_KEY ?? "sb_publishable_hkd8Y3eV1g4Rg6c7WHwx9w_Q6MVBH7m";

// Reference data that changes monthly: keep GET results for an hour in this server instance.
// Only settled values are kept (a pending request can't be shared across requests on Workers).
const memo = new Map<string, { at: number; value: unknown }>();
const HOUR = 60 * 60 * 1000;

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  if (init?.method && init.method !== "GET") return fetchRest<T>(path, init);
  const hit = memo.get(path);
  if (hit && Date.now() - hit.at < HOUR) return hit.value as T;
  const value = await fetchRest<T>(path, init);
  memo.set(path, { at: Date.now(), value });
  return value;
}

async function fetchRest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${URL}/rest/v1/${path}`, { ...init, headers: { apikey: KEY, "Content-Type": "application/json", ...init?.headers } });
  if (!res.ok) throw new Error(`Occupation data: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

export type OccupationSummary = { anzsco: string; title: string; lists: string[] | null; visa_subclasses: string[] | null; authorities: string[] | null };

export async function listOccupations(): Promise<OccupationSummary[]> {
  return rest<OccupationSummary[]>("occupations?select=anzsco,title,lists,visa_subclasses,authorities&listed=eq.true&order=anzsco");
}

type Caveat = { visa: string; title: string; text: string };
type AuthorityRef = { name: string; short: string; url: string | null; details?: string | null };
export type Occupation = OccupationSummary & {
  code_2022: string | null;
  visas: string[] | null;
  caveats: Caveat[] | null;
  assessing_authorities: AuthorityRef[] | null;
  anzsco_links: { url: string; label: string }[] | null;
};
export type Shortage = { year: number; national: string | null; nsw: string | null; vic: string | null; qld: string | null; sa: string | null; wa: string | null; tas: string | null; nt: string | null; act: string | null; data: { skill_level?: number } | null };
export type Profile = { employed: number | null; median_weekly_earnings: number | null; part_time_share: number | null; female_share: number | null; median_age: number | null; growth_5yr: number | null; projected_growth: number | null };
export type Projection = { horizon: string | null; base_period: string | null; projected_period: string | null; base_employment: number | null; projected_employment: number | null; growth: number | null; growth_pct: number | null };
export type RoundRow = { round_date: string; subclass: string; min_points: number | null; invited: number | null };
export type Authority = { short: string; name: string; aliases: string[] | null; url: string | null; fee_text: string | null; processing_text: string | null; validity_text: string | null; requirements: string | null };
export type Nomination = { program_year: string; as_of: string; subclass: string; state: string; nominations: string };
export type EoiValue = number | string;
export type EoiSubclass = {
  subclass: string;
  visa_type: string;
  by_status: Record<string, EoiValue>;
  by_points: ({ points: string } & Record<string, EoiValue>)[];
  by_month: ({ month: string; as_at: string } & Record<string, EoiValue>)[];
};
export type Eoi = { as_at: string; data_current_to: string; notes: string[]; source_url: string; subclasses: EoiSubclass[] };

export async function getOccupation(code: string) {
  const c = (code.match(/\d{6}/) ?? [""])[0];
  if (!c) return null;
  const [occ] = await rest<Occupation[]>(`occupations?anzsco=eq.${c}&select=anzsco,title,lists,visa_subclasses,authorities,code_2022,visas,caveats,assessing_authorities,anzsco_links`);
  if (!occ) return null;
  const [shortage, profile, projections, rounds, eoi, authorities, nominations] = await Promise.all([
    rest<Shortage[]>(`occupation_shortage?anzsco=eq.${c}&order=year.desc&limit=1&select=year,national,nsw,vic,qld,sa,wa,tas,nt,act,data`),
    rest<Profile[]>(`occupation_profiles?anzsco=eq.${c}&select=employed,median_weekly_earnings,part_time_share,female_share,median_age,growth_5yr,projected_growth`),
    rest<Projection[]>(`occupation_projections?anzsco=eq.${c}&select=horizon,base_period,projected_period,base_employment,projected_employment,growth,growth_pct`),
    rest<RoundRow[]>(`skillselect_round_occupations?anzsco=eq.${c}&order=round_date.desc&select=round_date,subclass,min_points,invited`),
    rest<Eoi>("rpc/occupation_eoi", { method: "POST", body: JSON.stringify({ p_anzsco: c }) }),
    rest<Authority[]>("assessing_authorities?select=short,name,aliases,url,fee_text,processing_text,validity_text,requirements"),
    rest<Nomination[]>("state_nominations?select=program_year,as_of,subclass,state,nominations&order=program_year.desc,subclass,state"),
  ]);
  const names = (occ.authorities ?? []).map((a) => a.toLowerCase());
  const authority =
    authorities.find((a) => [a.short, a.name, ...(a.aliases ?? [])].some((n) => names.some((x) => x === n.toLowerCase() || x.startsWith(n.toLowerCase())))) ?? null;
  const year = nominations[0]?.program_year;
  return {
    occupation: occ,
    shortage: shortage[0] ?? null,
    profile: profile[0] ?? null,
    projection: projections[0] ?? null,
    rounds,
    eoi,
    authority,
    nominations: nominations.filter((n) => n.program_year === year),
  };
}

export type OccupationDetail = NonNullable<Awaited<ReturnType<typeof getOccupation>>>;

export type Processing = { subclass: string; stream: string; p25: string | null; p50: string | null; p75: string | null; p90: string | null; p50_days: number | null; p90_days: number | null; updated: string | null };

/** Home Affairs global processing times for a visa (e.g. "820/801" → both subclasses). */
export async function visaProcessing(code: string): Promise<Processing[]> {
  const subs = code.split("/").filter((c) => /^\d{3}$/.test(c));
  if (!subs.length) return [];
  return rest<Processing[]>(`visa_processing_times?subclass=in.(${subs.join(",")})&select=subclass,stream,p25,p50,p75,p90,p50_days,p90_days,updated&order=subclass,stream`);
}

export type Course = { code: string; name: string; provider_code: string; provider_names: string | null; level: string | null; duration_weeks: string | null; annual_tuition: string | null; total_cost: string | null };

/** CRICOS course search (Immi Insight's daily CRICOS import). */
export async function searchCourses(q: string, level?: string) {
  const term = q.trim().replace(/[^\w\s-]/g, " ").split(/\s+/).filter(Boolean).join(" & ");
  if (!term) return [] as Course[];
  const params = new URLSearchParams({ select: "code,name,provider_code,provider_names,level,duration_weeks,annual_tuition,total_cost", expired: "eq.false", limit: "40", order: "annual_tuition.asc.nullslast" });
  params.set("search", `fts(english).${term}`);
  if (level) params.set("level", `eq.${level}`);
  return rest<Course[]>(`edu_courses?${params}`);
}
