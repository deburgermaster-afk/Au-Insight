// Types and small helpers shared by the agent and its tool modules (education, site, study,
// document intelligence). Kept free of imports from agent.ts so the modules don't form a cycle.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Emit = (event: Record<string, unknown>) => void;

/** `models` is tried in order: free tiers rate-limit, so a busy model falls through to the next. */
export type LLMConfig = {
  baseUrl: string;
  apiKey: string;
  models: string[];
  /** Other OpenAI-compatible providers, used by models written "@name/model" (e.g. "@gemini/…"). */
  providers?: Record<string, { baseUrl: string; apiKey: string }>;
  /** Google AI key for reading scans and photos, and for structured extraction. */
  geminiKey?: string;
};

/** Gemini models that read documents (fast, light), tried in order. */
export const OCR_MODELS = ["gemini-3.5-flash", "gemini-flash-lite-latest"];

export function endpoint(llm: LLMConfig, model: string) {
  const m = /^@([\w-]+)\/(.+)$/.exec(model);
  const p = m ? llm.providers?.[m[1]] : undefined;
  return p
    ? { ...p, model: m![2], provider: m![1] }
    : { baseUrl: llm.baseUrl, apiKey: llm.apiKey, model, provider: "" };
}

/** A source the user can open. Every tool cites through one numbering, so [n] is unique per turn. */
export type SourceRef = { title: string; section?: string; url: string };
export type Cite = (source: SourceRef) => number;

/** What a tool call gets besides its arguments: an abort signal that fires when its time is up. */
export type ToolOpts = { signal?: AbortSignal };
export type ToolFn = (args: Record<string, unknown>, opts?: ToolOpts) => Promise<unknown>;

export type ToolDef = {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
};

/** Everything a tool module needs. `fetch` and `resolveDns` are swappable for tests. */
export type ToolCtx = {
  supabase: SupabaseClient;
  emit: Emit;
  cite: Cite;
  llm?: LLMConfig;
  fetch: typeof fetch;
  resolveDns?: (host: string) => Promise<string[]>;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A signal that never fires, for callers that pass none. */
export const NEVER = new AbortController().signal;

/** Combines a caller's signal with a timeout. */
export function within(ms: number, signal?: AbortSignal): AbortSignal {
  return signal ? AbortSignal.any([signal, AbortSignal.timeout(Math.max(1, ms))]) : AbortSignal.timeout(Math.max(1, ms));
}

/** A finite number from a number or numeric string ("1,200.50", "$37,000"), else undefined. */
export function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  const m = /-?\d[\d,]*(\.\d+)?/.exec(v.replace(/\s/g, ""));
  if (!m) return undefined;
  const n = Number(m[0].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * A date as YYYY-MM-DD. Reads ISO dates, Australian day/month/year ("27/11/2026"), "27 November 2026",
 * "November 27, 2026" and, for month-only values ("Nov 2026", "2026-11"), the first or last day of
 * the month (`monthEnd`). Returns null for anything it can't read or that isn't a real date.
 */
export function isoDate(value: unknown, monthEnd = false): string | null {
  if (typeof value !== "string" && !(value instanceof Date)) return null;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : value.trim();
  const ymd = (y: number, m: number, d: number) => {
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1) return null;
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d > last) return null;
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  };
  const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  let x = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (x) return ymd(+x[1], +x[2], +x[3]);
  x = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/.exec(s);
  if (x) return ymd(+x[3], +x[2], +x[1]);
  x = /^(\d{1,2})(?:st|nd|rd|th)?[\s\-]+([a-z]{3,9})\.?,?[\s\-]+(\d{4})\b/i.exec(s);
  if (x && MONTHS.includes(x[2].slice(0, 3).toLowerCase())) {
    return ymd(+x[3], MONTHS.indexOf(x[2].slice(0, 3).toLowerCase()) + 1, +x[1]);
  }
  x = /^([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(s);
  if (x && MONTHS.includes(x[1].slice(0, 3).toLowerCase())) {
    return ymd(+x[3], MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1, +x[2]);
  }
  x = /^([a-z]{3,9})\.?,?\s+(\d{4})$/i.exec(s);
  if (x && MONTHS.includes(x[1].slice(0, 3).toLowerCase())) {
    const y = +x[2], m = MONTHS.indexOf(x[1].slice(0, 3).toLowerCase()) + 1;
    return ymd(y, m, monthEnd ? lastDay(y, m) : 1);
  }
  let ym: [number, number] | null = null;
  if ((x = /^(\d{4})-(\d{1,2})$/.exec(s))) ym = [+x[1], +x[2]];
  else if ((x = /^(\d{1,2})\/(\d{4})$/.exec(s))) ym = [+x[2], +x[1]];
  if (ym && ym[1] >= 1 && ym[1] <= 12) return ymd(ym[0], ym[1], monthEnd ? lastDay(ym[0], ym[1]) : 1);
  return null;
}
