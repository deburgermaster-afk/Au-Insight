// Employer nominations: the program list, statuses and how long an approval stays usable.

export const NOMINATION_PROGRAMS = [
  { value: "482_core", label: "482 Skills in Demand · Core Skills" },
  { value: "482_specialist", label: "482 Skills in Demand · Specialist Skills" },
  { value: "482_essential", label: "482 Skills in Demand · Essential Skills" },
  { value: "186_direct", label: "186 ENS · Direct Entry" },
  { value: "186_trt", label: "186 ENS · Temporary Residence Transition" },
  { value: "494", label: "494 Skilled Employer Sponsored Regional" },
  { value: "labour_agreement", label: "Labour agreement" },
  { value: "407", label: "407 Training" },
] as const;

export const NOMINATION_STATUSES = [
  { value: "preparing", label: "Preparing", tone: "gray" },
  { value: "lodged", label: "Lodged", tone: "blue" },
  { value: "further_info", label: "Further info requested", tone: "amber" },
  { value: "approved", label: "Approved", tone: "green" },
  { value: "refused", label: "Refused", tone: "red" },
  { value: "withdrawn", label: "Withdrawn", tone: "gray" },
  { value: "lapsed", label: "Lapsed", tone: "red" },
] as const;

export const LMT_STATUSES = [
  { value: "not_required", label: "Not required" },
  { value: "needed", label: "Needed" },
  { value: "in_progress", label: "Advertising" },
  { value: "done", label: "Done" },
] as const;

export const programLabel = (v: string) => NOMINATION_PROGRAMS.find((p) => p.value === v)?.label ?? v;
export const statusOf = (v: string) => NOMINATION_STATUSES.find((p) => p.value === v) ?? NOMINATION_STATUSES[0];
export const OPEN_STATUSES = ["preparing", "lodged", "further_info"];

/**
 * A suggested last day to lodge the visa after the nomination is approved: 12 months for a 482
 * nomination, 6 months for a 186. Shown as a default the agent can change; other programs are left blank.
 */
export function suggestedApprovalExpiry(program: string, decidedAt: string): string | null {
  const months = program.startsWith("482") ? 12 : program.startsWith("186") ? 6 : null;
  if (!months) return null;
  const d = new Date(`${decidedAt}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}
