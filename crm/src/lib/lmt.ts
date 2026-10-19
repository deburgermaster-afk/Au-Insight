// Labour market testing (LMT) for employer nominations: the ads placed and whether they meet the
// requirements (Migration Act s140GBA and the Minister's instrument, as changed on 7 December 2024):
// - at least two ads, published in Australia, in English
// - one on the Workforce Australia jobs board
// - each ad open for at least 4 weeks
// - all ads published within the 6 months before the nomination is lodged
// - each ad shows the position title (or a description), the sponsor's or recruiter's name, the skills
//   or experience needed, and the salary unless annual earnings are above $96,400
// Agents should confirm the current instrument before lodging; Lodgely's checks are a guide.

export const LMT_PLATFORMS = [
  { value: "workforce_australia", label: "Workforce Australia" },
  { value: "seek", label: "SEEK" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "indeed", label: "Indeed" },
  { value: "jora", label: "Jora" },
  { value: "careerone", label: "CareerOne" },
  { value: "press", label: "Print or online newspaper" },
  { value: "professional", label: "Industry or professional association" },
  { value: "other", label: "Other national site" },
] as const;

export const platformLabel = (v: string) => LMT_PLATFORMS.find((p) => p.value === v)?.label ?? v;

/** Programs that need labour market testing unless an exemption applies. */
export const LMT_PROGRAMS = ["482_core", "482_specialist", "482_essential", "494"];
export const SALARY_DISCLOSURE_THRESHOLD = 96400;
export const MIN_AD_DAYS = 28;
export const VALID_MONTHS = 6;

export const LMT_EXEMPTIONS = [
  "International trade obligation (citizen of a country with a free trade agreement, e.g. Japan, Thailand, Chile, China, Korea)",
  "International trade obligation (current employee of an associated entity in a WTO member country)",
  "Labour agreement term",
  "Other exemption under the instrument",
];

export type LmtAd = { id: string; platform: string; adTitle: string; url: string | null; publishedOn: string; endsOn: string | null; showsTitle: boolean; showsEmployer: boolean; showsSkills: boolean; showsSalary: boolean; applicants: number | null; evidence: { name: string; key: string; size: number; type: string }[]; notes: string | null };

const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const daysOpen = (a: { publishedOn: string; endsOn: string | null }, today: string) => Math.round((day(a.endsOn && a.endsOn < today ? a.endsOn : today) - day(a.publishedOn)) / 864e5);
export function addMonths(d: string, months: number) {
  const x = new Date(day(d));
  x.setUTCMonth(x.getUTCMonth() + months);
  return iso(x.getTime());
}
const addDays = (d: string, n: number) => iso(day(d) + n * 864e5);

export type LmtCheck = { ok: boolean; label: string; detail: string };

/** Whether one ad meets the content rules, and why not. */
export function adProblems(a: LmtAd, salary: number | null) {
  const out: string[] = [];
  if (!a.showsTitle) out.push("doesn't show the position title");
  if (!a.showsEmployer) out.push("doesn't name the sponsor or recruiter");
  if (!a.showsSkills) out.push("doesn't describe the skills or experience");
  if (!a.showsSalary && (salary == null || salary <= SALARY_DISCLOSURE_THRESHOLD)) out.push(salary == null ? "doesn't show the salary (needed unless it's above $96,400)" : "doesn't show the salary (needed at this salary)");
  if (!a.evidence.length) out.push("no evidence uploaded yet");
  return out;
}

/**
 * Checks the ads against the rules for a nomination lodged on `lodgeOn` (or today, if not yet lodged).
 * Returns each check, whether testing is complete, when the 4 weeks finish, and the last day to lodge.
 */
export function assessLmt(ads: LmtAd[], opts: { salary: number | null; lodgeOn: string | null; today: string }) {
  const at = opts.lodgeOn ?? opts.today;
  const window = addMonths(at, -VALID_MONTHS);
  const inWindow = ads.filter((a) => a.publishedOn >= window && a.publishedOn <= at);
  const full = inWindow.filter((a) => daysOpen(a, at) >= MIN_AD_DAYS);
  const content = full.filter((a) => adProblems(a, opts.salary).length === 0);
  const wa = content.filter((a) => a.platform === "workforce_australia");
  const checks: LmtCheck[] = [
    { ok: inWindow.length >= 2, label: "At least two ads", detail: `${inWindow.length} placed within the 6 months before ${opts.lodgeOn ? "lodgement" : "today"}.` },
    { ok: inWindow.some((a) => a.platform === "workforce_australia"), label: "One on Workforce Australia", detail: "The Workforce Australia jobs board is required for one of the ads." },
    { ok: full.length >= 2, label: "Each open for at least 4 weeks", detail: inWindow.length ? inWindow.map((a) => `${platformLabel(a.platform)}: ${Math.max(0, daysOpen(a, at))} days`).join(" · ") : "No ads yet." },
    { ok: inWindow.length > 0 && inWindow.every((a) => adProblems(a, opts.salary).length === 0), label: "Ad content and evidence", detail: inWindow.flatMap((a) => adProblems(a, opts.salary).map((p) => `${platformLabel(a.platform)} ${p}`)).join("; ") || (inWindow.length ? "Title, sponsor, skills and salary shown, with evidence on file." : "No ads yet.") },
  ];
  const complete = wa.length >= 1 && content.length >= 2;
  // Four weeks finish: when the second ad (including the Workforce Australia one) reaches 28 days.
  const finish = inWindow.length ? inWindow.map((a) => addDays(a.publishedOn, MIN_AD_DAYS)).sort()[Math.min(1, inWindow.length - 1)] : null;
  // Lodge by: 6 months after the oldest ad in the qualifying pair (newest Workforce Australia ad plus newest other).
  let lodgeBy: string | null = null;
  if (complete) {
    const w = [...wa].sort((x, y) => y.publishedOn.localeCompare(x.publishedOn))[0];
    const other = content.filter((a) => a.id !== w.id).sort((x, y) => y.publishedOn.localeCompare(x.publishedOn))[0];
    lodgeBy = addMonths(w.publishedOn < other.publishedOn ? w.publishedOn : other.publishedOn, VALID_MONTHS);
  }
  return { checks, complete, finish, lodgeBy };
}
