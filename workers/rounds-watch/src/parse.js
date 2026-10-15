// Parses the SkillSelect invitation rounds page. A JavaScript port of parse_rounds() and
// html_to_markdown() in worker/occupations.py, kept to the same rules and output shapes so both
// importers write identical rows.

const MONTHS = Object.fromEntries(
  ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"].map((m, i) => [m, i + 1]),
);
const STATES = { act: "ACT", nsw: "NSW", nt: "NT", qld: "QLD", sa: "SA", tas: "TAS", vic: "VIC", wa: "WA" };
const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', ndash: "–", mdash: "—", hellip: "…" };

export const space = (s) => (s ?? "").replace(/[\s ​]+/g, " ").trim();
export const unescapeHtml = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENTITIES[e.toLowerCase()] ?? m,
  );
const text = (html) => space(unescapeHtml(html.replace(/<[^>]+>/g, " ")));
const cell = (c) => space(c).replace(/^[*\s]+|[*\s]+$/g, "");
const int = (c) => (/^\d+$/.test(cell(c).replace(/,/g, "")) ? +cell(c).replace(/,/g, "") : null);
const points = (c) => (/^\d{2,3}$/.test(cell(c)) ? +cell(c) : null);
const subclassOf = (t) => (t ?? "").match(/\b(189|190|491|489|188|887)\b/)?.[1] ?? null;

export function parseDate(t) {
  const m = (t ?? "").match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  const mo = m && MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  const d = new Date(Date.UTC(+m[3], mo - 1, +m[1]));
  return d.getUTCDate() === +m[1] ? d.toISOString().slice(0, 10) : null;
}

export function programYear(iso) {
  const [y, m] = iso.split("-").map(Number);
  const start = m >= 7 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The raw value of the hidden field holding the page's tab content (JSON, HTML-escaped). */
export function schemaField(page) {
  const m = page.match(/PageSchemaHiddenField_Input" value="([^"]*)"/);
  return m ? m[1] : null;
}

/** The HTML fragments inside the hidden field, with each tab's title as an <h2>. */
export function contentHtml(field) {
  const parts = [];
  const walk = (node) => {
    if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === "object") {
      if (typeof node.title === "string" && typeof node.description === "string") parts.push(`<h2>${node.title}</h2>`);
      Object.values(node).forEach(walk);
    } else if (typeof node === "string" && node.includes("<")) parts.push(node);
  };
  walk(JSON.parse(unescapeHtml(field)));
  return parts.join("\n");
}

/** Headings, paragraphs and tables in document order (paragraphs inside tables are part of the table). */
export function blocks(html) {
  const out = [];
  for (const m of html.matchAll(/<(h[1-4]|p|table)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
    const tag = m[1].toLowerCase();
    if (tag === "table") {
      const rows = [...m[2].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => [...r[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => text(c[1]).replace(/\|/g, "/")));
      if (rows.length) out.push({ kind: "t", rows });
    } else if (tag === "p") {
      const t = text(m[2]);
      if (t) out.push({ kind: "p", text: t });
    } else out.push({ kind: "h", level: +tag[1], text: cell(text(m[2])) });
  }
  return out;
}

function tableKind(rows) {
  const head = rows[0].map(cell).join(" ").toLowerCase();
  const words = head.split(/\s+/);
  if (words.includes("jul") && words.includes("jun")) return "monthly";
  if (head.includes("occupation id")) return "pro_rata";
  if (head.includes("minimum points score") && head.includes("visa subclass")) return "cutoffs";
  if (words.includes("act") && words.includes("nsw")) return "nominations";
  if (head.startsWith("visa subclass")) return "summary";
  return "occupations";
}

function occupationRows(rows, defaultSubclass) {
  const header = rows[0].map(cell);
  let data = rows.slice(1);
  if (data.length && !data[0].slice(1).some((c) => points(c) != null || ["n/a", "not invited"].includes(cell(c).toLowerCase()))) data = data.slice(1);
  const width = Math.max(1, ...data.map((r) => r.length)) - 1;
  const labels = header.slice(1).map(subclassOf);
  const named = labels.filter(Boolean);
  const cols =
    labels.length === width ? labels
    : named.length && width % named.length === 0 ? named.flatMap((s) => Array(width / named.length).fill(s))
    : Array(width).fill(width === 1 ? defaultSubclass : null);
  const out = new Map();
  for (const r of data) {
    const name = cell(r[0] ?? "");
    if (!name || name.toLowerCase() === "occupation") continue;
    r.slice(1).forEach((c, i) => {
      const sub = cols[i];
      const p = points(c);
      if (sub && p != null) {
        const key = `${name}\u0000${sub}`;
        out.set(key, Math.min(p, out.get(key) ?? p));
      }
    });
  }
  return [...out].map(([k, p]) => { const [name, sub] = k.split("\u0000"); return { name, sub, p }; });
}

export function parseRounds(html, sourceUrl) {
  const rounds = new Map(), occupations = new Map(), monthly = {}, meta = {}, nominations = [];
  let current = null, summary = {}, yearHeading = null, inNominations = false, nominationsAsOf = null;
  for (const b of blocks(html)) {
    if (b.kind === "h") {
      const m = b.text.match(/invitations issued on (\d{1,2} \w+ \d{4})/i);
      if (m) { current = parseDate(m[1]); summary = {}; inNominations = false; continue; }
      if (/state and territory nominations/i.test(b.text)) { inNominations = true; current = null; }
      const ym = b.text.match(/(\d{4})-(\d{2})\s+program year/i);
      if (ym) yearHeading = `${ym[1]}-${ym[2]}`;
      continue;
    }
    if (b.kind === "p") {
      const nm = b.text.match(/next invitation round for the (.+?) will be held on (\d{1,2} \w+ \d{4})/i);
      if (nm && parseDate(nm[2])) {
        const key = subclassOf(nm[1]) ?? "all";
        meta[`next_round_${key}`] = parseDate(nm[2]);
        meta[`next_round_${key}_text`] = b.text.slice(0, 400);
      }
      const am = b.text.match(/from (\d{1,2} \w+ \d{4}) to (\d{1,2} \w+ \d{4})/);
      if (inNominations && am) nominationsAsOf = `${am[1]} to ${am[2]}`;
      continue;
    }
    const rows = b.rows;
    const kind = tableKind(rows);
    if (kind === "nominations" && inNominations && yearHeading) {
      const states = rows[0].slice(1).map((c) => STATES[cell(c).toLowerCase()]);
      for (const r of rows.slice(1)) {
        const sub = subclassOf(cell(r[0]));
        if (sub) states.forEach((st, i) => st && nominations.push({ program_year: yearHeading, as_of: nominationsAsOf, subclass: sub, state: st, nominations: cell(r[i + 1] ?? "") || null }));
      }
    } else if (kind === "monthly" && yearHeading) {
      if (monthly[yearHeading]) continue;
      const months = rows[0].slice(1).map(cell);
      const table = [];
      for (const r of rows.slice(1)) {
        const label = cell(r[0]);
        const sub = subclassOf(label) ?? (label.toLowerCase() === "total" ? "total" : null);
        if (!sub) continue;
        table.push({ subclass: sub, label, months: Object.fromEntries(months.map((m, i) => [m, int(r[i + 1] ?? "")]).filter(([m]) => m)) });
      }
      monthly[yearHeading] = { program_year: yearHeading, from_round: current, source_url: sourceUrl, rows: table };
    } else if (!current) continue;
    else if (kind === "summary") {
      const head = rows[0].map((c) => cell(c).toLowerCase());
      let iInv = head.findIndex((h) => h.includes("invited") || h === "number" || h.includes("total"));
      if (iInv < 0) iInv = 1;
      const iTie = head.findIndex((h) => h.includes("tie break") || h.includes("date of effect"));
      for (const r of rows.slice(1)) {
        const sub = subclassOf(cell(r[0]));
        if (!sub) continue;
        const tie = iTie >= 0 && iTie < r.length ? cell(r[iTie]) : null;
        summary[sub] = { round_date: current, subclass: sub, subclass_name: cell(r[0]), invited: iInv < r.length ? int(r[iInv]) : null, tie_break: tie && tie.toUpperCase() !== "N/A" ? tie : null, min_points: null, program_year: programYear(current), source_url: sourceUrl };
        rounds.set(`${current}|${sub}`, summary[sub]);
      }
    } else if (kind === "cutoffs") {
      for (const r of rows.slice(1)) {
        const row = rounds.get(`${current}|${subclassOf(cell(r[0]))}`);
        if (!row) continue;
        row.min_points = r.length > 1 ? points(r[1]) : null;
        const doe = r.length > 2 ? cell(r[2]) : "";
        if (doe && doe.toUpperCase() !== "N/A" && !row.tie_break) row.tie_break = doe;
      }
    } else if (kind === "pro_rata") {
      for (const r of rows.slice(1)) {
        if (r.length < 4) continue;
        const p = points(r[3]);
        if (p == null) continue;
        const name = `${cell(r[2])} (ANZSCO unit group ${cell(r[1])})`;
        for (const sub of cell(r[0]).match(/\d{3}/g) ?? []) occupations.set(`${current}|${sub}|${name}`, { round_date: current, subclass: sub, occupation: name, min_points: p });
      }
    } else if (kind === "occupations") {
      const invited = Object.entries(summary).filter(([, v]) => v.invited).map(([s]) => s);
      const def = invited.length === 1 ? invited[0] : "189";
      for (const { name, sub, p } of occupationRows(rows, def)) occupations.set(`${current}|${sub}|${name}`, { round_date: current, subclass: sub, occupation: name, min_points: p });
    }
  }
  for (const o of occupations.values()) {
    const key = `${o.round_date}|${o.subclass}`;
    if (!rounds.has(key)) rounds.set(key, { round_date: o.round_date, subclass: o.subclass, subclass_name: null, invited: null, tie_break: null, min_points: null, program_year: programYear(o.round_date), source_url: sourceUrl });
  }
  for (const [year, table] of Object.entries(monthly)) meta[`monthly_totals_${year}`] = JSON.stringify(table);
  return { rounds: [...rounds.values()], occupations: [...occupations.values()], meta, nominations };
}
