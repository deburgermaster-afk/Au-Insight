// The agency's own workflow: checklists per visa, fee schedule, who new cases go to, and pick lists.
// Anything not set falls back to Lodgely's defaults, so an empty config behaves exactly as before.
import type { WorkflowConfig } from "@/db/crm-schema";
import { visaByCode } from "@/lib/visas";

export const DEFAULT_LISTS = {
  sources: ["Referral", "Website", "Walk-in", "Facebook", "Instagram", "Google", "Education agent", "Existing client", "Other"],
  tags: ["VIP", "Urgent", "Family group", "Employer client", "Student", "Payment plan"],
  documentCategories: ["Identity", "Character", "Health", "English", "Skills", "Employment", "Education", "Financial", "Relationship", "Sponsorship", "Nomination", "Agreement", "Correspondence", "Other"],
  outcomes: ["granted", "refused", "withdrawn", "invalid", "cancelled"],
};

export type ListKey = keyof typeof DEFAULT_LISTS;
export const listOf = (w: WorkflowConfig | null | undefined, k: ListKey) => (w?.lists?.[k]?.length ? w.lists[k]! : DEFAULT_LISTS[k]);

/** The checklist a new case starts with: the agency's own version if it has one, else Lodgely's. */
export function checklistFor(w: WorkflowConfig | null | undefined, visaCode: string) {
  const own = w?.checklists?.[visaCode];
  if (own?.length) return { items: own, source: "agency" as const };
  return { items: (visaByCode(visaCode)?.checklist ?? []).map((c) => ({ category: c.category, label: c.label, required: c.required !== false })), source: "lodgely" as const };
}

export const feesFor = (w: WorkflowConfig | null | undefined, visaCode: string) => w?.fees?.[visaCode] ?? null;

/** Does an assignment rule match this new case? Rules match a visa code ("190"), a prefix ("82*") or "student". */
export function ruleMatches(match: string, visaCode: string) {
  const m = match.trim().toLowerCase();
  if (!m) return false;
  if (m.endsWith("*")) return visaCode.toLowerCase().startsWith(m.slice(0, -1));
  return m === visaCode.toLowerCase();
}
