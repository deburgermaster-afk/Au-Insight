import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HeaderActions } from "@/components/app/header-actions";
import { PageSkeleton } from "@/components/app/skeletons";
import { aud, dmy } from "@/lib/format";
import { getPayslip } from "@/lib/hr-data";
import { PrintButton } from "./print";

async function Slip({ params }: { params: Promise<{ id: string }> }) {
  const d = await getPayslip((await params).id);
  if (!d) notFound();
  const { p, run, profile, agency } = d;
  const Row = ({ k, v, strong }: { k: string; v: string; strong?: boolean }) => (
    <div className={`flex justify-between py-1.5 ${strong ? "border-t pt-2.5 font-semibold" : ""}`}>
      <span className={strong ? "" : "text-zinc-500"}>{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
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
            <p className="text-zinc-500">Super: {profile?.superFund ?? "Fund not set"}</p>
          </div>
        </section>
        <section className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border p-4">
            <p className="mb-2 font-medium">This pay</p>
            {p.lines.map((l) => (
              <Row key={l.label} k={`${l.label}${l.hours ? ` · ${l.hours} h × ${aud(l.rate, 2)}` : ""}`} v={aud(l.amount, 2)} />
            ))}
            <Row k="Gross pay" v={aud(p.gross, 2)} strong />
            <Row k="PAYG tax withheld" v={`− ${aud(p.tax, 2)}`} />
            <Row k="Net pay" v={aud(p.net, 2)} strong />
            <Row k={`Superannuation (${profile?.superRate ?? 12}%)`} v={aud(p.superAmount, 2)} />
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
          Tax is estimated from 2026–27 resident rates, the low income tax offset and the Medicare levy; confirm against the ATO's PAYG withholding tables. Super must be paid to the fund within 7 days of payday.
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
