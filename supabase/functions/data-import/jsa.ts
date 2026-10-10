// Jobs and Skills Australia importer used by the data-import function (index.ts): downloads the
// spreadsheets, parses them and writes occupation_shortage and occupation_profiles.
//
// Sources:
// - 2025 Occupation Shortage List, six-digit ANZSCO 2022: national and state/territory ratings.
// - ANZSCO occupation data, February 2026 (ANZSCO 2013 codes): employment, earnings, workforce shape,
//   descriptions, tasks, industries, states, age and education, for occupations and unit groups.
// - OSCA occupation data (2021 Census): registration or licensing, what the job involves and other titles,
//   attached to the ANZSCO profile with the same occupation name.
// Rows are written through worker_occupations_upsert / worker_occupations_finish (source "jsa").

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import * as XLSX from "npm:xlsx@0.18.5";

const JSA = "https://www.jobsandskills.gov.au/sites/default/files";
export const FILES = {
  osl: `${JSA}/2025-10/2025%20Occupation%20Shortage%20List%20-%206%20digit%20ANZSCO%20and%20OSCA.xlsx`,
  profiles: `${JSA}/2026-07/ANZSCO%20Occupation%20data%20-%20February%202026.xlsx`,
  osca: `${JSA}/2026-07/osca_occupation_data_-_2021_census.xlsx`,
};
const BATCH = 250;
const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

type Cell = string | number | boolean | null;
type Row = Record<string, unknown>;

/** Plain heading text: "NSW\r\n(%)" -> "NSW (%)". */
export const clean = (v: Cell): string => String(v ?? "").replace(/\s+/g, " ").trim();

/** snake_case key for a spreadsheet heading: "Part-time share (%)" -> "part_time_share_pct". */
export function keyOf(heading: Cell): string {
  return clean(heading).toLowerCase().replace(/\(%\)/g, " pct").replace(/\(\$\)/g, "").replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

/** A number, or null for "N/A", "<50", blanks and text. */
export function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = clean(v).replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

const code = (v: Cell): string => clean(v).replace(/\.0$/, "");

function sheetRows(wb: XLSX.WorkBook, name: string): Cell[][] {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet ${name} missing`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: null }) as Cell[][];
}

/** Index of the heading row (the first whose first cell starts with `first`) and its keys. */
function headed(rows: Cell[][], first: RegExp): { at: number; head: Cell[] } {
  const at = rows.findIndex((r) => first.test(clean(r[0])) || first.test(clean(r[1])));
  if (at < 0) throw new Error(`no heading row matching ${first}`);
  return { at, head: rows[at] };
}

// ───────────────────────────── Occupation Shortage List ─────────────────────────────

/** Ratings legend from the heading cell ("NS - No Shortage\r\nS - Shortage ..."), so codes are written out
 * exactly as JSA names them. */
export function legend(cell: Cell): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of String(cell ?? "").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z]{1,3})\s*[-–]\s*(.+?)\s*$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

export function parseOsl(wb: XLSX.WorkBook, sourceUrl: string): Row[] {
  const name = wb.SheetNames.find((n) => /OSL/i.test(n) && /ANZSCO/i.test(n));
  if (!name) throw new Error(`no ANZSCO sheet in the OSL workbook (${wb.SheetNames.join(", ")})`);
  const rows = sheetRows(wb, name);
  const title = rows.map((r) => clean(r[0])).find((t) => /occupation(al)? shortage list/i.test(t)) ?? name;
  const year = Number((title.match(/\b(20\d\d)\b/) ?? name.match(/\b(20\d\d)\b/) ?? [])[1]);
  if (!year) throw new Error(`no year in "${title}"`);
  const { at, head } = headed(rows, /^occupation code/i);
  const labels = head.map(clean);
  const names = legend(head[2]);
  const col = (re: RegExp) => labels.findIndex((l) => re.test(l));
  const states = ["NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT"].map((s) => [s, col(new RegExp(`^${s}$`, "i"))]);
  const skill = col(/^skill level/i), major = col(/major occupation group/i);
  const rating = (v: Cell) => {
    const c = clean(v);
    return c ? names[c] ?? c : null;
  };
  const out: Row[] = [];
  for (const r of rows.slice(at + 1)) {
    const anzsco = code(r[0]);
    if (!/^\d{6}$/.test(anzsco)) continue;
    const row: Row = { anzsco, year, title: clean(r[1]), national: rating(r[2]), source_url: sourceUrl };
    const codes: Record<string, string> = { national: clean(r[2]) };
    for (const [s, i] of states) {
      row[(s as string).toLowerCase()] = (i as number) >= 0 ? rating(r[i as number]) : null;
      if ((i as number) >= 0) codes[(s as string).toLowerCase()] = clean(r[i as number]);
    }
    row.data = {
      skill_level: skill >= 0 ? num(r[skill]) : null,
      major_group: major >= 0 ? num(r[major]) : null,
      codes,
      classification: "ANZSCO 2022",
    };
    out.push(row);
  }
  return out;
}

// ───────────────────────────── Occupation profiles ─────────────────────────────

/** "Occupation data - February 2026" -> 2026-02-01. */
export function asAt(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames.slice(0, 2)) {
    for (const r of sheetRows(wb, name).slice(0, 5)) {
      for (const c of r) {
        const m = clean(c).toLowerCase().match(/\b([a-z]+)\s+(20\d\d)\b/);
        if (m && MONTHS.includes(m[1])) return `${m[2]}-${String(MONTHS.indexOf(m[1]) + 1).padStart(2, "0")}-01`;
      }
    }
  }
  return null;
}

/** Table rows keyed by ANZSCO code: {code: {title, cells: {key: value}}}; list tables gather their rows. */
function table(
  wb: XLSX.WorkBook,
  sheet: string,
): { keys: string[]; rows: Map<string, { title: string; cells: Cell[][] }> } {
  const rows = sheetRows(wb, sheet);
  const { at, head } = headed(rows, /^anzsco code$/i);
  const keys = head.slice(2).map(keyOf).filter(Boolean);
  const out = new Map<string, { title: string; cells: Cell[][] }>();
  for (const r of rows.slice(at + 1)) {
    const c = code(r[0]);
    if (!/^\d{4}(\d{2})?$/.test(c)) continue;
    const hit = out.get(c) ?? { title: clean(r[1]), cells: [] };
    hit.cells.push(r.slice(2, 2 + keys.length));
    out.set(c, hit);
  }
  return { keys, rows: out };
}

function sheetByTitle(wb: XLSX.WorkBook, re: RegExp): string | null {
  for (const name of wb.SheetNames) {
    const first = sheetRows(wb, name).slice(0, 3).map((r) => clean(r[0])).join(" ");
    if (re.test(first)) return name;
  }
  return null;
}

export function parseProfiles(wb: XLSX.WorkBook, sourceUrl: string): Row[] {
  const date = asAt(wb);
  const find = (re: RegExp) => {
    const s = sheetByTitle(wb, re);
    return s ? table(wb, s) : null;
  };
  const overview = find(/overview/i);
  if (!overview) throw new Error(`no overview table (${wb.SheetNames.join(", ")})`);
  const descriptions = find(/occupation descriptions/i);
  const tasks = find(/occupation tasks/i);
  const earnings = find(/earnings and hours/i);
  const industries = find(/industries/i);
  const states = find(/states and territories/i);
  const ages = find(/age profile/i);
  const education = find(/educational attainment|education/i);
  const record = (t: ReturnType<typeof find>, c: string) => {
    const hit = t?.rows.get(c);
    if (!hit) return null;
    const o: Record<string, number | string | null> = {};
    t!.keys.forEach((k, i) => (o[k] = num(hit.cells[0][i]) ?? (clean(hit.cells[0][i]) || null)));
    return o;
  };
  const k = overview.keys;
  const at = (name: string) => k.indexOf(name);
  const out: Row[] = [];
  for (const [c, { title, cells }] of overview.rows) {
    const r = cells[0];
    const pick = (name: string) => (at(name) >= 0 ? num(r[at(name)]) : null);
    const raw = record(overview, c) ?? {};
    out.push({
      anzsco: c,
      title,
      employed: pick("employed") === null ? null : Math.round(pick("employed")!),
      median_weekly_earnings: pick("median_weekly_earnings"),
      part_time_share: pick("part_time_share_pct"),
      female_share: pick("female_share_pct"),
      median_age: pick("median_age"),
      annual_growth: pick("annual_employment_growth"),
      growth_5yr: null,
      projected_growth: null,
      as_at: date,
      source_url: sourceUrl,
      data: {
        level: c.length === 4 ? "unit group" : "occupation",
        classification: "ANZSCO 2013",
        // Values JSA suppresses or rounds ("<50", "N/A") stay as written here.
        overview_as_published: Object.fromEntries(Object.entries(raw).filter(([, v]) => typeof v === "string")),
        description: descriptions?.rows.get(c)?.cells[0]?.map(clean).find(Boolean) ?? null,
        tasks: tasks?.rows.get(c)?.cells.map((x) => clean(x[0])).filter(Boolean) ?? [],
        earnings_and_hours: record(earnings, c),
        industries: industries?.rows.get(c)?.cells.map((x) => clean(x[0])).filter(Boolean) ?? [],
        states_pct: record(states, c),
        age_pct: record(ages, c),
        education_pct: record(education, c),
      },
    });
  }
  return out;
}

/** OSCA (2021 Census) details by occupation name, for six-digit occupations. */
export function parseOsca(wb: XLSX.WorkBook): Map<string, Record<string, unknown>> {
  const byName = new Map<string, Record<string, unknown>>();
  const add = (sheetRe: RegExp, fields: (r: Cell[], head: string[]) => Record<string, unknown>) => {
    const name = sheetByTitle(wb, sheetRe);
    if (!name) return;
    const rows = sheetRows(wb, name);
    const { at, head } = headed(rows, /^osca level$/i);
    const labels = head.map(clean);
    for (const r of rows.slice(at + 1)) {
      if (clean(r[0]) !== "6-digit") continue;
      const key = norm(clean(r[2]));
      const hit = byName.get(key) ?? { osca_code: code(r[1]), osca_title: clean(r[2]) };
      Object.assign(hit, fields(r, labels));
      byName.set(key, hit);
    }
  };
  const none = (s: string) => (/^no .* (are|is) listed/i.test(s) ? null : s || null);
  add(/what the occupation involves/i, (r, h) => ({
    // Kept as written, including "No registration or licensing requirements are listed ...".
    registration: clean(r[h.findIndex((x) => /registration/i.test(x))]) || null,
    involves: none(clean(r[h.findIndex((x) => /involves/i.test(x))])),
  }));
  add(/alternative title/i, (r, h) => ({
    other_titles: (none(clean(r[h.findIndex((x) => /common occupation titles/i.test(x))])) ?? "").split(/;\s*/)
      .filter(Boolean),
    specialisations: (none(clean(r[h.findIndex((x) => /specialisations/i.test(x))])) ?? "").split(/;\s*/)
      .filter(Boolean),
  }));
  return byName;
}

/** Name key that matches "Software Engineers" (profiles) with "Software Engineer" (OSCA, the list). */
export function norm(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ")
    .map((w) => w.replace(/(ies)$/, "y").replace(/(ss)$/, "ss").replace(/([^s])s$/, "$1")).join(" ");
}

// ───────────────────────────── Run ─────────────────────────────

// JSA's CDN resets requests that don't look like a browser.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** HTTP/1.1 only, where the runtime allows it: JSA's CDN resets HTTP/2 streams from data centres. */
const http1 = (() => {
  try {
    // deno-lint-ignore no-explicit-any
    return (Deno as any).createHttpClient?.({ http1: true, http2: false });
  } catch {
    return undefined;
  }
})();

async function download(url: string): Promise<XLSX.WorkBook> {
  for (let attempt = 1;; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/octet-stream,*/*",
          "Accept-Language": "en-AU,en;q=0.9",
          "Referer": "https://www.jobsandskills.gov.au/data",
        },
        signal: AbortSignal.timeout(60_000),
        ...(http1 && attempt < 3 ? { client: http1 } : {}),
      } as RequestInit);
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return XLSX.read(new Uint8Array(await r.arrayBuffer()), { type: "array" });
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * attempt));
    }
  }
}

async function rpc(db: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

async function upsert(db: SupabaseClient, token: string, kind: string, rows: Row[], run: string): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    n += Number(
      await rpc(db, "worker_occupations_upsert", {
        p_token: token,
        p_kind: kind,
        p_rows: rows.slice(i, i + BATCH),
        p_run: run,
      }),
    ) || 0;
  }
  return n;
}

type Workbooks = { osl: XLSX.WorkBook; profiles: XLSX.WorkBook; osca: XLSX.WorkBook | null };

/** Downloads the three workbooks, one at a time (parallel downloads get reset). */
async function downloadAll(): Promise<Workbooks> {
  const osl = await download(FILES.osl);
  const profiles = await download(FILES.profiles);
  const osca = await download(FILES.osca).catch((e) => {
    console.error("osca download failed", e);
    return null;
  });
  return { osl, profiles, osca };
}

/** Reads the workbooks from files saved in `dir` (osl.xlsx, profiles.xlsx, osca.xlsx), for when JSA's CDN
 * refuses this network: download them in a browser and import with local.ts. */
export async function readWorkbooks(dir: string): Promise<Workbooks> {
  const read = async (name: string) => XLSX.read(await Deno.readFile(`${dir}/${name}`), { type: "array" });
  return {
    osl: await read("osl.xlsx"),
    profiles: await read("profiles.xlsx"),
    osca: await read("osca.xlsx").catch(() => null),
  };
}

export async function importJsa(
  db: SupabaseClient,
  token: string,
  dryRun: boolean,
  load: () => Promise<Workbooks> = downloadAll,
) {
  const started = Date.now();
  const run = `jsa-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
  const timings: Record<string, number> = {};
  try {
    const { osl, profiles, osca } = await load();
    timings.download_ms = Date.now() - started;
    const shortage = parseOsl(osl, FILES.osl);
    const prof = parseProfiles(profiles, FILES.profiles);
    let oscaMatched = 0;
    if (osca) {
      const details = parseOsca(osca);
      for (const p of prof) {
        const hit = p.anzsco && String(p.anzsco).length === 6 ? details.get(norm(String(p.title))) : undefined;
        if (hit) {
          (p.data as Row).osca = { ...hit, source_url: FILES.osca, census: 2021 };
          oscaMatched++;
        }
      }
    }
    timings.parse_ms = Date.now() - started - timings.download_ms;
    if (shortage.length < 500 || prof.length < 500) {
      throw new Error(`too few rows parsed: ${shortage.length} shortage, ${prof.length} profiles`);
    }
    const counts = {
      shortage_rows: shortage.length,
      shortage_year: shortage[0]?.year,
      profiles_rows: prof.length,
      profiles_as_at: prof[0]?.as_at,
      osca_matched: oscaMatched,
    };
    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        run,
        counts,
        timings,
        sample: { shortage: shortage.slice(0, 3), profile: prof.find((p) => p.anzsco === "261313") ?? prof[0] },
      };
    }
    const written = {
      shortage_written: await upsert(db, token, "shortage", shortage, run),
      profiles_written: await upsert(db, token, "profiles", prof, run),
    };
    timings.write_ms = Date.now() - started - timings.download_ms - timings.parse_ms;
    const result = await rpc(db, "worker_occupations_finish", {
      p_token: token,
      p_kind: "jsa",
      p_run: run,
      p_counts: { ...counts, ...written, timings },
    });
    return { ok: true, run, counts: result, timings: { ...timings, total_ms: Date.now() - started } };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!dryRun) {
      await db.rpc("worker_occupations_finish", { p_token: token, p_kind: "jsa", p_run: run, p_error: message });
    }
    return { ok: false, run, error: message, timings };
  }
}
