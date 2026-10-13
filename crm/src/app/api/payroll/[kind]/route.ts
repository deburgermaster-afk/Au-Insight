import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { payrollSettingsFor, tfnOf } from "@/lib/payroll-data";
import { abaFile, contributionCsv, journalCsv, journalRows } from "@/lib/payroll-files";
import { actionCtx } from "@/lib/session";
import { stpCsv } from "@/lib/stp";

// Payroll downloads: STP report (json/csv), super contribution file, accounting journal, ABA bank file.
export async function GET(req: Request, { params }: RouteContext<"/api/payroll/[kind]">) {
  const ctx = await actionCtx();
  if (!ctx.caps.includes("payroll")) return new Response("Only HR or admins can download payroll files.", { status: 403 });
  const { kind } = await params;
  const q = new URL(req.url).searchParams;
  const agencyId = ctx.agencyId;
  const file = (body: string, name: string, type: string) => {
    void db.insert(s.auditLog).values({ agencyId, actorId: ctx.userId, actorName: ctx.name, action: "export", entity: `payroll_${kind}`, entityId: q.get("id") ?? q.get("run") ?? "all" }).then(() => undefined);
    return new Response(body, { headers: { "Content-Type": `${type}; charset=utf-8`, "Content-Disposition": `attachment; filename="${name.replace(/[–—]/g, "-").replace(/[^\x20-\x7E]/g, "")}"`, "Cache-Control": "no-store" } });
  };

  if (kind === "stp") {
    const [ev] = await db.select().from(s.stpEvents).where(and(eq(s.stpEvents.agencyId, agencyId), eq(s.stpEvents.id, q.get("id") ?? "")));
    if (!ev) return new Response("Not found", { status: 404 });
    const name = `STP ${ev.kind} ${ev.financialYear} ${ev.submissionId.slice(0, 8)}`;
    if (q.get("format") === "csv") return file(stpCsv(ev.payload as Parameters<typeof stpCsv>[0]), `${name}.csv`, "text/csv");
    return file(JSON.stringify(ev.payload, null, 2), `${name}.json`, "application/json");
  }

  const [run] = q.get("run") ? await db.select().from(s.payRuns).where(and(eq(s.payRuns.agencyId, agencyId), eq(s.payRuns.id, q.get("run")!))) : [];

  if (kind === "super") {
    const ids = q.get("ids")?.split(",").filter(Boolean);
    const rows = await db
      .select({ c: s.superContributions, run: s.payRuns, p: s.staffProfiles, email: s.user.email })
      .from(s.superContributions)
      .innerJoin(s.payRuns, eq(s.payRuns.id, s.superContributions.payRunId))
      .innerJoin(s.user, eq(s.user.id, s.superContributions.userId))
      .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.superContributions.userId), eq(s.staffProfiles.agencyId, agencyId)))
      .where(and(eq(s.superContributions.agencyId, agencyId), run ? eq(s.superContributions.payRunId, run.id) : ids?.length ? inArray(s.superContributions.id, ids) : eq(s.superContributions.status, "due")));
    const [profile] = await db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
    const body = contributionCsv(
      { abn: profile?.abn ?? null, name: profile?.legalName ?? ctx.agencyName },
      rows.map(({ c, run: r, p, email }) => ({
        payrollId: p?.payrollId ?? c.userId.slice(0, 12),
        givenName: p?.givenName ?? c.name.split(" ")[0],
        familyName: p?.familyName ?? c.name.split(" ").slice(1).join(" "),
        dob: p?.dob ?? null,
        gender: p?.gender ?? null,
        tfn: p ? tfnOf(p) : null,
        address: { line1: p?.addressLine1 ?? null, suburb: p?.suburb ?? null, state: p?.addressState ?? null, postcode: p?.postcode ?? null },
        email: p?.personalEmail ?? email,
        phone: p?.phone ?? null,
        startDate: p?.startDate ?? null,
        fund: c.fund,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        sg: Number(c.sg),
        sacrifice: Number(c.sacrifice),
        extra: Number(c.extra),
      })),
    );
    return file(body, `Super contributions ${run ? run.payDate : "due"}.csv`, "text/csv");
  }

  if (!run) return new Response("Pick a pay run.", { status: 400 });
  const slips = await db.select().from(s.payslips).where(eq(s.payslips.payRunId, run.id));
  const settings = await payrollSettingsFor(agencyId);

  if (kind === "journal") {
    const sum = (f: (p: (typeof slips)[number]) => number) => Math.round(slips.reduce((a, p) => a + f(p), 0) * 100) / 100;
    const sacrificeOf = (p: (typeof slips)[number], k: "sacrifice_super" | "sacrifice_other") => p.lines.filter((l) => l.kind === k).reduce((a, l) => a + Math.abs(l.amount), 0);
    const rows = journalRows(
      run,
      { gross: sum((p) => Number(p.gross)), tax: sum((p) => Number(p.tax)), super: sum((p) => Number(p.superAmount)), net: sum((p) => Number(p.net)), sacrifice: sum((p) => sacrificeOf(p, "sacrifice_super")), sacrificeOther: sum((p) => sacrificeOf(p, "sacrifice_other")), deductions: sum((p) => Number(p.deductions)) },
      { wages: settings.expenseAccount, super: settings.superExpenseAccount },
    );
    return file(journalCsv(rows), `Payroll journal ${run.payDate}.csv`, "text/csv");
  }

  if (kind === "aba") {
    if (!settings.payBsb || !settings.payAccount || !settings.apcaId || !settings.payBankCode) return new Response("Add the wages bank account and direct entry user ID in Settings → Payroll first.", { status: 400 });
    const profiles = await db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), inArray(s.staffProfiles.userId, slips.map((p) => p.userId).concat(["-"]))));
    const missing = slips.filter((p) => {
      const pr = profiles.find((x) => x.userId === p.userId);
      return Number(p.net) > 0 && (!pr?.bankBsb || !pr.bankAccount);
    });
    if (missing.length) return new Response(`No bank account for: ${missing.map((p) => p.name).join(", ")}`, { status: 400 });
    const body = abaFile({
      bank: settings.payBankCode,
      userName: settings.payAccountName ?? ctx.agencyName,
      apcaId: settings.apcaId,
      description: "PAYROLL",
      processDate: run.payDate,
      from: { bsb: settings.payBsb, account: settings.payAccount, name: (settings.payAccountName ?? ctx.agencyName).slice(0, 16) },
      payments: slips
        .filter((p) => Number(p.net) > 0)
        .map((p) => {
          const pr = profiles.find((x) => x.userId === p.userId)!;
          return { bsb: pr.bankBsb!, account: pr.bankAccount!, name: pr.bankAccountName ?? p.name, amount: Number(p.net), reference: `PAY ${run.payDate}` };
        }),
    });
    return file(body, `Wages ${run.payDate}.aba`, "text/plain");
  }
  return new Response("Unknown file", { status: 404 });
}
