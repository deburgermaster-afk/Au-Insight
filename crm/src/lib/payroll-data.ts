import "server-only";
import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { financialYear, type Frequency, type TaxProfile } from "@/lib/payg";
import { employmentBasis, taxTreatment } from "@/lib/payroll";
import { decrypt } from "@/lib/secure";
import { getCtx } from "@/lib/session";
import type { StpPayee, StpPayer } from "@/lib/stp";

type StaffProfile = typeof s.staffProfiles.$inferSelect;
export type PayrollSettings = typeof s.payrollSettings.$inferSelect;

/** The agency's payroll settings, created with defaults the first time they're needed. */
export async function payrollSettingsFor(agencyId: string): Promise<PayrollSettings> {
  const [row] = await db.select().from(s.payrollSettings).where(eq(s.payrollSettings.agencyId, agencyId));
  if (row) return row;
  const [made] = await db.insert(s.payrollSettings).values({ agencyId }).onConflictDoNothing().returning();
  return made ?? (await db.select().from(s.payrollSettings).where(eq(s.payrollSettings.agencyId, agencyId)))[0];
}

export function taxProfileOf(p: StaffProfile, settings: Pick<PayrollSettings, "whmRegistered">): TaxProfile {
  return {
    tfnProvided: p.tfnStatus === "provided" || p.tfnStatus === "pending" || p.tfnStatus === "under18" || p.tfnStatus === "pensioner",
    residency: (p.residency as TaxProfile["residency"]) ?? "resident",
    taxFreeThreshold: p.taxFreeThreshold,
    stsl: p.stsl,
    medicareExemption: (p.medicareExemption as TaxProfile["medicareExemption"]) ?? "none",
    extraWithholding: p.extraWithholding ? Number(p.extraWithholding) : 0,
    whmRegistered: settings.whmRegistered,
  };
}

export const tfnOf = (p: Pick<StaffProfile, "tfnEnc">) => {
  if (!p.tfnEnc) return null;
  try {
    return decrypt(p.tfnEnc);
  } catch {
    return null;
  }
};

export const frequencyOf = (p: Pick<StaffProfile, "payFrequency">, settings: Pick<PayrollSettings, "frequency">) => (p.payFrequency ?? settings.frequency) as Frequency;

/** What's still missing before someone can be paid and reported to the ATO. */
export function readiness(p: StaffProfile | null) {
  const gaps: { section: string; text: string }[] = [];
  if (!p) return [{ section: "pay", text: "No payroll profile yet" }];
  if (!p.payRate) gaps.push({ section: "pay", text: "Pay rate" });
  if (!p.givenName || !p.familyName) gaps.push({ section: "personal", text: "Legal name" });
  if (!p.dob) gaps.push({ section: "personal", text: "Date of birth" });
  if (!p.addressLine1 || !p.postcode) gaps.push({ section: "personal", text: "Home address" });
  if (!p.tfnDeclaredAt) gaps.push({ section: "tax", text: "TFN declaration" });
  if (!p.superChoiceAt) gaps.push({ section: "super", text: "Super choice" });
  if (!p.bankBsb || !p.bankAccount) gaps.push({ section: "bank", text: "Bank account" });
  if (!p.startDate) gaps.push({ section: "employment", text: "Start date" });
  return gaps;
}

/** Year-to-date totals for one person before a given pay date, for WHM tax and the super cap. */
export async function ytdBefore(agencyId: string, userId: string, payDate: string, excludeRunId?: string) {
  const fy = financialYear(payDate);
  const rows = await db
    .select({ gross: s.payslips.gross, qualifying: s.payslips.qualifying })
    .from(s.payslips)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
    .where(and(eq(s.payslips.agencyId, agencyId), eq(s.payslips.userId, userId), eq(s.payRuns.status, "finalised"), gte(s.payRuns.payDate, fy.start), lt(s.payRuns.payDate, payDate), excludeRunId ? ne(s.payRuns.id, excludeRunId) : undefined));
  return { gross: rows.reduce((a, r) => a + Number(r.gross), 0), qualifying: rows.reduce((a, r) => a + Number(r.qualifying), 0) };
}

export async function stpPayer(agencyId: string, agencyName: string): Promise<StpPayer> {
  const [settings, [profile]] = await Promise.all([payrollSettingsFor(agencyId), db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId))]);
  return {
    abn: profile?.abn ?? null,
    branch: settings.branch,
    bmsId: settings.bmsId,
    name: profile?.legalName ?? agencyName,
    contactName: settings.contactName,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    address: { line1: settings.addressLine1, suburb: settings.suburb, state: settings.addressState, postcode: settings.postcode },
    declarationName: settings.stpDeclarationName,
  };
}

/** Everyone paid in the financial year (up to a date), with their payslips, as STP payees. */
export async function stpPayees(agencyId: string, upTo: string, onlyUsers?: string[]): Promise<StpPayee[]> {
  const fy = financialYear(upTo);
  const settings = await payrollSettingsFor(agencyId);
  const slips = await db
    .select({ p: s.payslips })
    .from(s.payslips)
    .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
    .where(and(eq(s.payslips.agencyId, agencyId), eq(s.payRuns.status, "finalised"), gte(s.payRuns.payDate, fy.start), lt(s.payRuns.payDate, nextDay(upTo)), onlyUsers?.length ? inArray(s.payslips.userId, onlyUsers) : undefined));
  const ids = [...new Set(slips.map((r) => r.p.userId))];
  if (!ids.length) return [];
  const people = await db
    .select({ profile: s.staffProfiles, name: s.user.name, email: s.user.email })
    .from(s.staffProfiles)
    .innerJoin(s.user, eq(s.user.id, s.staffProfiles.userId))
    .where(and(eq(s.staffProfiles.agencyId, agencyId), inArray(s.staffProfiles.userId, ids)));
  return people
    .filter((x) => x.profile.employment !== "contractor")
    .map(({ profile: p, name, email }) => {
      const t = taxProfileOf(p, settings);
      return {
        userId: p.userId,
        payrollId: p.payrollId ?? p.userId.slice(0, 12),
        name,
        givenName: p.givenName,
        middleName: p.middleName,
        familyName: p.familyName,
        tfn: tfnOf(p),
        tfnStatus: p.tfnStatus,
        dob: p.dob,
        email: p.personalEmail ?? email,
        phone: p.phone,
        address: { line1: p.addressLine1, line2: p.addressLine2, suburb: p.suburb, state: p.addressState, postcode: p.postcode, country: p.country },
        startDate: p.startDate,
        endDate: p.endDate,
        cessationType: p.cessationType,
        employmentBasis: employmentBasis(p.employment),
        taxTreatment: taxTreatment(t),
        incomeType: p.residency === "whm" ? "WHM" : p.incomeType,
        country: p.homeCountry,
        slips: slips
          .filter((r) => r.p.userId === p.userId)
          .map((r) => ({ gross: Number(r.p.gross), tax: Number(r.p.tax), super: Number(r.p.superAmount), extraSuper: 0, qualifying: Number(r.p.qualifying), lines: r.p.lines })),
      };
    });
}

const nextDay = (d: string) => {
  const x = new Date(`${d}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

/** Payroll overview for HR: settings, contributions, STP reports, contracts, connectors. */
export async function getPayroll() {
  const { agencyId } = await getCtx();
  return payrollFor(agencyId);
}

async function payrollFor(agencyId: string) {
  const [settings, contributions, events, templates, contracts, connectors] = await Promise.all([
    payrollSettingsFor(agencyId),
    db.select().from(s.superContributions).where(eq(s.superContributions.agencyId, agencyId)).orderBy(desc(s.superContributions.payDate), s.superContributions.name).limit(400),
    db
      .select({ id: s.stpEvents.id, kind: s.stpEvents.kind, payRunId: s.stpEvents.payRunId, financialYear: s.stpEvents.financialYear, submissionId: s.stpEvents.submissionId, status: s.stpEvents.status, via: s.stpEvents.via, problems: s.stpEvents.problems, payees: s.stpEvents.payees, gross: s.stpEvents.gross, tax: s.stpEvents.tax, receipt: s.stpEvents.receipt, response: s.stpEvents.response, lodgedAt: s.stpEvents.lodgedAt, lodgedBy: s.stpEvents.lodgedBy, createdAt: s.stpEvents.createdAt })
      .from(s.stpEvents)
      .where(eq(s.stpEvents.agencyId, agencyId))
      .orderBy(desc(s.stpEvents.createdAt))
      .limit(60),
    db.select().from(s.contractTemplates).where(eq(s.contractTemplates.agencyId, agencyId)).orderBy(desc(s.contractTemplates.updatedAt)),
    db
      .select({ c: s.employmentContracts, name: s.user.name })
      .from(s.employmentContracts)
      .innerJoin(s.user, eq(s.user.id, s.employmentContracts.userId))
      .where(eq(s.employmentContracts.agencyId, agencyId))
      .orderBy(desc(s.employmentContracts.updatedAt)),
    db.select({ kind: s.connectors.kind, status: s.connectors.status, account: s.connectors.account, lastError: s.connectors.lastError, connectedByName: s.connectors.connectedByName, createdAt: s.connectors.createdAt }).from(s.connectors).where(eq(s.connectors.agencyId, agencyId)),
  ]);
  return { settings, contributions, events, templates, contracts: contracts.map((r) => ({ ...r.c, name: r.name })), connectors };
}

/** Everything about one staff member for the full employee view. */
export async function getEmployee(userId: string) {
  const ctx = await getCtx();
  if (!ctx.caps.includes("payroll") && ctx.userId !== userId) return null;
  const [person] = await db
    .select({ memberId: s.member.id, role: s.member.role, userId: s.user.id, name: s.user.name, email: s.user.email, image: s.user.image, profile: s.staffProfiles })
    .from(s.member)
    .innerJoin(s.user, eq(s.user.id, s.member.userId))
    .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, ctx.agencyId)))
    .where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.userId, userId)));
  if (!person) return null;
  const [settings, slips, leave, contracts, contributions, staff] = await Promise.all([
    payrollSettingsFor(ctx.agencyId),
    db
      .select({ p: s.payslips, run: s.payRuns })
      .from(s.payslips)
      .innerJoin(s.payRuns, eq(s.payRuns.id, s.payslips.payRunId))
      .where(and(eq(s.payslips.agencyId, ctx.agencyId), eq(s.payslips.userId, userId)))
      .orderBy(desc(s.payRuns.payDate))
      .limit(60),
    db.select().from(s.leaveRequests).where(and(eq(s.leaveRequests.agencyId, ctx.agencyId), eq(s.leaveRequests.userId, userId))).orderBy(desc(s.leaveRequests.startDate)).limit(30),
    db.select().from(s.employmentContracts).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.userId, userId))).orderBy(desc(s.employmentContracts.updatedAt)),
    db.select().from(s.superContributions).where(and(eq(s.superContributions.agencyId, ctx.agencyId), eq(s.superContributions.userId, userId))).orderBy(desc(s.superContributions.payDate)).limit(30),
    db.select({ id: s.user.id, name: s.user.name }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(eq(s.member.organizationId, ctx.agencyId)),
  ]);
  const tfn = person.profile ? tfnOf(person.profile) : null;
  return { ...person, settings, tfnLast3: tfn ? tfn.slice(-3) : null, slips: slips.map((r) => ({ ...r.p, run: r.run })), leave, contracts, contributions, managers: staff.filter((m) => m.id !== userId), canEdit: ctx.caps.includes("payroll") };
}

/** One employment contract: HR sees any, staff only their own. */
export async function getContract(id: string) {
  const ctx = await getCtx();
  const [row] = await db
    .select({ c: s.employmentContracts, name: s.user.name, email: s.user.email })
    .from(s.employmentContracts)
    .innerJoin(s.user, eq(s.user.id, s.employmentContracts.userId))
    .where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, id)));
  if (!row) return null;
  const hr = ctx.caps.includes("payroll");
  if (!hr && row.c.userId !== ctx.userId) return null;
  if (!hr && row.c.status === "draft") return null;
  return { ...row.c, name: row.name, email: row.email, hr, mine: row.c.userId === ctx.userId };
}

/** The signed-in person's payroll bits for their Me page. */
export async function getMyPayroll() {
  const ctx = await getCtx();
  const [settings, [profile], contracts] = await Promise.all([
    payrollSettingsFor(ctx.agencyId),
    db.select({ tfnEnc: s.staffProfiles.tfnEnc }).from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, ctx.userId))),
    db
      .select({ id: s.employmentContracts.id, title: s.employmentContracts.title, status: s.employmentContracts.status, sentAt: s.employmentContracts.sentAt, signedAt: s.employmentContracts.signedAt })
      .from(s.employmentContracts)
      .where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.userId, ctx.userId), inArray(s.employmentContracts.status, ["sent", "signed"])))
      .orderBy(desc(s.employmentContracts.updatedAt)),
  ]);
  const tfn = profile ? tfnOf(profile) : null;
  return { settings: { whmRegistered: settings.whmRegistered, defaultFundName: settings.defaultFundName, frequency: settings.frequency }, tfnLast3: tfn ? tfn.slice(-3) : null, contracts };
}
