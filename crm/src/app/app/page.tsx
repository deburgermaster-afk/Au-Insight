import { connection } from "next/server";
import { AlarmClock, ArrowUpRight, Briefcase, CalendarDays, ChevronRight, CircleDollarSign, ClipboardCheck, ShieldAlert, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ExpiryPill, Pill, priorityTone } from "@/components/app/badges";
import { ColumnChart, SplitBar, TrendChart } from "@/components/app/charts";
import { FadeIn, Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { CardsSkeleton } from "@/components/app/skeletons";
import { StatCard } from "@/components/app/stat-card";
import { Timeline } from "@/components/app/timeline";
import { WithPickers } from "@/components/app/with-pickers";
import { NewAppointmentDialog, NewMatterDialog, NewTaskDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard, getReports } from "@/lib/data";
import { aud, daysUntil, dmy, fullName, relativeDays, time } from "@/lib/format";
import { getCtx } from "@/lib/session";
import { stages } from "@/lib/visas";

export const metadata = { title: "Dashboard" };

async function Greeting() {
  await connection();
  const ctx = await getCtx();
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Sydney" }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <>
      {part}, {ctx.name.split(" ")[0]}
    </>
  );
}

function BillCard({ href, icon, tone, title, sub, left, right }: { href: string; icon: React.ReactNode; tone: string; title: string; sub: string; left: React.ReactNode; right: React.ReactNode }) {
  return (
    <Link href={href} className="group block overflow-hidden rounded-xl border bg-card transition hover:border-foreground/15">
      <div className="flex items-center gap-3 p-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ background: `color-mix(in oklch, ${tone} 16%, transparent)`, color: tone }}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{sub}</p>
        </div>
        <ChevronRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5" />
      </div>
      <div className="flex items-center justify-between gap-2 border-t bg-muted/30 px-3 py-2 text-[13px]">
        {left}
        {right}
      </div>
    </Link>
  );
}

async function Overview() {
  await connection();
  const [d, r] = await Promise.all([getDashboard(), getReports()]);
  const short: Record<string, string> = { enquiry: "Enq.", consultation: "Consult", engaged: "Engaged", documents: "Docs", ready: "Ready", lodged: "Lodged", rfi: "RFI", decision: "Decision" };
  const pipeline = stages.filter((s) => s.key !== "closed").map((s) => ({ stage: short[s.key], matters: d.byStage[s.key] ?? 0 }));
  const sum = (...k: string[]) => k.reduce((a, x) => a + (d.byStage[x] ?? 0), 0);
  const split = [
    { name: "Preparing", value: sum("enquiry", "consultation", "engaged", "documents") },
    { name: "Ready & lodged", value: sum("ready", "lodged") },
    { name: "RFI & decision", value: sum("rfi", "decision") },
  ];
  const revenue = r.revenue.map((m) => ({ month: new Date(`${m.month}-01`).toLocaleString("en-AU", { month: "short" }), fees: m.amount }));
  const collected = r.revenue.reduce((a, m) => a + m.amount, 0);
  const last = r.revenue.at(-1)?.amount ?? 0;
  const prev = r.revenue.at(-2)?.amount ?? 0;
  const delta = prev ? ((last - prev) / prev) * 100 : 0;
  return (
    <div className="grid gap-4">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={UsersRound} label="Clients" value={d.clients} href="/app/clients" hint="Across every stage" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Briefcase} label="Open matters" value={d.activeMatters} href="/app/matters" tone="sky" hint={`${d.byStage.lodged ?? 0} lodged, awaiting decision`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={ClipboardCheck} label="Open tasks" value={d.openTasks} href="/app/tasks" tone="amber" hint={`${d.myTasks.length} assigned to you`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CircleDollarSign} label="Outstanding" value={Math.round(d.outstanding)} prefix="$" href="/app/billing" tone="rose" hint={`${aud(d.collected)} collected of ${aud(d.billed)}`} />
        </StaggerItem>
      </Stagger>

      {d.rfis.length || d.complianceGaps ? (
        <FadeIn delay={0.03}>
          <div className="grid gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-3 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-start">
            <span className="flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-300">
              <ShieldAlert className="size-4" /> Deadlines & compliance
            </span>
            <div className="flex flex-wrap gap-2">
              {d.rfis.map((m) => {
                const left = m.due ? daysUntil(m.due) : 0;
                return (
                  <Link key={m.id} href={`/app/matters/${m.id}`} className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs hover:border-foreground/20">
                    <span className={`size-1.5 rounded-full ${left <= 7 ? "bg-rose-500" : "bg-amber-500"}`} />
                    RFI · {m.first} {m.last}
                    <span className="text-muted-foreground">{left < 0 ? `${-left}d overdue` : left === 0 ? "due today" : `due in ${left}d`}</span>
                  </Link>
                );
              })}
              {d.complianceGaps ? (
                <Link href="/app/matters" className="flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs hover:border-foreground/20">
                  <span className="size-1.5 rounded-full bg-amber-500" />
                  {d.complianceGaps} matter{d.complianceGaps === 1 ? "" : "s"} missing Consumer Guide or signed agreement
                </Link>
              ) : null}
            </div>
          </div>
        </FadeIn>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <FadeIn delay={0.05}>
          <Section title="Fees collected" action={<span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">Last 6 months</span>}>
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{aud(collected)}</p>
              <span className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${delta >= 0 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300" : "bg-rose-500/12 text-rose-600 dark:text-rose-300"}`}>
                {delta >= 0 ? "+" : ""}
                {delta.toFixed(1)}% vs last month
              </span>
            </div>
            <div className="mt-4">
              <TrendChart data={revenue} x="month" y="fees" label="Fees" height={340} />
            </div>
          </Section>
        </FadeIn>
        <div className="grid content-start gap-4">
          <FadeIn delay={0.08}>
            <Section title="Matters overview" action={<Link href="/app/matters" className="text-xs text-muted-foreground hover:text-foreground">Open board →</Link>}>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{d.activeMatters}</p>
              <p className="mb-4 text-xs text-muted-foreground">open matters by phase</p>
              <SplitBar data={split} />
            </Section>
          </FadeIn>
          <FadeIn delay={0.1}>
            <Section title="Pipeline">
              <ColumnChart data={pipeline} x="stage" y="matters" label="Matters" height={170} />
            </Section>
          </FadeIn>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <FadeIn delay={0.12}>
          <Section title="Upcoming" action={<Link href="/app/calendar" className="text-xs text-muted-foreground hover:text-foreground">Calendar →</Link>} bodyClassName="grid gap-2.5 p-3">
            {d.upcoming.length ? (
              d.upcoming.slice(0, 4).map((a) => (
                <BillCard
                  key={a.id}
                  href="/app/calendar"
                  icon={<CalendarDays className="size-4.5" />}
                  tone="var(--chart-4)"
                  title={a.title}
                  sub={`${dmy(a.startsAt)} · ${time(a.startsAt)}`}
                  left={<span className="truncate text-muted-foreground">{a.location ?? "Office"}</span>}
                  right={<Pill className="capitalize">{a.kind}</Pill>}
                />
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">Nothing booked.</p>
            )}
          </Section>
        </FadeIn>
        <FadeIn delay={0.14}>
          <Section title="Visas expiring in 90 days" bodyClassName="grid gap-2.5 p-3">
            {d.expiring.length ? (
              d.expiring.slice(0, 4).map((c) => (
                <BillCard
                  key={c.id}
                  href={`/app/clients/${c.id}`}
                  icon={<AlarmClock className="size-4.5" />}
                  tone="var(--chart-2)"
                  title={fullName(c)}
                  sub={`Subclass ${c.visa ?? "—"}`}
                  left={<span className="tabular-nums">{dmy(c.expiry)}</span>}
                  right={<ExpiryPill days={c.expiry ? daysUntil(c.expiry) : null} />}
                />
              ))
            ) : (
              <p className="p-3 text-sm text-muted-foreground">No client visas expire in the next 90 days.</p>
            )}
          </Section>
        </FadeIn>
        <FadeIn delay={0.16}>
          <Section title="Recent activity">
            <Timeline items={d.recent.slice(0, 5)} />
          </Section>
        </FadeIn>
      </div>

      <FadeIn delay={0.18}>
        <Section title="My tasks" action={<Link href="/app/tasks" className="text-xs text-muted-foreground hover:text-foreground">All tasks →</Link>} bodyClassName="p-0">
          {d.myTasks.length ? (
            <ul>
              {d.myTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b px-4 py-2.5 last:border-0">
                  <span className={`size-1.5 shrink-0 rounded-full ${t.priority === "urgent" ? "bg-rose-400" : t.priority === "high" ? "bg-amber-400" : "bg-muted-foreground/50"}`} />
                  <p className="min-w-0 flex-1 truncate text-sm">{t.title}</p>
                  <Pill t={priorityTone[t.priority]}>{relativeDays(t.dueAt)}</Pill>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">You're all caught up.</p>
          )}
        </Section>
      </FadeIn>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title={
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            <Greeting />
          </Suspense>
        }
        description="Here's what's happening across your agency today."
        actions={
          <WithPickers
            render={(p) => (
              <>
                <NewTaskDialog pickers={p} trigger={<Button size="sm" variant="outline">New task</Button>} />
                <NewAppointmentDialog pickers={p} trigger={<Button size="sm" variant="outline">Book</Button>} />
                <NewMatterDialog
                  pickers={p}
                  trigger={
                    <button className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground transition hover:opacity-90">
                      New matter <ArrowUpRight className="size-3.5" />
                    </button>
                  }
                />
              </>
            )}
          />
        }
      />
      <Suspense fallback={<CardsSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}
