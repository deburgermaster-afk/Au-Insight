// Jobs and Skills Australia shortage history and employment projections, behind occupation_outlook():
//
// - Historical Occupation Shortage List, 6-digit ANZSCO, 2021-2024 (the Skills Priority List 2021 to 2023 and
//   the 2024 Occupation Shortage List): each year's national and state/territory ratings, given twice, in
//   ANZSCO 2013 and in ANZSCO 2022. Written to occupation_shortage next to the 2025 list (jsa.ts). That
//   table's key is (code, year), so a year's row is the ANZSCO 2013 version (the codes SkillSelect uses); the
//   2022 version of the same code goes in data.anzsco_2022, and codes only ANZSCO 2022 has get rows of their
//   own (data.classification "ANZSCO 2022").
// - Employment Projections, May 2025 to May 2035: employment at the base date and 5 and 10 years on, for
//   ANZSCO unit groups and the groups above them (JSA does not project single occupations). Written to
//   occupation_projections.
//
// Rows are written through worker_jsa_history_upsert / worker_jsa_history_finish (source "jsa_history").

import type { SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import * as XLSX from "npm:xlsx@0.18.5";
import { clean, legend, num } from "./jsa.ts";

const JSA = "https://www.jobsandskills.gov.au/sites/default/files";
// `published` is the file's Last-Modified date on JSA's server (checked 10 October 2026); it is each row's
// as_at. A new release has a new dated path, so both change together.
export const FILES = {
  history: {
    url: `${JSA}/2024-10/Historical%20Occupation%20Shortage%20List%2C%206-digit%20ANZSCO%2C%202021-2024.xlsx`,
    published: "2024-10-14",
  },
  projections: {
    url: `${JSA}/2025-11/employment_projections_-_may_2025_to_may_2035.xlsx`,
    published: "2025-11-06",
  },
};
const BATCH = 250;
const STATES = ["nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act"];

type Cell = string | number | boolean | null;
type Row = Record<string, unknown>;

const code = (v: Cell): string => clean(v).replace(/\.0$/, "");

function sheetRows(wb: XLSX.WorkBook, name: string): Cell[][] {
  return XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, defval: null }) as Cell[][];
}

/** The heading row: the first with a cell reading "ANZSCO Code". */
function heading(rows: Cell[][]): number {
  return rows.findIndex((r) => r.some((c) => /^anzsco code$/i.test(clean(c))));
}

// ───────────────────────────── Shortage history ─────────────────────────────

type Rated = Record<string, unknown> & { codes: Record<string, string> };

export function parseShortageHistory(wb: XLSX.WorkBook, sourceUrl: string, asAt: string | null): Row[] {
  const name = wb.SheetNames.find((n) => {
    const rows = sheetRows(wb, n);
    const at = heading(rows);
    return at >= 0 && rows[at].some((c) => /production year/i.test(clean(c)));
  });
  if (!name) throw new Error(`no sheet with a production year column (${wb.SheetNames.join(", ")})`);
  const rows = sheetRows(wb, name);
  const at = heading(rows);
  const labels = rows[at].map(clean);
  const col = (re: RegExp) => labels.findIndex((l) => re.test(l));
  const year = col(/production year/i), basis = col(/basis/i);
  // The national rating column is headed by the ratings legend ("NS - No Shortage\r\nS - Shortage ...").
  const national = rows[at].findIndex((c) => Object.keys(legend(c)).length > 0);
  if (year < 0 || basis < 0 || national < 0) throw new Error(`unexpected headings: ${labels.join(" | ")}`);
  const names = legend(rows[at][national]);
  const states = STATES.map((s) => [s, col(new RegExp(`^${s}$`, "i"))] as const);
  const skill = col(/^skill level/i), major = col(/major (occupation )?group/i);
  // e.g. 'Note: Some occupations in 2021 were out of scope of OSL at that point in time and marked as "na".'
  const note = rows.slice(0, at).map((r) => clean(r[0])).find((t) => /^note\b/i.test(t))?.replace(/^note:\s*/i, "");

  // Codes are written out with the file's own legend; "na" (out of scope that year) is not a rating. The
  // 2024 ANZSCO 2022 sheet has a few "Ns" for "NS".
  const rating = (v: Cell): string | null => {
    const c = clean(v);
    if (!c || /^na$/i.test(c)) return null;
    return names[c] ?? names[c.toUpperCase()] ?? c;
  };
  const rated = (r: Cell[]): Rated => {
    const out: Rated = { title: clean(r[1]), national: rating(r[national]), codes: { national: clean(r[national]) } };
    for (const [s, i] of states) {
      out[s] = i >= 0 ? rating(r[i]) : null;
      if (i >= 0) out.codes[s] = clean(r[i]);
    }
    if (/^na$/i.test(out.codes.national)) out.out_of_scope = true;
    return out;
  };

  const byKey = new Map<string, { anzsco: string; year: number; skill: Cell; major: Cell; b13?: Rated; b22?: Rated }>();
  for (const r of rows.slice(at + 1)) {
    const anzsco = code(r[0]), y = num(r[year]), b = code(r[basis]);
    if (!/^\d{6}$/.test(anzsco) || !y || (b !== "2013" && b !== "2022")) continue;
    const key = `${anzsco}|${y}`;
    const hit = byKey.get(key) ?? { anzsco, year: y, skill: r[skill], major: r[major] };
    hit[b === "2013" ? "b13" : "b22"] = rated(r);
    byKey.set(key, hit);
  }

  const out: Row[] = [];
  for (const { anzsco, year: y, skill: sk, major: mj, b13, b22 } of byKey.values()) {
    const main = (b13 ?? b22)!;
    const { codes, out_of_scope, ...ratings } = main;
    const data: Row = {
      classification: b13 ? "ANZSCO 2013" : "ANZSCO 2022",
      codes,
      skill_level: skill >= 0 ? num(sk) : null,
      major_group: major >= 0 ? num(mj) : null,
    };
    if (out_of_scope) Object.assign(data, { out_of_scope: true, note: note ?? null });
    if (b13 && b22) {
      const { codes: c22, ...r22 } = b22;
      data.anzsco_2022 = { ...r22, codes: c22 };
    }
    out.push({ anzsco, year: y, ...ratings, data, source_url: sourceUrl, as_at: asAt });
  }
  return out;
}

// ───────────────────────────── Employment projections ─────────────────────────────

const LEVELS: Record<number, string> = {
  1: "major group",
  2: "sub-major group",
  3: "minor group",
  4: "unit group",
  6: "occupation",
};

/** "May 2025 ('000)" -> "May 2025". */
export function period(v: Cell): string | null {
  const m = clean(v).match(/\b([A-Z][a-z]+)\s+(20\d\d)\b/);
  return m ? `${m[1]} ${m[2]}` : null;
}

/** "ANZSCO version 1.3", from the data dictionary's "ANZSCO" entry. */
function classificationOf(wb: XLSX.WorkBook): string | null {
  for (const name of wb.SheetNames) {
    for (const r of sheetRows(wb, name)) {
      const i = r.findIndex((c) => clean(c) === "ANZSCO");
      const v = i >= 0 ? clean(r[i + 1]).match(/version\s+([\d.]+)/i) : null;
      if (v) return `ANZSCO version ${v[1]}`;
    }
  }
  return null;
}

/** Every table with an "ANZSCO Code" column (the unit group table, and an occupation table if a release has
 * one): one row per code and horizon. */
export function parseProjections(wb: XLSX.WorkBook, sourceUrl: string, asAt: string | null): Row[] {
  const classification = classificationOf(wb);
  const out: Row[] = [];
  const seen = new Set<string>();
  for (const name of wb.SheetNames) {
    const rows = sheetRows(wb, name);
    const at = heading(rows);
    if (at < 0) continue;
    const labels = rows[at].map(clean), sub = rows[at + 1] ?? [];
    const col = (re: RegExp) => labels.findIndex((l) => re.test(l));
    const anz = col(/^anzsco code$/i), title = col(/^occupation$/i), base = col(/^baseline$/i);
    const nfd = col(/nfd/i), skill = col(/^skill level/i);
    if (title < 0 || base < 0) throw new Error(`${name}: unexpected headings: ${labels.join(" | ")}`);
    const basePeriod = period(sub[base]);
    const baseYear = Number(basePeriod?.slice(-4));
    if (!basePeriod) throw new Error(`${name}: no base period under "Baseline"`);
    // Levels are published in thousands ("May 2025 ('000)").
    const scale = /'000|thousand/i.test(clean(sub[base])) ? 1000 : 1;
    const projected = labels.flatMap((l, i) => (/^projected$/i.test(l) ? [{ i, period: period(sub[i]) }] : []));
    // "5-Year Change" heads two columns: the change in level, then the percentage change.
    const horizons = labels.flatMap((l, i) => {
      const m = l.match(/^(\d+)-year change/i);
      if (!m) return [];
      const years = Number(m[1]);
      const target = projected.find((p) => Number(p.period?.slice(-4)) === baseYear + years);
      if (!target) throw new Error(`${name}: no projected column for ${l}`);
      return [{ horizon: `${years} years`, level: i, pct: i + 1, at: target.i, period: target.period }];
    });
    if (!horizons.length) throw new Error(`${name}: no change columns`);

    // Percentages are stored as fractions (0.157 shown as 15.7%). Which it is, is read off the first row's
    // published change and base, and every row must agree, rather than assumed.
    let pctScale: number | null = null;
    for (const r of rows.slice(at + 2)) {
      const c = code(r[anz]);
      if (!/^\d{1,6}$/.test(c) || num(r[base]) === null || seen.has(c)) continue;
      const level = LEVELS[c.length];
      if (!level) continue;
      const b = num(r[base])!;
      for (const h of horizons) {
        const change = num(r[h.level]), pct = num(r[h.pct]), proj = num(r[h.at]);
        if (change && pct !== null && b > 0) {
          const share = change / b;
          if (pctScale === null) pctScale = Math.abs(pct - share) < 1e-4 ? 100 : 1;
          if (Math.abs(pct * pctScale - share * 100) >= 1e-2) {
            throw new Error(`${name}: ${c} ${h.horizon} change of ${pct} does not match ${change} on ${b}`);
          }
        }
        out.push({
          anzsco: c,
          title: clean(r[title]),
          level,
          nfd: nfd >= 0 ? clean(r[nfd]).toUpperCase() === "Y" : false,
          skill_level: skill >= 0 ? clean(r[skill]).replace(/^-$/, "") || null : null,
          classification,
          base_period: basePeriod,
          base_employment: Math.round(b * scale),
          horizon: h.horizon,
          projected_period: h.period,
          projected_employment: proj === null ? null : Math.round(proj * scale),
          growth: change === null ? null : Math.round(change * scale),
          growth_pct: pct === null || pctScale === null ? null : Math.round(pct * pctScale * 100) / 100,
          source_url: sourceUrl,
          as_at: asAt,
        });
      }
      seen.add(c);
    }
  }
  return out;
}

// ───────────────────────────── Run ─────────────────────────────

// JSA's CDN refuses requests that don't look like a browser, and data-centre networks outright (then
// download the files in a browser and import them with local_history.ts).
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function download(url: string): Promise<XLSX.WorkBook> {
  for (let attempt = 1;; attempt++) {
    try {
      const r = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept-Language": "en-AU,en;q=0.9",
          "Referer": "https://www.jobsandskills.gov.au/data",
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return XLSX.read(new Uint8Array(await r.arrayBuffer()), { type: "array" });
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((ok) => setTimeout(ok, 1500 * attempt));
    }
  }
}

type Workbooks = { history: XLSX.WorkBook | null; projections: XLSX.WorkBook | null };

async function downloadAll(): Promise<Workbooks> {
  return { history: await download(FILES.history.url), projections: await download(FILES.projections.url) };
}

/** Reads history.xlsx and projections.xlsx from `dir`; a missing one is skipped (and its rows left alone). */
export async function readHistoryWorkbooks(dir: string): Promise<Workbooks> {
  const read = async (name: string) => {
    try {
      return XLSX.read(await Deno.readFile(`${dir}/${name}`), { type: "array" });
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) return null;
      throw e;
    }
  };
  return { history: await read("history.xlsx"), projections: await read("projections.xlsx") };
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
      await rpc(db, "worker_jsa_history_upsert", {
        p_token: token,
        p_kind: kind,
        p_rows: rows.slice(i, i + BATCH),
        p_run: run,
      }),
    ) || 0;
  }
  return n;
}

const SAMPLE = ["261313", "233211", "254499", "331212"];

export async function importHistory(
  db: SupabaseClient,
  token: string,
  dryRun: boolean,
  load: () => Promise<Workbooks> = downloadAll,
) {
  const started = Date.now();
  const run = `jsa_history-${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}`;
  try {
    const { history, projections } = await load();
    if (!history && !projections) throw new Error("no workbooks to import");
    const shortage = history ? parseShortageHistory(history, FILES.history.url, FILES.history.published) : [];
    const proj = projections ? parseProjections(projections, FILES.projections.url, FILES.projections.published) : [];
    const years: Record<string, number> = {};
    for (const r of shortage) years[String(r.year)] = (years[String(r.year)] ?? 0) + 1;
    if (history && (Object.keys(years).length < 2 || Object.values(years).some((n) => n < 500))) {
      throw new Error(`too few shortage rows parsed: ${JSON.stringify(years)}`);
    }
    const unitGroups = proj.filter((r) => r.level === "unit group" && r.horizon === "5 years").length;
    if (projections && unitGroups < 300) throw new Error(`too few projections parsed: ${unitGroups} unit groups`);
    const counts = {
      shortage_rows: shortage.length,
      shortage_years: years,
      projections_rows: proj.length,
      projection_unit_groups: unitGroups,
      projections_base: proj[0]?.base_period ?? null,
    };
    if (dryRun) {
      return {
        ok: true,
        dry_run: true,
        run,
        counts,
        sample: {
          shortage: shortage.filter((r) => SAMPLE.includes(String(r.anzsco)) && r.year === 2024),
          projections: proj.filter((r) =>
            SAMPLE.some((c) => c.startsWith(String(r.anzsco)) && r.level === "unit group")
          ),
        },
      };
    }
    const written = {
      shortage_written: shortage.length ? await upsert(db, token, "shortage_history", shortage, run) : 0,
      projections_written: proj.length ? await upsert(db, token, "projections", proj, run) : 0,
    };
    const result = await rpc(db, "worker_jsa_history_finish", {
      p_token: token,
      p_run: run,
      p_counts: { ...counts, ...written },
    });
    return { ok: true, run, counts: result, ms: Date.now() - started };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!dryRun) await db.rpc("worker_jsa_history_finish", { p_token: token, p_run: run, p_error: message });
    return { ok: false, run, error: message, ms: Date.now() - started };
  }
}
