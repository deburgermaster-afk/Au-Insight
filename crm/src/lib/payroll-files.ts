// Files payroll hands to other systems: the bank (ABA direct entry), the super clearing house
// (contribution file with SuperStream fields) and the accountant (journal).

const pad = (s: string, n: number) => s.slice(0, n).padEnd(n, " ");
const num = (v: number, n: number) => String(Math.round(v)).padStart(n, "0").slice(-n);
const bsb = (b: string) => {
  const d = b.replace(/\D/g, "");
  return `${d.slice(0, 3)}-${d.slice(3, 6)}`;
};
const clean = (s: string) => s.toUpperCase().replace(/[^A-Z0-9 &'().,\-/+]/g, " ");

/** ABA (Cemtex) direct entry file: one credit per employee, net pay. Every record is 120 characters. */
export function abaFile(input: {
  bank: string;
  userName: string;
  apcaId: string;
  description: string;
  processDate: string; // YYYY-MM-DD
  from: { bsb: string; account: string; name: string };
  payments: { bsb: string; account: string; name: string; amount: number; reference: string }[];
}) {
  const [y, m, d] = input.processDate.split("-");
  const lines: string[] = [];
  lines.push(["0", " ".repeat(17), "01", pad(clean(input.bank), 3), " ".repeat(7), pad(clean(input.userName), 26), num(Number(input.apcaId), 6), pad(clean(input.description), 12), `${d}${m}${y.slice(2)}`, " ".repeat(40)].join(""));
  let total = 0;
  for (const p of input.payments) {
    const cents = Math.round(p.amount * 100);
    total += cents;
    lines.push(
      [
        "1",
        bsb(p.bsb),
        p.account.replace(/\D/g, "").slice(0, 9).padStart(9, " "),
        " ",
        "53",
        num(cents, 10),
        pad(clean(p.name), 32),
        pad(clean(p.reference), 18),
        bsb(input.from.bsb),
        input.from.account.replace(/\D/g, "").slice(0, 9).padStart(9, " "),
        pad(clean(input.from.name), 16),
        "00000000",
      ].join(""),
    );
  }
  lines.push(["7", "999-999", " ".repeat(12), num(total, 10), num(total, 10), num(0, 10), " ".repeat(24), num(input.payments.length, 6), " ".repeat(40)].join(""));
  return lines.join("\r\n") + "\r\n";
}

const csvCell = (c: unknown) => {
  const s = c == null ? "" : typeof c === "number" ? c.toFixed(2) : String(c);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: unknown[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\n");

export type ContributionRow = {
  payrollId: string;
  givenName: string | null;
  familyName: string | null;
  dob: string | null;
  gender: string | null;
  tfn: string | null;
  address: { line1: string | null; suburb: string | null; state: string | null; postcode: string | null };
  email: string | null;
  phone: string | null;
  startDate: string | null;
  fund: { type: string; name: string | null; usi: string | null; abn: string | null; member: string | null; esa?: string | null; bsb?: string | null; account?: string | null };
  periodStart: string;
  periodEnd: string;
  sg: number;
  sacrifice: number;
  extra: number;
};

/** Contribution file with the fields SuperStream needs, ready to upload or key into a clearing house. */
export function contributionCsv(employer: { abn: string | null; name: string }, rows: ContributionRow[]) {
  const head = [
    "Employer ABN",
    "Employer name",
    "Payroll ID",
    "Family name",
    "Given name",
    "Date of birth",
    "Gender",
    "TFN",
    "Address",
    "Suburb",
    "State",
    "Postcode",
    "Email",
    "Phone",
    "Employment start",
    "Fund name",
    "Fund ABN",
    "Fund USI",
    "Member number",
    "SMSF electronic service address",
    "SMSF BSB",
    "SMSF account",
    "Pay period start",
    "Pay period end",
    "Super guarantee",
    "Salary sacrifice",
    "Employer additional",
    "Total",
  ];
  return toCsv([
    head,
    ...rows.map((r) => [
      employer.abn?.replace(/\D/g, ""),
      employer.name,
      r.payrollId,
      r.familyName,
      r.givenName,
      r.dob,
      r.gender,
      r.tfn,
      r.address.line1,
      r.address.suburb,
      r.address.state,
      r.address.postcode,
      r.email,
      r.phone,
      r.startDate,
      r.fund.name,
      r.fund.abn,
      r.fund.usi,
      r.fund.member,
      r.fund.esa,
      r.fund.bsb,
      r.fund.account,
      r.periodStart,
      r.periodEnd,
      r.sg,
      r.sacrifice,
      r.extra,
      r.sg + r.sacrifice + r.extra,
    ]),
  ]);
}

/** Double-entry journal for a pay run, for Xero, MYOB, QuickBooks or the accountant. */
export function journalRows(run: { payDate: string; periodStart: string; periodEnd: string }, totals: { gross: number; tax: number; super: number; net: number; sacrifice: number; sacrificeOther: number; deductions: number }, accounts: { wages: string; super: string }) {
  const memo = `Payroll ${run.periodStart} to ${run.periodEnd}`;
  const rows: { account: string; debit: number; credit: number; memo: string }[] = [
    { account: accounts.wages, debit: totals.gross, credit: 0, memo },
    { account: accounts.super, debit: totals.super, credit: 0, memo },
    { account: "PAYG withholding payable", debit: 0, credit: totals.tax, memo },
    { account: "Superannuation payable", debit: 0, credit: totals.super + totals.sacrifice, memo },
    { account: "Wages payable", debit: 0, credit: totals.net, memo },
  ];
  if (totals.sacrificeOther) rows.push({ account: "Salary sacrifice payable", debit: 0, credit: totals.sacrificeOther, memo });
  if (totals.deductions) rows.push({ account: "Payroll deductions payable", debit: 0, credit: totals.deductions, memo });
  // Salary sacrificed to super is part of gross wages expense; it is owed to the fund, not the employee.
  const diff = Math.round((rows.reduce((a, r) => a + r.debit - r.credit, 0)) * 100) / 100;
  if (Math.abs(diff) >= 0.01) rows.push({ account: "Payroll clearing", debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo });
  return rows.filter((r) => r.debit || r.credit).map((r) => ({ ...r, date: run.payDate }));
}

export function journalCsv(rows: ReturnType<typeof journalRows>) {
  return toCsv([["Date", "Account", "Debit", "Credit", "Description"], ...rows.map((r) => [r.date, r.account, r.debit || "", r.credit || "", r.memo])]);
}
