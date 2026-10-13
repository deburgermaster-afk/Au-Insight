// Single Touch Payroll Phase 2 reports. Builds the pay event (year-to-date figures per payee,
// broken down the way the ATO asks for them) and checks it before it goes to the ATO.
// Lodging needs software registered with the ATO: Lodgely hands the report to the agency's
// connected payroll (Employment Hero or Xero) or exports it for any registered STP solution.
import type { PayLine } from "@/db/crm-schema";
import { validAbn, validTfn } from "@/lib/payg";

export type StpPayer = {
  abn: string | null;
  branch: string;
  bmsId: string;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  address: { line1: string | null; suburb: string | null; state: string | null; postcode: string | null };
  declarationName: string | null;
};

export type StpPayee = {
  userId: string;
  payrollId: string;
  name: string;
  givenName: string | null;
  middleName: string | null;
  familyName: string | null;
  tfn: string | null;
  tfnStatus: string;
  dob: string | null;
  email: string | null;
  phone: string | null;
  address: { line1: string | null; line2: string | null; suburb: string | null; state: string | null; postcode: string | null; country: string | null };
  startDate: string | null;
  endDate: string | null;
  cessationType: string | null;
  employmentBasis: string;
  taxTreatment: string;
  incomeType: string;
  country: string | null;
  slips: { gross: number; tax: number; super: number; extraSuper: number; qualifying: number; lines: PayLine[] }[];
};

/** TFN values the ATO accepts in place of a real TFN. */
const TFN_STAND_INS: Record<string, string> = { none: "000000000", pending: "111111111", under18: "333333333", pensioner: "444444444" };

export function ytdFor(p: StpPayee) {
  const sum = (f: (l: PayLine) => boolean) => round(p.slips.reduce((a, s) => a + s.lines.filter(f).reduce((b, l) => b + l.amount, 0), 0));
  const byCode = (kind: PayLine["kind"]) => {
    const out: Record<string, number> = {};
    for (const s of p.slips) for (const l of s.lines) if (l.kind === kind) out[l.code ?? "O"] = round((out[l.code ?? "O"] ?? 0) + Math.abs(l.amount));
    return out;
  };
  // Payslips from before line categories existed have no kind: their lines are ordinary pay.
  const gross = sum((l) => !l.kind || l.kind === "ordinary" || l.kind === "casual_loading");
  const sacrificeS = round(p.slips.reduce((a, s) => a + s.lines.filter((l) => l.kind === "sacrifice_super").reduce((b, l) => b + Math.abs(l.amount), 0), 0));
  const sacrificeO = round(p.slips.reduce((a, s) => a + s.lines.filter((l) => l.kind === "sacrifice_other").reduce((b, l) => b + Math.abs(l.amount), 0), 0));
  return {
    // STP "Gross" excludes amounts reported separately (overtime, bonuses, allowances, leave) and is
    // reduced by salary sacrifice, which is reported on its own.
    gross: round(gross - sacrificeS - sacrificeO),
    paygw: round(p.slips.reduce((a, s) => a + s.tax, 0)),
    overtime: sum((l) => l.kind === "overtime"),
    bonuses: sum((l) => l.kind === "bonus"),
    paidLeave: byCode("leave"),
    allowances: byCode("allowance"),
    lumpSums: byCode("lump_sum"),
    salarySacrifice: { S: sacrificeS, O: sacrificeO },
    deductions: byCode("deduction"),
    superLiability: round(p.slips.reduce((a, s) => a + s.super, 0)),
    resc: round(p.slips.reduce((a, s) => a + s.extraSuper + s.lines.filter((l) => l.kind === "sacrifice_super").reduce((b, l) => b + Math.abs(l.amount), 0), 0)),
    ote: round(p.slips.reduce((a, s) => a + s.qualifying, 0) - sacrificeS),
  };
}

export function buildStp(input: { kind: "pay" | "update" | "finalisation"; financialYear: string; payDate: string; runAt: string; submissionId: string; payer: StpPayer; payees: StpPayee[]; periodGross?: number; periodTax?: number }) {
  const problems: { who: string; text: string }[] = [];
  const P = input.payer;
  if (!P.abn || !validAbn(P.abn)) problems.push({ who: "Agency", text: "Add a valid ABN (Settings → Agency profile)." });
  if (!P.contactName || !(P.contactEmail || P.contactPhone)) problems.push({ who: "Agency", text: "Add an STP contact person with an email or phone (Settings → Payroll)." });
  if (!P.address.postcode || !P.address.state) problems.push({ who: "Agency", text: "Add the business address with state and postcode (Settings → Payroll)." });
  if (!P.declarationName) problems.push({ who: "Agency", text: "Name the person who declares STP reports are true and correct (Settings → Payroll)." });

  const payees = input.payees.map((p) => {
    const who = p.name;
    const tfn = p.tfnStatus === "provided" ? p.tfn : (TFN_STAND_INS[p.tfnStatus] ?? "000000000");
    if (p.tfnStatus === "provided" && (!p.tfn || !validTfn(p.tfn))) problems.push({ who, text: "TFN is missing or fails the ATO check digit." });
    if (!p.givenName || !p.familyName) problems.push({ who, text: "Add legal first and family name." });
    if (!p.dob) problems.push({ who, text: "Add date of birth." });
    if (!p.address.line1 || !p.address.suburb || !p.address.state || !p.address.postcode) problems.push({ who, text: "Add a home address with suburb, state and postcode." });
    if (!p.startDate) problems.push({ who, text: "Add an employment start date." });
    if ((p.incomeType === "WHM" || p.incomeType === "FEI") && !p.country) problems.push({ who, text: "Add the home country (needed for working holiday makers and foreign employment)." });
    if (p.endDate && !p.cessationType) problems.push({ who, text: "Add why employment ended (cessation type)." });
    return {
      payrollId: p.payrollId,
      tfn,
      name: { given: p.givenName, other: p.middleName, family: p.familyName },
      dob: p.dob,
      address: p.address,
      email: p.email,
      phone: p.phone,
      employment: { startDate: p.startDate, cessationDate: p.endDate, cessationType: p.endDate ? p.cessationType : null, basis: p.employmentBasis, taxTreatment: p.taxTreatment },
      incomeStream: { type: p.incomeType, country: p.country, ytd: ytdFor(p) },
      finalEvent: input.kind === "finalisation",
    };
  });

  const payload = {
    standard: "STP Phase 2",
    event: { kind: input.kind, submissionId: input.submissionId, payOrUpdateDate: input.payDate, runAt: input.runAt, financialYear: input.financialYear, fullFileReplacement: false },
    payer: { abn: P.abn?.replace(/\D/g, "") ?? null, branch: P.branch, bmsId: P.bmsId, name: P.name, contact: { name: P.contactName, email: P.contactEmail, phone: P.contactPhone }, address: P.address },
    totals: { payees: payees.length, gross: round(input.periodGross ?? 0), paygw: round(input.periodTax ?? 0) },
    declaration: { name: P.declarationName, statement: "I declare the information in this report is true and correct, and I am authorised to make this declaration.", at: input.runAt },
    payees,
  };
  return { payload, problems };
}

/** A spreadsheet view of an STP report, for checking or uploading to another STP solution. */
export function stpCsv(payload: ReturnType<typeof buildStp>["payload"]) {
  const head = ["Payroll ID", "TFN", "Given name", "Family name", "Date of birth", "Basis", "Tax treatment", "Income type", "Gross", "PAYGW", "Overtime", "Bonuses", "Allowances", "Paid leave", "Salary sacrifice (super)", "Salary sacrifice (other)", "Deductions", "Super liability", "RESC", "OTE", "Cessation"];
  const total = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} ${v.toFixed(2)}`).join("; ");
  const rows = payload.payees.map((p) => {
    const y = p.incomeStream.ytd;
    return [p.payrollId, mask(p.tfn), p.name.given, p.name.family, p.dob, p.employment.basis, p.employment.taxTreatment, p.incomeStream.type, y.gross, y.paygw, y.overtime, y.bonuses, total(y.allowances), total(y.paidLeave), y.salarySacrifice.S, y.salarySacrifice.O, total(y.deductions), y.superLiability, y.resc, y.ote, p.employment.cessationDate ? `${p.employment.cessationDate} ${p.employment.cessationType}` : ""];
  });
  return [head, ...rows].map((r) => r.map((c) => csvCell(c)).join(",")).join("\n");
}

export const mask = (tfn: string | null) => (!tfn ? "" : Object.values(TFN_STAND_INS).includes(tfn) ? tfn : `••• ••• ${tfn.slice(-3)}`);
const csvCell = (c: unknown) => {
  const s = c == null ? "" : typeof c === "number" ? c.toFixed(2) : String(c);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const round = (v: number) => Math.round(v * 100) / 100;
