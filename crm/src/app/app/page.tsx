import { connection } from "next/server";
import { AlarmClock, ArrowUpRight, Briefcase, CalendarDays, CircleDollarSign, ClipboardCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ExpiryPill, Pill, priorityTone } from "@/components/app/badges";
import { ColumnChart } from "@/components/app/charts";
import { FadeIn, Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { CardsSkeleton } from "@/components/app/skeletons";
import { StatCard } from "@/components/app/stat-card";
import { Timeline } from "@/components/app/timeline";
import { WithPickers } from "@/components/app/with-pickers";
import { NewAppointmentDialog, NewMatterDialog, NewTaskDialog } from "@/components/forms/dialogs";
import { Skeleton } from "@/components/ui/skeleton";
import { getDashboard } from "@/lib/data";
import { aud, daysUntil, dm, fullName, relativeDays, time } from "@/lib/format";
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

async function Overview() {
  await connection();
  const d = await getDashboard();
  const short: Record<string, string> = { enquiry: "Enq.", consultation: "Consult", engaged: "Engaged", documents: "Docs", ready: "Ready", lodged: "Lodged", rfi: "RFI", decision: "Decision" };
  const pipeline = stages.filter((s) => s.key !== "closed").map((s) => ({ stage: short[s.key], matters: d.byStage[s.key] ?? 0 }));
  return (
    <div className="grid gap-6">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={UsersRound} label="Clients" value={d.clients} href="/app/clients" hint="All stages" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Briefcase} label="Open matters" value={d.activeMatters} href="/app/matters" tone="sky" hint={`${d.byStage.lodged ?? 0} lodged, awaiting decision`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={ClipboardCheck} label="Open tasks" value={d.openTasks} href="/app/tasks" tone="amber" hint={`${d.myTasks.length} assigned to you`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CircleDollarSign} label="Outstanding" value={Math.round(d.outstanding)} prefix="$" href="/app/billing" tone="emerald" hint={`${aud(d.collected)} collected of ${aud(d.billed)}`} />
        </StaggerItem>
      </Stagger>

      <div className="grid gap-6 lg:grid-cols-3">
        <FadeIn delay={0.05} className="lg:col-span-2">
          <Section title="Pipeline" action={<Link href="/app/matters" className="text-xs text-primary hover:underline">Open board</Link>}>
            <ColumnChart data={pipeline} x="stage" y="matters" label="Matters" />
          </Section>
        </FadeIn>
        <FadeIn delay={0.1}>
          <Section title={<span className="flex items-center gap-2"><AlarmClock className="size-4 text-rose-500" /> Visas expiring in 90 days</span>} bodyClassName="p-2 sm:p-2">
            {d.expiring.length ? (
              <ul className="grid">
                {d.expiring.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/clients/${c.id}`} className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition hover:bg-muted">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{fullName(c)}</p>
                        <p className="text-xs text-muted-foreground">Subclass {c.visa ?? "—"} · {dm(c.expiry)}</p>
                      </div>
                      <ExpiryPill days={c.expiry ? daysUntil(c.expiry) : null} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">No client visas expire in the next 90 days.</p>
            )}
          </Section>
        </FadeIn>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <FadeIn delay={0.12}>
          <Section title="My tasks" action={<Link href="/app/tasks" className="text-xs text-primary hover:underline">All tasks</Link>} bodyClassName="p-2 sm:p-2">
            {d.myTasks.length ? (
              <ul className="grid">
                {d.myTasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                    <span className={`size-2 shrink-0 rounded-full ${t.priority === "urgent" ? "bg-rose-500" : t.priority === "high" ? "bg-amber-500" : "bg-primary/60"}`} />
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
        <FadeIn delay={0.15}>
          <Section title={<span className="flex items-center gap-2"><CalendarDays className="size-4 text-primary" /> Upcoming</span>} action={<Link href="/app/calendar" className="text-xs text-primary hover:underline">Calendar</Link>} bodyClassName="p-2 sm:p-2">
            {d.upcoming.length ? (
              <ul className="grid">
                {d.upcoming.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5">
                    <div className="grid w-11 shrink-0 place-items-center rounded-lg bg-primary/10 py-1 text-primary">
                      <span className="text-[10px] font-medium uppercase">{dm(a.startsAt).split(" ")[1]}</span>
                      <span className="text-base font-semibold leading-none">{dm(a.startsAt).split(" ")[0]}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {time(a.startsAt)} · {a.location ?? a.kind}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-4 text-sm text-muted-foreground">Nothing booked.</p>
            )}
          </Section>
        </FadeIn>
        <FadeIn delay={0.18}>
          <Section title="Recent activity">
            <Timeline items={d.recent.slice(0, 6)} />
          </Section>
        </FadeIn>
      </div>
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
                <NewTaskDialog pickers={p} />
                <NewAppointmentDialog pickers={p} />
                <NewMatterDialog
                  pickers={p}
                  trigger={
                    <button className="inline-flex h-7 items-center gap-1 rounded-lg bg-primary px-2.5 text-[0.8rem] font-medium text-primary-foreground shadow-sm shadow-primary/30 transition hover:brightness-110">
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
