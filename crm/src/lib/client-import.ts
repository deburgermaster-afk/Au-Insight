// Client import: CSV parsing, column matching, validation and duplicate keys. Pure functions,
// used in the browser (preview) and on the server (import, duplicate detection).

export const IMPORT_FIELDS = [
  { key: "fullName", label: "Full name", synonyms: ["name", "full name", "client name", "client", "applicant", "applicant name"] },
  { key: "firstName", label: "First name", synonyms: ["first name", "given name", "given names", "firstname", "first", "forename"] },
  { key: "lastName", label: "Last name", synonyms: ["last name", "surname", "family name", "lastname", "last"] },
  { key: "email", label: "Email", synonyms: ["email", "email address", "e-mail", "mail"] },
  { key: "phone", label: "Phone", synonyms: ["phone", "mobile", "mobile number", "phone number", "contact number", "cell", "telephone"] },
  { key: "dateOfBirth", label: "Date of birth", synonyms: ["date of birth", "dob", "birth date", "birthday", "d.o.b"] },
  { key: "gender", label: "Gender", synonyms: ["gender", "sex"] },
  { key: "nationality", label: "Nationality", synonyms: ["nationality", "citizenship", "country of citizenship", "country"] },
  { key: "countryOfBirth", label: "Country of birth", synonyms: ["country of birth", "birth country", "place of birth"] },
  { key: "passportNumber", label: "Passport number", synonyms: ["passport", "passport number", "passport no", "passport no.", "passport #"] },
  { key: "passportExpiry", label: "Passport expiry", synonyms: ["passport expiry", "passport expiry date", "passport expires", "passport exp"] },
  { key: "address", label: "Address", synonyms: ["address", "street", "street address", "residential address", "address line 1"] },
  { key: "city", label: "Suburb / city", synonyms: ["city", "suburb", "town", "suburb/town"] },
  { key: "state", label: "State", synonyms: ["state", "province", "region"] },
  { key: "currentVisa", label: "Current visa", synonyms: ["current visa", "visa", "visa subclass", "subclass", "visa type"] },
  { key: "visaExpiry", label: "Visa expiry", synonyms: ["visa expiry", "visa expiry date", "visa expires", "visa end date"] },
  { key: "occupation", label: "Occupation", synonyms: ["occupation", "job", "job title", "profession", "nominated occupation"] },
  { key: "anzsco", label: "ANZSCO", synonyms: ["anzsco", "anzsco code"] },
  { key: "englishTest", label: "English test", synonyms: ["english test", "test", "english test type"] },
  { key: "englishScore", label: "English score", synonyms: ["english score", "ielts", "pte", "score", "overall score"] },
  { key: "stage", label: "Stage", synonyms: ["stage", "status", "client status"] },
  { key: "source", label: "Source", synonyms: ["source", "lead source", "referral", "how did you hear"] },
  { key: "tags", label: "Tags", synonyms: ["tags", "labels"] },
  { key: "notes", label: "Notes", synonyms: ["notes", "comments", "remarks", "note"] },
] as const;
export type FieldKey = (typeof IMPORT_FIELDS)[number]["key"];

/** RFC 4180-ish CSV parsing; detects comma, semicolon or tab. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].map((d) => [d, first.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows.map((r) => r.map((c) => c.trim()));
}

const canon = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").replace(/\s+/g, " ").trim();

/** Best guess of which field each column holds (null = skip). */
export function guessMapping(headers: string[]): (FieldKey | null)[] {
  const used = new Set<string>();
  return headers.map((h) => {
    const c = canon(h);
    const hit = IMPORT_FIELDS.find((f) => !used.has(f.key) && (f.synonyms as readonly string[]).includes(c)) ?? IMPORT_FIELDS.find((f) => !used.has(f.key) && (f.synonyms as readonly string[]).some((syn) => c.includes(syn) && syn.length > 3));
    if (!hit) return null;
    used.add(hit.key);
    return hit.key;
  });
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** Dates as Australians write them (day first), ISO, or "12 Mar 1995". Returns YYYY-MM-DD or null. */
export function parseDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let y: number, m: number, d: number;
  let r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (r) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[\s-]+([a-z]{3})[a-z]*[\s-]+(\d{2,4})$/i))) [d, m, y] = [+r[1], MONTHS.indexOf(r[2].toLowerCase()) + 1, +r[3]];
  else return null;
  if (y < 100) y += y > 40 ? 1900 : 2000;
  if (!m || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

const STAGES = ["lead", "prospect", "active", "on_hold", "past", "lost"];
const stageOf = (v: string) => {
  const c = canon(v).replace(/ /g, "_");
  if (STAGES.includes(c)) return c;
  if (/current|open|client/.test(c)) return "active";
  if (/hold|paused/.test(c)) return "on_hold";
  if (/closed|former|complete|granted/.test(c)) return "past";
  if (/lost|declined|cancel/.test(c)) return "lost";
  if (/enquir|inquir|new/.test(c)) return "lead";
  return null;
};

export type ImportRow = {
  line: number;
  values: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    dateOfBirth: string | null;
    gender: string | null;
    nationality: string | null;
    countryOfBirth: string | null;
    passportNumber: string | null;
    passportExpiry: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    currentVisa: string | null;
    visaExpiry: string | null;
    occupation: string | null;
    anzsco: string | null;
    englishTest: string | null;
    englishScore: string | null;
    stage: string;
    source: string | null;
    tags: string[];
    notes: string | null;
  };
  errors: string[];
  warnings: string[];
};

/** Turns one CSV row into client values, with errors (row can't be imported) and warnings. */
export function toClient(cells: string[], mapping: (FieldKey | null)[], line: number): ImportRow {
  const get = (k: FieldKey) => {
    const i = mapping.indexOf(k);
    return i >= 0 ? (cells[i] ?? "").trim() : "";
  };
  const errors: string[] = [];
  const warnings: string[] = [];
  let first = get("firstName");
  let last = get("lastName");
  const full = get("fullName");
  if ((!first || !last) && full) {
    const parts = full.includes(",") ? full.split(",").map((x) => x.trim()).reverse().join(" ").split(/\s+/) : full.split(/\s+/);
    if (!last) last = parts.length > 1 ? parts.at(-1)! : "";
    if (!first) first = parts.length > 1 ? parts.slice(0, -1).join(" ") : parts[0];
  }
  if (!first && !last) errors.push("No name");
  else if (!last) warnings.push("No last name");
  const date = (k: FieldKey, label: string) => {
    const v = get(k);
    if (!v) return null;
    const d = parseDate(v);
    if (!d) warnings.push(`${label} "${v}" not understood, left blank`);
    return d;
  };
  let email: string | null = get("email").toLowerCase() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    warnings.push(`Email "${email}" looks wrong, left blank`);
    email = null;
  }
  const stageRaw = get("stage");
  const stage = stageRaw ? stageOf(stageRaw) : null;
  if (stageRaw && !stage) warnings.push(`Stage "${stageRaw}" not recognised, set to Lead`);
  const blank = (k: FieldKey) => get(k) || null;
  return {
    line,
    values: {
      firstName: first || "(no first name)",
      lastName: last || "",
      email,
      phone: blank("phone"),
      dateOfBirth: date("dateOfBirth", "Date of birth"),
      gender: blank("gender"),
      nationality: blank("nationality"),
      countryOfBirth: blank("countryOfBirth"),
      passportNumber: get("passportNumber").toUpperCase().replace(/\s+/g, "") || null,
      passportExpiry: date("passportExpiry", "Passport expiry"),
      address: blank("address"),
      city: blank("city"),
      state: blank("state"),
      currentVisa: get("currentVisa").replace(/^subclass\s*/i, "") || null,
      visaExpiry: date("visaExpiry", "Visa expiry"),
      occupation: blank("occupation"),
      anzsco: blank("anzsco"),
      englishTest: blank("englishTest"),
      englishScore: blank("englishScore"),
      stage: stage ?? "lead",
      source: blank("source"),
      tags: get("tags").split(/[,;|]/).map((x) => x.trim()).filter(Boolean),
      notes: blank("notes"),
    },
    errors,
    warnings,
  };
}

// ── Duplicate keys ─────────────────────────────────────────────────────────────────────────────
const fold = (v?: string | null) => (v ?? "").toLowerCase().normalize("NFKD").replace(/[^a-z]/g, "");
export type DupInput = { firstName: string; lastName: string; email?: string | null; phone?: string | null; dateOfBirth?: string | null; passportNumber?: string | null };
/** Keys two records share when they're probably the same person, with the reason shown to staff. */
export function dupKeys(c: DupInput): { key: string; reason: string; strong: boolean }[] {
  const out: { key: string; reason: string; strong: boolean }[] = [];
  if (c.email) out.push({ key: `e:${c.email.trim().toLowerCase()}`, reason: "Same email", strong: true });
  const pp = (c.passportNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (pp.length >= 6) out.push({ key: `p:${pp}`, reason: "Same passport number", strong: true });
  const name = `${fold(c.firstName)}|${fold(c.lastName)}`;
  if (c.dateOfBirth && name !== "|") out.push({ key: `nd:${name}|${c.dateOfBirth}`, reason: "Same name and date of birth", strong: true });
  const ph = (c.phone ?? "").replace(/\D/g, "").slice(-9);
  if (ph.length === 9) out.push({ key: `ph:${ph}`, reason: "Same phone number", strong: false });
  if (fold(c.firstName) && fold(c.lastName)) out.push({ key: `n:${name}`, reason: "Same name", strong: false });
  return out;
}
