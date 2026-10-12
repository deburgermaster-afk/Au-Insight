import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { ColumnChart, Donut, SplitBar, TrendChart } from "@/components/app/charts";
import { FadeIn } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { getReports } from "@/lib/data";
import { aud } from "@/lib/format";

export const metadata = { title: "Reports" };

async function Reports() {
  const r = await getReports();
  const revenue = r.revenue.map((m) => ({ month: new Date(`${m.month}-01`).toLocaleString("en-AU", { month: "short" }), revenue: m.amount }));
  const total = r.revenue.reduce((a, m) => a + m.amount, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FadeIn className="lg:col-span-2">
        <Section title="Fees collected">
          <p className="mb-4 text-3xl font-semibold tracking-tight tabular-nums">{aud(total)}</p>
          <TrendChart data={revenue} x="month" y="revenue" label="Revenue" height={280} />
        </Section>
      </FadeIn>
      <FadeIn delay={0.05}>
        <Section title="Matters by visa">
          <ColumnChart data={r.byVisa.slice(0, 8).map((v) => ({ visa: v.visa, matters: v.n }))} x="visa" y="matters" label="Matters" />
        </Section>
      </FadeIn>
      <FadeIn delay={0.1}>
        <Section title="Where clients come from">
          <SplitBar data={r.bySource.map((s) => ({ name: s.source ?? "unknown", value: s.n }))} />
        </Section>
      </FadeIn>
      <FadeIn delay={0.15} className="lg:col-span-2">
        <Section title="Outcomes">
          {r.outcomes.length ? <Donut data={r.outcomes.map((o) => ({ name: o.outcome ?? "pending", value: o.n }))} /> : <p className="text-sm text-muted-foreground">No decisions yet.</p>}
        </Section>
      </FadeIn>
    </div>
  );
}

export default function ReportsPage() {
  return (
    <>
      <PageHeader title="Reports" description="Revenue, workload mix and where your clients come from." />
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="reports"><Reports /></Guard>
      </Suspense>
    </>
  );
}
