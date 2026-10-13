"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { payrollSettingsFor, tfnOf } from "@/lib/payroll-data";
import { journalRows } from "@/lib/payroll-files";
import { abnLookup, type AbnDetails, type AwardRate, ehBusinesses, ehUpsertEmployee, fwcAwardRates, fwcCheckKey, type PayrollKind, saveConnector, secretFor, XERO_ACCOUNTS, xeroJournal } from "@/lib/payroll-integrations";
import { actionCtx, requireCap } from "@/lib/session";

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

/** Fair Work Commission pay rates API: the agency's own (free) subscription key. */
export async function connectFwc(key: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can connect payroll services.");
    const k = key.trim();
    if (k.length < 16) return { ok: false, error: "Paste the primary key from your Fair Work developer profile." };
    await fwcCheckKey(k);
    await saveConnector(ctx.agencyId, "fwc", { key: k, account: "Modern Awards Pay Database" }, { id: ctx.userId, name: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** ABN Lookup web services GUID (free from the ABR). */
export async function connectAbr(guid: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can connect payroll services.");
    const g = guid.trim();
    if (!/^[0-9a-f-]{36}$/i.test(g)) return { ok: false, error: "The ABR GUID looks like 8-4-4-4-12 characters." };
    // Check it against the ABR's own ABN.
    await abnLookup(g, "51824753556");
    await saveConnector(ctx.agencyId, "abr", { key: g, account: "ABN Lookup" }, { id: ctx.userId, name: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Employment Hero Payroll API key: lists the businesses it can reach so staff pick one. */
export async function connectEmploymentHero(key: string, businessId?: string): Promise<ActionResult & { businesses?: { id: string; name: string }[] }> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can connect payroll services.");
    const k = key.trim();
    if (k.length < 20) return { ok: false, error: "Paste the API key from Employment Hero Payroll (My Account → API key)." };
    const list = await ehBusinesses(k);
    if (!list.length) return { ok: false, error: "That key has no businesses in Employment Hero Payroll." };
    const pick = businessId ? list.find((b) => b.id === businessId) : list.length === 1 ? list[0] : null;
    if (!pick) return { ok: true, businesses: list };
    await saveConnector(ctx.agencyId, "employment_hero", { key: k, account: pick.name, scope: pick.id }, { id: ctx.userId, name: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectPayroll(kind: PayrollKind): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    await db.delete(s.connectors).where(and(eq(s.connectors.agencyId, ctx.agencyId), eq(s.connectors.kind, kind)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "connector", entityId: kind });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Official minimum rates for an award's classifications, from the Fair Work Commission. */
export async function lookupAwardRates(code: string): Promise<{ ok: true; name: string | null; rates: AwardRate[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("payroll");
    const key = await secretFor(ctx.agencyId, "fwc");
    if (!key) return { ok: false, error: "Connect Fair Work pay rates first (Settings → Payroll → Integrations)." };
    if (!/^MA\d{6}$/i.test(code.trim())) return { ok: false, error: "Award codes look like MA000002." };
    const r = await fwcAwardRates(key.key, code, new Date().toISOString().slice(0, 10));
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

/** Checks an ABN (agency, super fund or contractor) against the Australian Business Register. */
export async function lookupAbn(abn: string): Promise<{ ok: true; details: AbnDetails | null } | { ok: false; error: string }> {
  try {
    const ctx = await actionCtx();
    const key = await secretFor(ctx.agencyId, "abr");
    if (!key) return { ok: false, error: "ABN Lookup isn't connected." };
    return { ok: true, details: await abnLookup(key.key, abn) };
  } catch (e) {
    return fail(e);
  }
}

const EMPLOYMENT: Record<string, string> = { full_time: "Full Time", part_time: "Part Time", casual: "Casual", contractor: "Contractor" };

/** Sends staff records (details, tax, bank, super) to Employment Hero Payroll, which can then lodge STP. */
export async function syncEmploymentHero(userIds?: string[]): Promise<ActionResult & { synced?: number; errors?: string[] }> {
  try {
    const ctx = await requireCap("payroll");
    const key = await secretFor(ctx.agencyId, "employment_hero");
    if (!key?.scope) return { ok: false, error: "Connect Employment Hero first." };
    const people = await db
      .select({ p: s.staffProfiles, name: s.user.name, email: s.user.email })
      .from(s.staffProfiles)
      .innerJoin(s.user, eq(s.user.id, s.staffProfiles.userId))
      .where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), userIds?.length ? inArray(s.staffProfiles.userId, userIds) : undefined));
    let synced = 0;
    const errors: string[] = [];
    for (const { p, name, email } of people) {
      if (!p.givenName || !p.familyName || !p.startDate) {
        errors.push(`${name}: add legal name and start date first`);
        continue;
      }
      try {
        const emp = {
          ExternalId: p.userId,
          FirstName: p.givenName,
          OtherName: p.middleName,
          Surname: p.familyName,
          DateOfBirth: p.dob,
          Gender: p.gender === "female" ? "F" : p.gender === "male" ? "M" : null,
          StartDate: p.startDate,
          EndDate: p.endDate,
          EmailAddress: p.personalEmail ?? email,
          MobilePhone: p.phone,
          ResidentialStreetAddress: [p.addressLine1, p.addressLine2].filter(Boolean).join(", ") || null,
          ResidentialSuburb: p.suburb,
          ResidentialState: p.addressState,
          ResidentialPostCode: p.postcode,
          EmploymentType: EMPLOYMENT[p.employment] ?? "Full Time",
          TaxFileNumber: p.tfnStatus === "provided" ? tfnOf(p) : null,
          BankAccount1_BSB: p.bankBsb,
          BankAccount1_AccountNumber: p.bankAccount,
          BankAccount1_AccountName: p.bankAccountName ?? name,
          BankAccount1_AllocatedPercentage: p.bankAccount ? 100 : null,
          SuperFund1_ProductCode: p.superUsi,
          SuperFund1_FundName: p.superFund,
          SuperFund1_MemberNumber: p.superMember,
          JobTitle: p.title,
          HoursPerWeek: Number(p.hoursPerWeek),
          Rate: p.payRate ? Number(p.payRate) : null,
          RateUnit: p.payType === "hourly" ? "Hourly" : "Annually",
        };
        const id = await ehUpsertEmployee(key.key, key.scope, emp, p.externalIds?.employment_hero);
        if (id) await db.update(s.staffProfiles).set({ externalIds: { ...(p.externalIds ?? {}), employment_hero: id } }).where(eq(s.staffProfiles.id, p.id));
        synced++;
      } catch (e) {
        errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "export", entity: "employment_hero", entityId: "employees", detail: { synced, errors: errors.length } });
    if (key.connector) await db.update(s.connectors).set({ lastError: errors[0] ?? null }).where(eq(s.connectors.id, key.connector.id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, synced, errors };
  } catch (e) {
    return fail(e);
  }
}

/** Posts a finalised pay run's journal to Xero as a draft manual journal. */
export async function sendJournalToXero(runId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const [run] = await db.select().from(s.payRuns).where(and(eq(s.payRuns.agencyId, ctx.agencyId), eq(s.payRuns.id, runId)));
    if (!run || run.status !== "finalised") return { ok: false, error: "Finalise the pay run first." };
    const slips = await db.select().from(s.payslips).where(eq(s.payslips.payRunId, run.id));
    const settings = await payrollSettingsFor(ctx.agencyId);
    const sum = (f: (p: (typeof slips)[number]) => number) => Math.round(slips.reduce((a, p) => a + f(p), 0) * 100) / 100;
    const sac = (p: (typeof slips)[number], k: string) => p.lines.filter((l) => l.kind === k).reduce((a, l) => a + Math.abs(l.amount), 0);
    const rows = journalRows(run, { gross: sum((p) => Number(p.gross)), tax: sum((p) => Number(p.tax)), super: sum((p) => Number(p.superAmount)), net: sum((p) => Number(p.net)), sacrifice: sum((p) => sac(p, "sacrifice_super")), sacrificeOther: sum((p) => sac(p, "sacrifice_other")), deductions: sum((p) => Number(p.deductions)) }, { wages: settings.expenseAccount, super: settings.superExpenseAccount });
    const missing = rows.filter((r) => !XERO_ACCOUNTS[r.account] && !/^\d+$/.test(r.account));
    if (missing.length) return { ok: false, error: `No Xero account code for: ${missing.map((r) => r.account).join(", ")}. Use account codes in Settings → Payroll.` };
    const id = await xeroJournal(ctx.agencyId, { date: run.payDate, narration: `Payroll ${run.periodStart} to ${run.periodEnd} (Lodgely)`, lines: rows.map((r) => ({ accountCode: XERO_ACCOUNTS[r.account] ?? r.account, amount: r.debit ? r.debit : -r.credit, description: r.memo })) });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "export", entity: "xero_journal", entityId: run.id, detail: { journal: id } });
    return { ok: true, id: id ?? undefined };
  } catch (e) {
    return fail(e);
  }
}
