// Builds one payslip from an employee's profile, the hours they worked and any lines added by hand.
// Tax and super come from payg.ts (ATO 2026–27); each line keeps the category STP reports it under.
import type { PayLine } from "@/db/crm-schema";
import { ageOn, type Frequency, periodsPerYear, round2, RULES, superDue, superGuarantee, type TaxProfile, withhold } from "@/lib/payg";

export { type Frequency, periodsPerYear } from "@/lib/payg";

/** Ordinary hours give 4 weeks' annual leave and 10 days' personal leave a year (NES, 38h week). */
export const ANNUAL_PER_HOUR = 152 / 1976;
export const PERSONAL_PER_HOUR = 76 / 1976;

export type PayProfile = {
  employment: string;
  payType: string;
  payRate: number;
  hoursPerWeek: number;
  superRate: number;
  extraSuperRate?: number;
  salarySacrificeSuper?: number;
  dob?: string | null;
  classificationRate?: number | null;
  tax: TaxProfile;
};

export type Slip = {
  hours: number;
  gross: number;
  taxable: number;
  tax: number;
  stsl: number;
  super: number;
  extraSuper: number;
  sacrifice: number;
  deductions: number;
  qualifying: number;
  net: number;
  annual: number;
  personal: number;
  lines: PayLine[];
  scale: string;
  scaleLabel: string;
  superDue: string;
  notes: string[];
};

/** Hourly equivalent of a profile's pay, for award and minimum wage checks. */
export function hourlyOf(p: { payType: string; payRate: number; hoursPerWeek: number }) {
  return p.payType === "hourly" ? p.payRate : p.payRate / 52 / Math.max(1, p.hoursPerWeek);
}

export function calcSlip(
  p: PayProfile,
  opts: { frequency: Frequency; payDate: string; loggedHours: number | null; extras?: PayLine[]; ytdGross?: number; ytdQualifying?: number },
): Slip {
  const n = periodsPerYear[opts.frequency];
  const weeks = 52 / n;
  const standard = p.hoursPerWeek * weeks;
  const casual = p.employment === "casual";
  const hourly = p.payType === "hourly";
  const hours = hourly ? (opts.loggedHours ?? (casual ? 0 : standard)) : standard;
  const notes: string[] = [];
  const lines: PayLine[] = [];

  if (hourly) {
    lines.push({ label: casual ? "Ordinary hours (casual)" : "Ordinary hours", kind: "ordinary", hours: round2(hours), rate: p.payRate, amount: round2(hours * p.payRate), ote: true });
    if (casual && p.classificationRate) {
      // Casual rate entered as the base: add the award's 25% loading only when the rate is below base + loading.
      const loaded = p.classificationRate * (1 + RULES.casualLoading / 100);
      if (p.payRate < loaded - 0.005) notes.push(`Casual rate $${p.payRate.toFixed(2)} is below the award rate plus 25% loading ($${loaded.toFixed(2)}).`);
    }
  } else {
    lines.push({ label: "Salary", kind: "ordinary", amount: round2(p.payRate / n), ote: true });
  }

  const rate = hourlyOf(p);
  const floor = casual ? RULES.nationalMinimumHourly * (1 + RULES.casualLoading / 100) : RULES.nationalMinimumHourly;
  if (p.employment !== "contractor" && rate > 0 && rate < floor - 0.005) notes.push(`Pays $${rate.toFixed(2)} an hour, below the national minimum wage of $${floor.toFixed(2)}${casual ? " (with casual loading)" : ""} from 1 July 2026.`);
  if (p.classificationRate && !casual && rate < p.classificationRate - 0.005) notes.push(`Below the award classification rate of $${p.classificationRate.toFixed(2)} an hour.`);

  for (const x of opts.extras ?? []) lines.push(x);

  if (p.employment === "contractor") {
    const gross = round2(lines.reduce((a, l) => a + (isEarning(l) ? l.amount : 0), 0));
    return { hours: round2(hours), gross, taxable: gross, tax: 0, stsl: 0, super: 0, extraSuper: 0, sacrifice: 0, deductions: 0, qualifying: 0, net: gross, annual: 0, personal: 0, lines: [...lines, { label: "Contractor: invoices separately, no PAYG or super", kind: "note", amount: 0 }], scale: "-", scaleLabel: "Contractor", superDue: opts.payDate, notes };
  }

  if (p.salarySacrificeSuper && p.salarySacrificeSuper > 0 && !(opts.extras ?? []).some((l) => l.kind === "sacrifice_super")) {
    lines.push({ label: "Salary sacrifice to super", kind: "sacrifice_super", amount: -Math.abs(p.salarySacrificeSuper), code: "S" });
  }

  const gross = round2(lines.reduce((a, l) => a + (isEarning(l) ? l.amount : 0), 0));
  const sacrificeSuper = round2(lines.filter((l) => l.kind === "sacrifice_super").reduce((a, l) => a + Math.abs(l.amount), 0));
  const sacrificeOther = round2(lines.filter((l) => l.kind === "sacrifice_other").reduce((a, l) => a + Math.abs(l.amount), 0));
  const sacrifice = round2(sacrificeSuper + sacrificeOther);
  const taxable = round2(Math.max(0, gross - sacrifice));
  const deductions = round2(lines.filter((l) => l.kind === "deduction").reduce((a, l) => a + Math.abs(l.amount), 0));

  // Lump sums and bonuses paid with the regular pay are taxed with it here (method A for bonuses is a
  // simplification the payslip notes).
  const w = withhold(taxable, opts.frequency, p.tax, opts.ytdGross ?? 0);
  if (!p.tax.tfnProvided) notes.push("No TFN declaration: tax is withheld at the no-TFN rate (47% for residents). They can complete it in Me → Payroll details.");
  if (lines.some((l) => l.kind === "bonus" || l.kind === "lump_sum")) notes.push("Bonus taxed with this pay's regular earnings. Check Schedule 5 if it was earned over several periods.");

  // Qualifying earnings for super = ordinary time earnings plus salary sacrificed to super. Earnings lines
  // are before sacrifice, so their OTE total already includes the sacrificed amount.
  const ote = round2(lines.filter((l) => isEarning(l) && (l.ote ?? defaultOte(l))).reduce((a, l) => a + l.amount, 0));
  const qualifying = ote;
  const age = ageOn(p.dob, opts.payDate);
  const sg = superGuarantee(qualifying, { rate: Math.max(p.superRate, RULES.sgRate), ytdQualifying: opts.ytdQualifying, age, hoursPerWeek: p.hoursPerWeek });
  if (sg.note) notes.push(sg.note);
  const extraSuper = p.extraSuperRate ? round2((ote * p.extraSuperRate) / 100) : 0;

  const leaveHours = lines.filter((l) => l.kind === "leave").reduce((a, l) => a + (l.hours ?? 0), 0);
  const accrualHours = casual ? 0 : (hourly ? hours : standard) + leaveHours;
  return {
    hours: round2(hours),
    gross,
    taxable,
    tax: w.tax,
    stsl: w.stsl,
    super: sg.amount,
    extraSuper,
    sacrifice,
    deductions,
    qualifying,
    net: round2(taxable - w.tax - deductions),
    annual: round2(accrualHours * ANNUAL_PER_HOUR),
    personal: round2(accrualHours * PERSONAL_PER_HOUR),
    lines,
    scale: w.scale.code,
    scaleLabel: w.scale.label,
    superDue: superDue(opts.payDate),
    notes,
  };
}

const EARNINGS = new Set<PayLine["kind"]>(["ordinary", "casual_loading", "overtime", "allowance", "bonus", "leave", "lump_sum"]);
export const isEarning = (l: PayLine) => EARNINGS.has(l.kind);

/** Overtime and expense-type allowances (car, travel, meals) aren't ordinary time earnings. */
function defaultOte(l: PayLine) {
  if (l.kind === "overtime" || l.kind === "lump_sum") return false;
  if (l.kind === "allowance") return !["CD", "RD", "MD", "AD"].includes(l.code ?? "");
  return true;
}

/** STP Phase 2 tax treatment code (6 characters). */
export function taxTreatment(t: TaxProfile) {
  if (!t.tfnProvided) return t.residency === "resident" ? "NAXXXX" : "NFXXXX";
  if (t.residency === "whm") return t.whmRegistered ? "HRXXXX" : "HUXXXX";
  if (t.residency === "foreign") return `FF${t.stsl ? "S" : "X"}XXX`;
  const med = t.medicareExemption === "full" ? "F" : t.medicareExemption === "half" ? "H" : "X";
  return `R${t.taxFreeThreshold ? "T" : "N"}${t.stsl ? "S" : "X"}X${med}X`;
}

/** STP employment basis code. */
export function employmentBasis(employment: string) {
  return ({ full_time: "F", part_time: "P", casual: "C", contractor: "V" } as Record<string, string>)[employment] ?? "F";
}

export const ALLOWANCE_CODES: { code: string; label: string; ote: boolean }[] = [
  { code: "KN", label: "Task (e.g. first aid)", ote: true },
  { code: "QN", label: "Qualification or certification", ote: true },
  { code: "TD", label: "Tools", ote: true },
  { code: "LD", label: "Laundry", ote: true },
  { code: "CD", label: "Cents per kilometre", ote: false },
  { code: "AD", label: "Award transport", ote: false },
  { code: "MD", label: "Overtime meals", ote: false },
  { code: "RD", label: "Travel and accommodation", ote: false },
  { code: "OD", label: "Other", ote: true },
];

export const LEAVE_CODES: { code: string; label: string }[] = [
  { code: "O", label: "Annual, personal or other paid leave" },
  { code: "C", label: "Cash out of leave in service" },
  { code: "U", label: "Unused leave on termination" },
  { code: "P", label: "Paid parental leave" },
  { code: "W", label: "Workers' compensation" },
  { code: "A", label: "Ancillary and defence leave" },
];

export const DEDUCTION_CODES: { code: string; label: string }[] = [
  { code: "F", label: "Union or professional association fees" },
  { code: "W", label: "Workplace giving" },
  { code: "G", label: "Child support garnishee" },
  { code: "D", label: "Child support deduction" },
];

export const INCOME_TYPES: { code: string; label: string }[] = [
  { code: "SAW", label: "Salary and wages" },
  { code: "WHM", label: "Working holiday maker" },
  { code: "FEI", label: "Foreign employment income" },
  { code: "CHP", label: "Closely held payee" },
  { code: "IAA", label: "Inbound assignee to Australia" },
  { code: "SWP", label: "Seasonal worker programme" },
  { code: "LAB", label: "Labour hire" },
  { code: "VOL", label: "Voluntary agreement" },
  { code: "OSP", label: "Other specified payments" },
  { code: "JPD", label: "Joint petroleum development area" },
];

export const CESSATION_TYPES: { code: string; label: string }[] = [
  { code: "V", label: "Voluntary (resigned or retired)" },
  { code: "I", label: "Ill health" },
  { code: "D", label: "Deceased" },
  { code: "R", label: "Redundancy" },
  { code: "F", label: "Dismissal" },
  { code: "C", label: "Contract ended" },
  { code: "T", label: "Transfer to another payroll" },
];

/** Default pay period after the last one, from the agency's pay calendar. */
export function nextPeriod(start: string, frequency: Frequency, lagDays: number) {
  const d = new Date(`${start}T00:00:00Z`);
  const end = new Date(d);
  if (frequency === "monthly") {
    end.setUTCMonth(end.getUTCMonth() + 1);
    end.setUTCDate(end.getUTCDate() - 1);
  } else end.setUTCDate(end.getUTCDate() + (frequency === "weekly" ? 6 : 13));
  const pay = new Date(end);
  pay.setUTCDate(pay.getUTCDate() + lagDays);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  const following = new Date(end);
  following.setUTCDate(following.getUTCDate() + 1);
  return { periodStart: iso(d), periodEnd: iso(end), payDate: iso(pay), next: iso(following) };
}
