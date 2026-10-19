import { Suspense } from "react";
import { CsvButton } from "@/components/app/csv-button";
import { Guard } from "@/components/app/guard";
import { ColumnChart, Donut, SplitBar, TrendChart } from "@/components/app/charts";
import { FadeIn } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { getReports } from "@/lib/data";
import { aud } from "@/lib/format";

export const metadata = { title: "Reports" };

const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "–");

async function Reports() {
  const r = await getReports();
  const revenue = r.revenue.map((m) => ({ month: new Date(`${m.month}-01`).toLocaleString("en-AU", { month: "short" }), revenue: m.amount }));
  const total = r.revenue.reduce((a, m) => a + m.amount, 0);
  const top = r.funnel[0]?.n || 1;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FadeIn className="lg:col-span-2">
        <Section title="Fees collected" action={<CsvButton name="fees-collected" rows={r.revenue} columns={[{ key: "month", label: "Month" }, { key: "amount", label: "Collected (AUD)" }]} />}>
          <p className="mb-4 text-3xl font-semibold tracking-tight tabular-nums">{aud(total)}</p>
          <TrendChart data={revenue} x="month" y="revenue" label="Revenue" height={280} />
        </Section>
      </FadeIn>
      <FadeIn delay={0.03}>
        <Section title="Conversion funnel" action={<CsvButton name="conversion-funnel" rows={r.funnel.map((f, i) => ({ ...f, ofEnquiries: pct(f.n, top), ofPrevious: i ? pct(f.n, r.funnel[i - 1].n) : "" }))} columns={[{ key: "step", label: "Step" }, { key: "n", label: "Clients" }, { key: "ofEnquiries", label: "% of enquiries" }, { key: "ofPrevious", label: "% of previous step" }]} />}>
          <div className="grid gap-2">
            {r.funnel.map((f, i) => (
              <div key={f.step} className="grid gap-1">
                <div className="flex items-baseline justify-between text-sm">
                  <span>{f.step}</span>
                  <span className="tabular-nums">
                    <b>{f.n}</b>
                    <span className="ml-2 text-xs text-muted-foreground">{i ? `${pct(f.n, r.funnel[i - 1].n)} of ${r.funnel[i - 1].step.toLowerCase()}` : "all clients"}</span>
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, (f.n / top) * 100)}%`, opacity: 1 - i * 0.14 }} />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Prospects: past the lead stage. Engaged: a case past consultation. Lodged and granted: any of their cases.</p>
        </Section>
      </FadeIn>
      <FadeIn delay={0.05}>
        <Section title="Conversion by source" action={<CsvButton name="conversion-by-source" rows={r.sources} columns={[{ key: "source", label: "Source" }, { key: "enquiries", label: "Enquiries" }, { key: "engaged", label: "Engaged" }, { key: "lodged", label: "Lodged" }, { key: "granted", label: "Granted" }]} />}>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="pb-2 font-medium">Source</th>
                <th className="pb-2 text-right font-medium">Enquiries</th>
                <th className="pb-2 text-right font-medium">Engaged</th>
                <th className="pb-2 text-right font-medium">Granted</th>
              </tr>
            </thead>
            <tbody>
              {r.sources.map((x) => (
                <tr key={x.source} className="border-t">
                  <td className="py-1.5">{x.source}</td>
                  <td className="py-1.5 text-right tabular-nums">{x.enquiries}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {x.engaged} <span className="text-xs text-muted-foreground">{pct(x.engaged, x.enquiries)}</span>
                  </td>
                  <td className="py-1.5 text-right tabular-nums">{x.granted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      </FadeIn>
      <FadeIn delay={0.07} className="lg:col-span-2">
        <Section
          title="Staff performance"
          action={<CsvButton name="staff-performance" rows={r.staff} columns={[{ key: "name", label: "Staff" }, { key: "open", label: "Open cases" }, { key: "lodged90", label: "Lodged (90 days)" }, { key: "granted12", label: "Granted (12 months)" }, { key: "refused12", label: "Refused (12 months)" }, { key: "tasksDone30", label: "Tasks done (30 days)" }, { key: "overdue", label: "Overdue tasks" }, { key: "meetings30", label: "Appointments (30 days)" }, { key: "collected90", label: "Fees collected on their cases (90 days)" }]} />}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="pb-2 font-medium">Staff</th>
                  <th className="pb-2 text-right font-medium">Open cases</th>
                  <th className="pb-2 text-right font-medium">Lodged 90d</th>
                  <th className="pb-2 text-right font-medium">Grant rate 12m</th>
                  <th className="pb-2 text-right font-medium">Tasks done 30d</th>
                  <th className="pb-2 text-right font-medium">Overdue</th>
                  <th className="pb-2 text-right font-medium">Appointments 30d</th>
                  <th className="pb-2 text-right font-medium">Collected 90d</th>
                </tr>
              </thead>
              <tbody>
                {r.staff.map((x) => (
                  <tr key={x.id} className="border-t">
                    <td className="py-1.5">{x.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.open}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.lodged90}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.granted12 + x.refused12 ? `${pct(x.granted12, x.granted12 + x.refused12)} (${x.granted12}/${x.granted12 + x.refused12})` : "–"}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.tasksDone30}</td>
                    <td className={`py-1.5 text-right tabular-nums ${x.overdue ? "text-rose-500" : ""}`}>{x.overdue}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.meetings30}</td>
                    <td className="py-1.5 text-right tabular-nums">{aud(x.collected90)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </FadeIn>
      <FadeIn delay={0.09}>
        <Section title="Matters by visa" action={<CsvButton name="matters-by-visa" rows={r.byVisa} columns={[{ key: "visa", label: "Visa" }, { key: "n", label: "Matters" }]} />}>
          <ColumnChart data={r.byVisa.slice(0, 8).map((v) => ({ visa: v.visa, matters: v.n }))} x="visa" y="matters" label="Matters" />
        </Section>
      </FadeIn>
      <FadeIn delay={0.1}>
        <Section title="Where clients come from" action={<CsvButton name="clients-by-source" rows={r.bySource.map((x) => ({ source: x.source ?? "Unknown", n: x.n }))} columns={[{ key: "source", label: "Source" }, { key: "n", label: "Clients" }]} />}>
          <SplitBar data={r.bySource.map((s) => ({ name: s.source ?? "unknown", value: s.n }))} />
        </Section>
      </FadeIn>
      <FadeIn delay={0.15} className="lg:col-span-2">
        <Section title="Outcomes" action={<CsvButton name="outcomes" rows={r.outcomes.map((x) => ({ outcome: x.outcome ?? "pending", n: x.n }))} columns={[{ key: "outcome", label: "Outcome" }, { key: "n", label: "Matters" }]} />}>
          {r.outcomes.length ? <Donut data={r.outcomes.map((o) => ({ name: o.outcome ?? "pending", value: o.n }))} /> : <p className="text-sm text-muted-foreground">No decisions yet.</p>}
        </Section>
      </FadeIn>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Revenue, conversion, staff performance and where your clients come from." />
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="reports">
          <Reports />
        </Guard>
      </Suspense>
    </>
  );
}
