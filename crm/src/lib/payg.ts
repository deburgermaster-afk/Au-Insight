// Australian pay rules for 2026–27, kept in one place so they can be updated each 1 July.
//
// PAYG withholding follows the ATO's Schedule 1 (NAT 1004, payments from 1 July 2026, LI 2026/18):
// weekly formula y = a·x − b where x is the weekly equivalent rounded down to the dollar plus 99
// cents, and Schedule 8 for study and training support loans (repayment threshold $69,528).
// Checked against the ATO's published 2026–27 examples (weekly $500/$932/$1,000/$1,500/$2,000,
// fortnightly $1,000/$3,000, monthly $2,000/$6,500 on scales 1 and 2). Scales 5 and 6 are scale 2 with
// the Medicare levy removed or halved, as the ATO builds them.
//
// Super guarantee is 12% of qualifying earnings. Payday Super (from 1 July 2026) means it must reach
// the fund within 7 days of each payday, and stops once qualifying earnings reach the annual maximum
// contribution base ($270,830 for 2026–27).

export const RULES = {
  year: "2026–27",
  from: "2026-07-01",
  to: "2027-06-30",
  sgRate: 12,
  maxContributionBase: 270_830,
  superDueDays: 7,
  nationalMinimumHourly: 26.44,
  nationalMinimumWeekly: 1004.9,
  casualLoading: 25,
  stslThreshold: 69_528,
  whmFirstBand: 45_000,
  sources: [
    { label: "ATO Schedule 1: Statement of formulas for calculating amounts to be withheld", url: "https://www.ato.gov.au/tax-rates-and-codes/payg-withholding-schedule-1-statement-of-formulas-for-calculating-amounts-to-be-withheld" },
    { label: "ATO Schedule 8: Study and training support loans components", url: "https://www.ato.gov.au/tax-rates-and-codes/schedule-8-statement-of-formulas-for-calculating-study-and-training-support-loans-components" },
    { label: "ATO Payday Super", url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super" },
    { label: "ATO maximum contributions base", url: "https://www.ato.gov.au/businesses-and-organisations/super-for-employers/payday-super/paying-super-on-payday/what-payments-are-qualifying-earnings/maximum-contributions-base" },
    { label: "Fair Work Commission Annual Wage Review 2025–26", url: "https://www.fwc.gov.au/hearings-decisions/major-cases/annual-wage-reviews" },
  ],
} as const;

export type Frequency = "weekly" | "fortnightly" | "monthly";
export const periodsPerYear: Record<Frequency, number> = { weekly: 52, fortnightly: 26, monthly: 12 };

/** [weekly earnings less than, a, b]; the last row has no upper limit. */
type Coeffs = [number, number, number][];

const SCALE_1: Coeffs = [
  [188, 0.15, 0.15],
  [371, 0.2084, 11.0185],
  [515, 0.179, 0.1066],
  [932, 0.3227, 74.1674],
  [2246, 0.32, 71.6508],
  [3303, 0.39, 228.8816],
  [Infinity, 0.47, 493.1893],
];

const SCALE_2: Coeffs = [
  [362, 0, 0],
  [538, 0.15, 54.3462],
  [673, 0.25, 108.2135],
  [721, 0.17, 54.3473],
  [865, 0.179, 60.8377],
  [1282, 0.3227, 185.1935],
  [2596, 0.32, 181.7319],
  [3653, 0.39, 363.4627],
  [Infinity, 0.47, 655.7704],
];

const SCALE_3: Coeffs = [
  [2596, 0.3, 0.3],
  [3653, 0.37, 181.7308],
  [Infinity, 0.45, 474.0385],
];

// Full Medicare exemption: scale 2 without the levy (no shade-in, 2% off the rate above it).
const SCALE_5: Coeffs = [
  [362, 0, 0],
  [721, 0.15, 54.3462],
  [865, 0.159, 60.8377],
  [1282, 0.3027, 185.1935],
  [2596, 0.3, 181.7319],
  [3653, 0.37, 363.4627],
  [Infinity, 0.45, 655.7704],
];

// Half Medicare exemption: half the levy, shaded in at 10c in the dollar until it reaches 1%.
const SCALE_6: Coeffs = [
  [362, 0, 0],
  [538, 0.15, 54.3462],
  [598, 0.25, 108.2135],
  [721, 0.16, 54.3462],
  [865, 0.169, 60.8377],
  [1282, 0.3127, 185.1935],
  [2596, 0.31, 181.7319],
  [3653, 0.38, 363.4627],
  [Infinity, 0.46, 655.7704],
];

export type Residency = "resident" | "foreign" | "whm";
export type Medicare = "none" | "full" | "half";

/** What the employee told the agency on their TFN declaration (and Medicare variation). */
export type TaxProfile = {
  tfnProvided: boolean;
  residency: Residency;
  taxFreeThreshold: boolean;
  stsl: boolean;
  medicareExemption: Medicare;
  /** Extra withholding the employee asked for each pay. */
  extraWithholding?: number;
  /** Agency is registered with the ATO as a working holiday maker employer. */
  whmRegistered?: boolean;
};

export type Scale = { code: string; label: string };

export function scaleFor(t: TaxProfile): Scale {
  if (!t.tfnProvided) return { code: "4", label: t.residency === "resident" ? "No TFN (resident) · 47%" : "No TFN (foreign resident) · 45%" };
  if (t.residency === "whm") return t.whmRegistered ? { code: "WHM", label: "Working holiday maker · 15% to $45,000" } : { code: "3", label: "Working holiday maker, employer not registered · foreign resident rates" };
  if (t.residency === "foreign") return { code: "3", label: "Foreign resident" };
  if (!t.taxFreeThreshold) return { code: "1", label: "Tax-free threshold not claimed" };
  if (t.medicareExemption === "full") return { code: "5", label: "Tax-free threshold · full Medicare exemption" };
  if (t.medicareExemption === "half") return { code: "6", label: "Tax-free threshold · half Medicare exemption" };
  return { code: "2", label: "Tax-free threshold claimed" };
}

const tables: Record<string, Coeffs> = { "1": SCALE_1, "2": SCALE_2, "3": SCALE_3, "5": SCALE_5, "6": SCALE_6 };

function weekly(table: Coeffs, x: number) {
  const row = table.find(([lt]) => Math.floor(x) < lt) ?? table[table.length - 1];
  return row[1] * x - row[2];
}

/** STSL repayment on an annual repayment income, marginal system from 1 July 2025 (2026–27 thresholds). */
export function stslAnnual(income: number) {
  if (income <= RULES.stslThreshold) return 0;
  if (income <= 129_717) return 0.15 * (income - RULES.stslThreshold);
  if (income <= 186_050) return 9028 + 0.17 * (income - 129_717);
  return 0.1 * income;
}

/** Weekly STSL component. Without the tax-free threshold the ATO assumes $18,200 of other income. */
function stslWeekly(x: number, t: TaxProfile) {
  const adj = t.residency === "resident" && !t.taxFreeThreshold ? 350 : 0;
  return stslAnnual((x + adj) * 52) / 52;
}

/** Converts a pay to its weekly equivalent per Schedule 1, before adding 99 cents. */
function weeklyEquivalent(gross: number, f: Frequency) {
  if (f === "weekly") return Math.floor(gross);
  if (f === "fortnightly") return Math.floor(gross / 2);
  const cents = Math.round((gross % 1) * 100);
  return Math.floor(((cents === 33 ? gross + 0.01 : gross) * 3) / 13);
}

function fromWeekly(w: number, f: Frequency) {
  if (f === "weekly") return w;
  if (f === "fortnightly") return w * 2;
  return Math.round((w * 13) / 3);
}

export type Withholding = { tax: number; scale: Scale; stsl: number; base: number };

/**
 * PAYG to withhold from one regular pay. `ytdGross` (before this pay) is only used for
 * working holiday makers, whose rate depends on what they've earned this year.
 */
export function withhold(gross: number, f: Frequency, t: TaxProfile, ytdGross = 0): Withholding {
  const scale = scaleFor(t);
  const extra = Math.max(0, Math.round(t.extraWithholding ?? 0));
  if (gross <= 0) return { tax: 0, scale, stsl: 0, base: 0 };
  if (scale.code === "4") {
    const tax = Math.floor(Math.floor(gross) * (t.residency === "resident" ? 0.47 : 0.45));
    return { tax: tax + extra, scale, stsl: 0, base: tax };
  }
  if (scale.code === "WHM") {
    // Schedule 15: 15% up to $45,000 a year, then foreign resident marginal rates, on year-to-date earnings.
    const bands: [number, number][] = [
      [RULES.whmFirstBand, 0.15],
      [135_000, 0.3],
      [190_000, 0.37],
      [Infinity, 0.45],
    ];
    const taxOn = (amount: number) => {
      let tax = 0;
      let lo = 0;
      for (const [hi, r] of bands) {
        if (amount > lo) tax += (Math.min(amount, hi) - lo) * r;
        lo = hi;
      }
      return tax;
    };
    const base = Math.floor(taxOn(ytdGross + Math.floor(gross)) - taxOn(ytdGross));
    return { tax: base + extra, scale, stsl: 0, base };
  }
  const x = weeklyEquivalent(gross, f) + 0.99;
  const base = Math.max(0, weekly(tables[scale.code], x));
  const loan = t.stsl ? stslWeekly(x, t) : 0;
  const w = Math.round(base + loan);
  const tax = Math.max(0, fromWeekly(w, f));
  const baseOnly = Math.max(0, fromWeekly(Math.round(base), f));
  return { tax: tax + extra, scale, stsl: tax - baseOnly, base: baseOnly };
}

/** Super guarantee on this pay's qualifying earnings, stopping at the annual maximum contribution base. */
export function superGuarantee(qualifying: number, opts: { rate?: number; ytdQualifying?: number; age?: number | null; hoursPerWeek?: number } = {}) {
  const rate = opts.rate ?? RULES.sgRate;
  // Under-18s are only owed SG for weeks they work more than 30 hours.
  if (opts.age != null && opts.age < 18 && (opts.hoursPerWeek ?? 38) <= 30) return { amount: 0, capped: false, note: "Under 18 and 30 hours a week or less: no super guarantee" };
  const room = Math.max(0, RULES.maxContributionBase - (opts.ytdQualifying ?? 0));
  const base = Math.min(qualifying, room);
  return { amount: round2((base * rate) / 100), capped: base < qualifying, note: base < qualifying ? `Reached the $${RULES.maxContributionBase.toLocaleString("en-AU")} maximum contribution base` : null };
}

/** Payday Super: contributions must reach the fund within 7 days of payday. */
export function superDue(payDate: string) {
  const d = new Date(`${payDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + RULES.superDueDays);
  return d.toISOString().slice(0, 10);
}

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** ATO TFN check digit (9 digits). */
export function validTfn(tfn: string) {
  const d = tfn.replace(/\D/g, "");
  if (d.length !== 9) return false;
  const w = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  return w.reduce((a, x, i) => a + x * Number(d[i]), 0) % 11 === 0;
}

/** ABN check digit (11 digits). */
export function validAbn(abn: string) {
  const d = abn.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const w = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  return d.split("").reduce((a, c, i) => a + w[i] * (Number(c) - (i === 0 ? 1 : 0)), 0) % 89 === 0;
}

export const validBsb = (bsb: string) => /^\d{3}-?\d{3}$/.test(bsb.trim());
export const validUsi = (usi: string) => /^[A-Z]{3}\d{4}[A-Z]{2}$/i.test(usi.trim()) || /^\d{14}$/.test(usi.replace(/\s/g, ""));

/** Financial year containing a date: { start: "2026-07-01", end: "2027-06-30", label: "2026–27" }. */
export function financialYear(date: string) {
  const y = Number(date.slice(0, 4)) - (Number(date.slice(5, 7)) < 7 ? 1 : 0);
  return { start: `${y}-07-01`, end: `${y + 1}-06-30`, label: `${y}–${String(y + 1).slice(2)}` };
}

export function ageOn(dob: string | null | undefined, on: string) {
  if (!dob) return null;
  const [y, m, d] = dob.split("-").map(Number);
  const [Y, M, D] = on.split("-").map(Number);
  return Y - y - (M < m || (M === m && D < d) ? 1 : 0);
}
