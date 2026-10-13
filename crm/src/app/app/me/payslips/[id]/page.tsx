import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HeaderActions } from "@/components/app/header-actions";
import { PageSkeleton } from "@/components/app/skeletons";
import { aud, dmy } from "@/lib/format";
import { getPayslip } from "@/lib/hr-data";
import { PrintButton } from "./print";

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between py-1.5 ${strong ? "border-t pt-2.5 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-zinc-500"}>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

async function Slip({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPayslip((await params).id);
  if (!d) notFound();
  const { p, run, profile, agency } = d;
  return (
    <>
      <HeaderActions>
        <PrintButton />
      </HeaderActions>
      <article className="mx-auto w-full max-w-3xl rounded-2xl bg-white p-8 text-[13px] text-zinc-900 shadow-sm print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
          <div>
            <p className="text-lg font-semibold">{agency?.legalName ?? d.agencyName}</p>
            <p className="text-zinc-500">ABN {agency?.abn ?? "—"}</p>
            <p className="text-zinc-500">{agency?.address}</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-semibold tracking-tight">Payslip</p>
            <p className="text-zinc-500">Paid {dmy(run.payDate)}</p>
            <p className="text-zinc-500">
              Period {dmy(run.periodStart)} – {dmy(run.periodEnd)}
            </p>
          </div>
        </header>
        <section className="grid gap-6 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400">Employee</p>
            <p className="mt-1 font-medium">{p.name}</p>
            <p className="text-zinc-500">
              {profile?.title ?? ""} · {(profile?.employment ?? "full_time").replace("_", " ")}
            </p>
            <p className="text-zinc-500">{profile?.payType === "hourly" ? `${aud(profile?.payRate, 2)} / hour` : `${aud(profile?.payRate)} / year`}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-zinc-400">Paid to</p>
            <p className="mt-1">BSB {profile?.bankBsb ?? "—"} · Account {profile?.bankAccount ? `•••${profile.bankAccount.slice(-3)}` : "—"}</p>
            <p className="text-zinc-500">Super: {profile?.superType === "default" ? "Agency default fund" : (profile?.superFund ?? "Fund not set")}{profile?.superMember ? ` · member ${profile.superMember}` : ""}</p>
          </div>
        </section>
        <section className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <p className="mb-2 font-medium">This pay</p>
            {p.lines
              .filter((l) => l.kind !== "note" && l.kind !== "sacrifice_super" && l.kind !== "sacrifice_other" && l.kind !== "deduction")
              .map((l, i) => (
                <Row key={i} k={`${l.label}${l.code ? ` (${l.code})` : ""}${l.hours ? ` · ${l.hours} h × ${aud(l.rate, 2)}` : ""}`} v={aud(l.amount, 2)} />
              ))}
            <Row k="Gross pay" v={aud(p.gross, 2)} strong />
            {p.lines
              .filter((l) => l.kind === "sacrifice_super" || l.kind === "sacrifice_other")
              .map((l, i) => (
                <Row key={`s${i}`} k={l.label} v={`− ${aud(Math.abs(l.amount), 2)}`} />
              ))}
            <Row k={`PAYG tax withheld${Number(p.stsl) ? ` (incl. ${aud(p.stsl)} study loan)` : ""}`} v={`− ${aud(p.tax, 2)}`} />
            {p.lines
              .filter((l) => l.kind === "deduction")
              .map((l, i) => (
                <Row key={`d${i}`} k={l.label} v={`− ${aud(Math.abs(l.amount), 2)}`} />
              ))}
            <Row k="Net pay" v={aud(p.net, 2)} strong />
            <Row k={`Super guarantee (${profile?.superRate ?? 12}%)`} v={aud(p.superAmount, 2)} />
            {p.superDue ? <p className="text-[11px] text-zinc-500">Paid to your fund by {dmy(p.superDue)}</p> : null}
            {p.taxScale ? <p className="mt-2 text-[11px] text-zinc-500">Tax scale: {p.taxScale}</p> : null}
          </div>
          <div className="rounded-xl border p-4">
            <p className="mb-2 font-medium">Year to date</p>
            <Row k="Gross" v={aud(d.ytd.gross, 2)} />
            <Row k="Tax withheld" v={aud(d.ytd.tax, 2)} />
            <Row k="Super" v={aud(d.ytd.super, 2)} />
            <p className="mb-2 mt-4 font-medium">Leave</p>
            <Row k="Annual leave accrued" v={`${Number(p.annualAccrued).toFixed(2)} h`} />
            <Row k="Personal leave accrued" v={`${Number(p.personalAccrued).toFixed(2)} h`} />
            <Row k="Annual leave balance" v={`${Number(profile?.annualLeaveHours ?? 0).toFixed(2)} h`} />
          </div>
        </section>
        <p className="mt-6 text-[11px] text-zinc-400">
          Tax withheld using the ATO&rsquo;s 2026–27 withholding formulas (Schedule 1{Number(p.stsl) ? " and Schedule 8" : ""}). Super is paid to your fund within 7 days of payday (Payday Super). This pay is reported to the ATO through Single Touch Payroll.
        </p>
      </article>
    </>
  );
}

export default function PayslipPage({ params }: PageProps<"/app/me/payslips/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Slip params={params} />
    </Suspense>
  );
}
