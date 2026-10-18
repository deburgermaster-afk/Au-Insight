import { addDays, differenceInCalendarDays, parseISO } from "date-fns";
import { type Visa, visaByCode } from "@/lib/visas";

// A predicted, pre-scheduled timeline for a case: the usual milestones for its visa, dated from what
// has actually happened on the matter (engagement, agreement, lodgement, decision). Processing times
// are indicative [50%, 90%] figures in months; always check Home Affairs' global processing times.

const PROCESSING: Record<string, [number, number]> = {
  "189": [8, 18], "189-NZ": [10, 20], "190": [7, 14], "491": [8, 16], "191": [10, 20], "887": [9, 18], "476": [6, 12], "192": [6, 12], "124": [6, 12], "858": [3, 8],
  "482": [1, 3], "482-LA": [2, 5], "186": [6, 12], "187": [8, 16], "494": [6, 14], "407": [2, 4], "400": [0.3, 1], "408": [0.5, 2], "403": [1, 3], NOM: [1, 3], SBS: [0.5, 2],
  "500": [1, 3], "590": [1, 3], "485": [3, 8],
  "820/801": [12, 24], "309/100": [12, 27], "300": [14, 26], PI: [6, 12], "143": [72, 144], "173": [60, 120], "870": [3, 10], "103": [300, 360], "804": [300, 360], "864": [72, 144], "884": [60, 120],
  "101": [10, 24], "802": [10, 20], "102": [6, 12], "445": [6, 12], "117": [24, 48], "837": [24, 48], "114": [300, 360], "838": [300, 360], "115": [300, 360], "835": [300, 360], "116": [80, 120], "836": [80, 120], "461": [9, 18],
  "600": [0.5, 1.5], "601": [0, 0.1], "651": [0, 0.1], "602": [0.5, 1.5], "771": [0.2, 0.5], "988": [0.2, 0.5], "417": [0.1, 1], "462": [1, 3],
  "188": [24, 40], "888": [16, 28], "132": [24, 40],
  "866": [12, 40], "785": [12, 36], "790": [12, 36], "851": [2, 8], "200": [12, 36], "202": [12, 36], "449": [0.2, 1], "786": [3, 12], MIN: [6, 24],
  "010": [0, 0], "020": [0.2, 1], "030": [0, 0], "050/051": [0, 0.5], "070": [0.5, 2],
  CIT: [8, 14], "CIT-D": [4, 9], "CIT-E": [1, 3], ART: [12, 24], SA: [2, 4], "155/157": [0.5, 4], "151": [6, 12], "444": [0, 0], CANC: [1, 6],
};

export const processingMonths = (code: string): [number, number] => PROCESSING[code] ?? [3, 12];

type MatterLike = {
  visaCode: string;
  stage: string;
  createdAt: Date | string;
  agreementSignedAt: string | null;
  consumerGuideAt: string | null;
  lodgedAt: string | null;
  decisionAt: string | null;
  outcome: string | null;
  rfiDueAt: string | null;
};

export type Milestone = {
  key: string;
  label: string;
  detail: string;
  date: string; // ISO day, actual or predicted
  until?: string; // end of a predicted window
  status: "done" | "current" | "upcoming" | "overdue";
  actual: boolean;
};

const STAGE_ORDER = ["enquiry", "consultation", "engaged", "documents", "ready", "lodged", "rfi", "decision", "closed"];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (d: Date | string) => (typeof d === "string" ? parseISO(d.slice(0, 10)) : d);
const months = (n: number) => Math.round(n * 30.4);

/** Steps before lodgement that depend on the kind of visa: [label, detail, days after engagement]. */
function preLodgement(v: Visa | undefined): [string, string, number][] {
  const c = v?.code ?? "";
  if (["189", "190", "491"].includes(c))
    return [
      ["Skills assessment", "Assessing authority outcome for the nominated occupation (usually 8–12 weeks).", 75],
      ["English test", "Book and sit IELTS/PTE; aim for the score that maximises points.", 45],
      ["Expression of Interest", "Lodge the EOI in SkillSelect with every points claim evidenced.", 90],
      ...(c === "189" ? [] : ([["State nomination", "Apply to the state or territory once invited or eligible.", 130]] as [string, string, number][])),
      ["Invitation to apply", "Depends on points and occupation ceilings; predicted from recent rounds.", 180],
    ];
  if (["482", "186", "494", "187", "407", "482-LA"].includes(c))
    return [
      ["Sponsorship approved", "Standard Business Sponsorship (or labour agreement) in place.", 21],
      ["Nomination lodged", "Position, salary and labour market testing evidence filed.", 35],
      ["Nomination approved", "Usually decided before or with the visa.", 60],
    ];
  if (c === "500" || c === "590")
    return [
      ["Offer letter", "Course offer from the provider.", 14],
      ["Offer accepted, CoE issued", "Pay the deposit; the provider issues the Confirmation of Enrolment.", 30],
      ["OSHC and funds evidence", "Health cover for the full stay and financial capacity evidence.", 35],
      ["Genuine Student statement", "Written and checked against the GS criteria.", 40],
    ];
  if (["820/801", "309/100", "300"].includes(c))
    return [
      ["Relationship evidence", "Financial, household, social and commitment evidence gathered.", 30],
      ["Form 888 declarations", "Two or more supporting statements from citizens or PRs.", 40],
      ["Sponsor documents", "Sponsor's identity, status and police certificates.", 40],
    ];
  if (c === "485") return [["Completion letter", "Course completion and transcripts; apply within 6 months.", 7], ["English test", "Score required for the stream.", 21]];
  if (c === "CIT") return [["Residence calculator", "Confirm 4 years' residence and absence limits.", 7]];
  if (c === "ART") return [["Lodge within time limit", "Time limit runs from the decision notice.", 7]];
  return [];
}

/** After grant: what comes next on this pathway. [label, detail, days after decision]. */
function afterGrant(code: string): [string, string, number][] {
  switch (code) {
    case "820/801":
    case "309/100":
      return [["Permanent stage (801/100) assessment", "Eligible 2 years after the combined application was lodged; send updated relationship evidence.", 0]];
    case "491":
      return [["Eligible for 191 (PR)", "After 3 years living and working regionally with taxable income evidence.", 365 * 3]];
    case "494":
      return [["Eligible for 191 (PR)", "After 3 years in the regional position.", 365 * 3]];
    case "482":
      return [["Eligible for 186 TRT", "After 2 years with the sponsor (occupation and age criteria).", 365 * 2]];
    case "500":
      return [["Course completion, 485 window", "Apply for the 485 within 6 months of completing.", 365 * 2]];
    case "485":
      return [["Visa expiry, plan PR pathway", "Lodge an EOI or nomination before the 485 ends.", 365 * 2]];
    case "189":
    case "190":
    case "186":
    case "191":
      return [["Citizenship eligibility", "4 years' lawful residence including 1 year as a PR.", 365 * 4]];
    case "300":
      return [["Marry and apply for 820/801", "Within 9 months of grant.", 270]];
    default:
      return [];
  }
}

/** The predicted timeline for a matter, with actual dates where known. */
/** live: Home Affairs' published [50%, 90%] in months, when available; otherwise Lodgely's indicative figures. */
export function predictTimeline(m: MatterLike, live?: { p50Months: number; p90Months: number } | null): Milestone[] {
  const v = visaByCode(m.visaCode);
  const [p50, p90] = live ? [live.p50Months, live.p90Months] : processingMonths(m.visaCode);
  const today = new Date();
  // A matter opened after work began (e.g. imported) starts at its earliest recorded date.
  const start = [m.agreementSignedAt, m.consumerGuideAt, m.lodgedAt].filter((d): d is string => Boolean(d)).map(day).reduce((a, b) => (b < a ? b : a), day(m.createdAt));
  const stageIdx = STAGE_ORDER.indexOf(m.stage);
  const out: Omit<Milestone, "status">[] = [];

  out.push({ key: "engaged", label: "Engagement", detail: "Consultation held and the case opened.", date: iso(start), actual: true });
  const agreed = m.agreementSignedAt ?? (stageIdx >= 2 ? null : null);
  out.push({ key: "agreement", label: "Service agreement and Consumer Guide", detail: "Signed agreement with fee estimate; Consumer Guide given.", date: agreed ?? iso(addDays(start, 7)), actual: Boolean(agreed) });

  const pre = preLodgement(v);
  const maxPre = Math.max(28, ...pre.map((x) => x[2]));
  const lodgedDay = m.lodgedAt ? day(m.lodgedAt) : null;
  // Once lodged, the steps before it happened before it: spread them between engagement and lodgement.
  const preDate = (d: number) => (lodgedDay ? addDays(start, Math.round((d / (maxPre + 21)) * Math.max(0, differenceInCalendarDays(lodgedDay, start)))) : addDays(start, d));
  for (const [label, detail, d] of pre) out.push({ key: `pre:${label}`, label, detail, date: iso(preDate(d)), actual: false });

  const docsDue = preDate(Math.max(28, maxPre - 14));
  out.push({ key: "documents", label: "Documents collected", detail: "Every checklist item received and checked.", date: iso(docsDue), actual: false });

  const lodged = m.lodgedAt ? day(m.lodgedAt) : null;
  const plannedLodge = addDays(start, maxPre + 21);
  const lodgeDate = lodged ?? (plannedLodge < today && stageIdx < 5 ? addDays(today, 14) : plannedLodge);
  out.push({ key: "lodged", label: "Application lodged", detail: "Lodged in ImmiAccount; TRN recorded and acknowledgement sent.", date: iso(lodgeDate), actual: Boolean(lodged) });

  const decided = m.decisionAt ? day(m.decisionAt) : null;
  if (p90 > 0.2) {
    const health = addDays(lodgeDate, 14);
    // After a decision these happened before it (or not at all).
    out.push({ key: "health", label: "Health checks and biometrics", detail: "HAP ID exams and biometrics if requested.", date: iso(decided && health > decided ? addDays(decided, -1) : health), actual: false });
    if (m.rfiDueAt) out.push({ key: "rfi", label: "Further information due", detail: "Respond to the Department's request by this date.", date: m.rfiDueAt, actual: true });
    else if (p50 >= 2 && !decided) out.push({ key: "rfi", label: "Possible request for more information", detail: "Many cases get one around the midpoint of processing.", date: iso(addDays(lodgeDate, months(p50 * 0.55))), actual: false });
  }

  out.push({
    key: "decision",
    label: decided ? `Decision${m.outcome ? `: ${m.outcome}` : ""}` : "Decision expected",
    detail: decided ? "Decision recorded on the matter." : p90 >= 0.2 ? `Half of applications are decided in about ${fmtMonths(p50)}, 90% in ${fmtMonths(p90)} (${live ? "Home Affairs' published times" : "indicative"}).` : "Usually decided within days.",
    date: iso(decided ?? addDays(lodgeDate, months(p50))),
    until: decided ? undefined : iso(addDays(lodgeDate, months(p90))),
    actual: Boolean(decided),
  });

  if (!decided || m.outcome === "granted") {
    const base = decided ?? addDays(lodgeDate, months(p50));
    for (const [label, detail, d] of afterGrant(m.visaCode)) {
      const date = m.visaCode === "820/801" || m.visaCode === "309/100" ? addDays(lodgeDate, 730) : addDays(base, d);
      out.push({ key: `post:${label}`, label, detail, date: iso(date), actual: false });
    }
  }

  // Status: actual dates are done; the first not-done milestone is current; past predicted ones are overdue.
  let currentSet = false;
  const doneByStage = (key: string) =>
    (key === "agreement" && Boolean(m.agreementSignedAt)) || (key === "documents" && stageIdx >= 4) || (key.startsWith("pre:") && stageIdx >= 4) || (key === "health" && (stageIdx >= 7 || (stageIdx >= 5 && past(key)))) || (key === "rfi" && !m.rfiDueAt && (stageIdx >= 7 || past(key)));
  const past = (key: string) => {
    const x = out.find((o) => o.key === key);
    return Boolean(x && differenceInCalendarDays(parseISO(x.date), today) < -21);
  };
  const sorted = out.sort((a, b) => a.date.localeCompare(b.date) || (a.actual ? -1 : 1));
  return sorted.map((x) => {
    const done = (x.actual && x.key !== "rfi") || doneByStage(x.key) || (x.key === "rfi" && m.rfiDueAt != null && stageIdx >= 7);
    if (done) return { ...x, status: "done" as const };
    const overdue = differenceInCalendarDays(parseISO(x.date), today) < 0 && !x.until;
    if (!currentSet) {
      currentSet = true;
      return { ...x, status: overdue ? ("overdue" as const) : ("current" as const) };
    }
    return { ...x, status: overdue ? ("overdue" as const) : ("upcoming" as const) };
  });
}

export function fmtMonths(n: number) {
  if (n < 1) return `${Math.max(1, Math.round(n * 30))} days`;
  if (n >= 24) return `${Math.round(n / 12)} years`;
  return `${Math.round(n)} month${Math.round(n) === 1 ? "" : "s"}`;
}
