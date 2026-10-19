import type { SegmentFilters } from "@/db/crm-schema";
import { daysUntil } from "@/lib/format";

export type { SegmentFilters };

/** The client fields a segment can filter on. */
export type SegmentRow = {
  firstName: string;
  lastName: string;
  email: string | null;
  passportNumber: string | null;
  occupation: string | null;
  nationality: string | null;
  currentVisa: string | null;
  visaExpiry: string | null;
  stage: string;
  tags: string[];
  source: string | null;
  onshore: boolean;
  assignedTo: string | null;
};

const has = (v?: unknown[]) => Array.isArray(v) && v.length > 0;

/** True when a client matches every filter that's set. Shared by the list, bulk actions and exports. */
export function matchesSegment(r: SegmentRow, f: SegmentFilters): boolean {
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q && ![r.firstName, r.lastName, `${r.firstName} ${r.lastName}`, r.email, r.passportNumber, r.occupation, r.nationality, r.currentVisa].some((v) => v?.toLowerCase().includes(q))) return false;
  }
  if (has(f.stages) && !f.stages!.includes(r.stage)) return false;
  if (has(f.tags)) {
    const tags = r.tags ?? [];
    const ok = f.tagMode === "all" ? f.tags!.every((t) => tags.includes(t)) : f.tags!.some((t) => tags.includes(t));
    if (!ok) return false;
  }
  if (has(f.visas) && !f.visas!.includes(r.currentVisa ?? "")) return false;
  if (has(f.sources) && !f.sources!.includes(r.source ?? "")) return false;
  if (has(f.nationalities) && !f.nationalities!.includes(r.nationality ?? "")) return false;
  if (f.location === "onshore" && !r.onshore) return false;
  if (f.location === "offshore" && r.onshore) return false;
  if (f.expiryDays != null) {
    if (!r.visaExpiry) return false;
    const d = daysUntil(r.visaExpiry);
    if (d < 0 || d > f.expiryDays) return false;
  }
  if (has(f.assignedTo) && !f.assignedTo!.includes(r.assignedTo ?? "")) return false;
  return true;
}

/** Drops empty values so saved segments stay small and comparable. */
export function cleanFilters(f: SegmentFilters): SegmentFilters {
  const out: SegmentFilters = {};
  if (f.q?.trim()) out.q = f.q.trim();
  for (const k of ["stages", "tags", "visas", "sources", "nationalities", "assignedTo"] as const) if (has(f[k])) out[k] = [...new Set(f[k]!)];
  if (out.tags && f.tagMode === "all") out.tagMode = "all";
  if (f.location) out.location = f.location;
  if (f.expiryDays != null) out.expiryDays = f.expiryDays;
  return out;
}

export const filterCount = (f: SegmentFilters) => Object.keys(cleanFilters(f)).filter((k) => k !== "q" && k !== "tagMode").length;

/** A plain-English summary of a segment, e.g. "Active · tagged priority · onshore · visa expires in 90 days". */
export function describeFilters(f: SegmentFilters, names: Record<string, string> = {}): string {
  const p: string[] = [];
  if (has(f.stages)) p.push(f.stages!.map((s) => s.replace("_", " ")).join(" or "));
  if (has(f.tags)) p.push(`tagged ${f.tags!.join(f.tagMode === "all" ? " and " : " or ")}`);
  if (has(f.visas)) p.push(`on ${f.visas!.map((v) => (v ? `subclass ${v}` : "no visa")).join(" or ")}`);
  if (has(f.sources)) p.push(`from ${f.sources!.join(" or ")}`);
  if (has(f.nationalities)) p.push(f.nationalities!.join(" or "));
  if (f.location) p.push(f.location);
  if (f.expiryDays != null) p.push(`visa expires within ${f.expiryDays} days`);
  if (has(f.assignedTo)) p.push(`case officer ${f.assignedTo!.map((id) => names[id] ?? "unassigned").join(" or ")}`);
  if (f.q) p.push(`matching "${f.q}"`);
  return p.join(" · ") || "Every client";
}

const csvCell = (v: unknown) => {
  const t = v == null ? "" : String(v);
  return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** RFC 4180 CSV with a header row. */
export function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]) {
  return [columns.map((c) => csvCell(c.label)).join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(","))].join("\r\n");
}
