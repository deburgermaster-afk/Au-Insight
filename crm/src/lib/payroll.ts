// Pay calculations for Australian employees. Withholding is estimated by annualising the pay and
// applying the 2026–27 resident rates (Stage 3, with the 15% bracket from 1 July 2026), the low
// income tax offset and the 2% Medicare levy, then dividing back. It's close to the ATO's PAYG
// tables but not identical: the payslip says so, and agencies should confirm before paying.

export type Frequency = "weekly" | "fortnightly" | "monthly";
export const periodsPerYear: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 };

const brackets: [number, number][] = [
  [18_200, 0],
  [45_000, 0.15],
  [135_000, 0.3],
  [190_000, 0.37],
  [Infinity, 0.45],
];

export function annualTax(income: number, taxFreeThreshold = true) {
  let tax = 0;
  let prev = 0;
  for (const [top, rate] of brackets) {
    const lo = taxFreeThreshold ? prev : prev === 0 ? 0 : prev;
    if (income > lo) tax += (Math.min(income, top) - lo) * (taxFreeThreshold || prev > 0 ? rate : Math.max(rate, 0.15));
    prev = top;
  }
  // Low income tax offset.
  let lito = 0;
  if (income <= 37_500) lito = 700;
  else if (income <= 45_000) lito = 700 - (income - 37_500) * 0.05;
  else if (income <= 66_667) lito = 325 - (income - 45_000) * 0.015;
  if (taxFreeThreshold) tax = Math.max(0, tax - lito);
  const medicare = income > 27_222 ? income * 0.02 : 0;
  return tax + medicare;
}

/** Ordinary hours give 4 weeks' annual leave and 10 days' personal leave a year (NES, 38h week). */
export const ANNUAL_PER_HOUR = 152 / 1976;
export const PERSONAL_PER_HOUR = 76 / 1976;

export function calcPay(input: {
  employment: string;
  payType: string;
  payRate: number;
  hoursPerWeek: number;
  superRate: number;
  taxFreeThreshold: boolean;
  frequency: Frequency;
  loggedHours: number | null;
}) {
  const n = periodsPerYear[input.frequency];
  const weeks = 52 / n;
  const standard = input.hoursPerWeek * weeks;
  const hours = input.payType === "hourly" ? (input.loggedHours ?? standard) : standard;
  const gross = input.payType === "hourly" ? hours * input.payRate : input.payRate / n;
  const lines = [
    input.payType === "hourly"
      ? { label: "Ordinary hours", hours: round(hours), rate: input.payRate, amount: round(gross) }
      : { label: "Salary", amount: round(gross) },
  ];
  if (input.employment === "contractor") {
    return { hours: round(hours), gross: round(gross), tax: 0, super: 0, net: round(gross), annual: 0, personal: 0, lines: [...lines, { label: "Contractor: invoices separately, no PAYG or super", amount: 0 }] };
  }
  const tax = Math.round(annualTax(gross * n, input.taxFreeThreshold) / n);
  const sup = round((gross * input.superRate) / 100);
  const casual = input.employment === "casual";
  return {
    hours: round(hours),
    gross: round(gross),
    tax,
    super: sup,
    net: round(gross - tax),
    annual: casual ? 0 : round(hours * ANNUAL_PER_HOUR),
    personal: casual ? 0 : round(hours * PERSONAL_PER_HOUR),
    lines,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;
