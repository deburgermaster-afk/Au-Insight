import { BadgeCheck, CalendarDays, CircleAlert, Clock, FileText, Wallet } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { label, Pill, priorityTone } from "@/components/app/badges";
import { HeaderActions } from "@/components/app/header-actions";
import { FadeIn, ProgressBar } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { FactStrip } from "@/components/app/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { listMatters } from "@/lib/data";
import { aud, daysUntil, dmy, initials, relativeDays } from "@/lib/format";
import { getMe } from "@/lib/hr-data";
import { marnCurrent, positions } from "@/lib/permissions";
import { getCtx } from "@/lib/session";
import { CpdDialog, LeaveDialog, MyDetails, TimeDialog } from "./me-forms";

export const metadata = { title: "Me" };

const leaveTone = { pending: "amber", approved: "green", declined: "red" } as const;

async function Me() {
  await connection();
  const [ctx, me, matters] = await Promise.all([getCtx(), getMe(), listMatters().catch(() => [])]);
  const p = me.profile;
  const pos = positions.find((x) => x.key === ctx.position);
  const mara = ctx.position === "principal" || ctx.position === "migration_agent";
  const marnDays = p?.marnExpiry ? daysUntil(p.marnExpiry) : null;
  const yearStart = `${new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)}-07-01`;
  const cpdYear = me.cpd.filter((c) => c.date >= yearStart).reduce((a, c) => a + Number(c.points), 0);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const weekHours = me.time.filter((t) => t.date >= weekAgo).reduce((a, t) => a + Number(t.hours), 0);
  const open = me.tasks.filter((t) => t.status !== "done");
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <TimeDialog matters={matters.slice(0, 200).map((m) => ({ id: m.id, label: `${m.reference} · ${m.clientName}` }))} />
        <LeaveDialog />
        {mara ? <CpdDialog /> : null}
      </HeaderActions>
      <FadeIn className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-5">
        <span className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-[oklch(0.78_0.15_60)] to-[oklch(0.6_0.2_310)] text-lg font-semibold text-white">{initials(ctx.name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">{ctx.name}</h1>
          <p className="text-[13px] text-muted-foreground">
            {p?.title ?? pos?.label} · {ctx.agencyName} · {label(ctx.role)} access
          </p>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{pos?.about}</p>
        </div>
        {mara ? (
          marnCurrent(p?.marn, p?.marnExpiry) ? (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500/12 px-3 py-2 text-xs text-sky-600 dark:text-sky-300">
              <BadgeCheck className="size-4" /> MARN {p?.marn}
              {marnDays != null ? ` · renews in ${marnDays} days` : ""}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/12 px-3 py-2 text-xs text-rose-600 dark:text-rose-300">
              <CircleAlert className="size-4" /> {p?.marn ? "MARN expired" : "No MARN on file"}: you can't lodge until it's current
            </span>
          )
        ) : null}
      </FadeIn>
      <Section title="At a glance">
        <FactStrip
          items={[
            { label: "Annual leave", value: `${Number(p?.annualLeaveHours ?? 0).toFixed(1)} h`, tone: "emerald" },
            { label: "Personal leave", value: `${Number(p?.personalLeaveHours ?? 0).toFixed(1)} h`, tone: "sky" },
            { label: "Hours this week", value: `${weekHours.toFixed(1)} h`, tone: "amber" },
            { label: "Open tasks", value: String(open.length), tone: "rose" },
            { label: "Last net pay", value: me.slips[0] ? aud(me.slips[0].net, 2) : "—", tone: "violet" },
            mara ? { label: "CPD this year", value: `${cpdYear} / ${p?.cpdTarget ?? 10} pts`, tone: "primary" } : { label: "Employment", value: label(p?.employment ?? "full_time"), tone: "primary" },
          ]}
        />
      </Section>
      <Tabs defaultValue="work" className="gap-3">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="work">My work</TabsTrigger>
          <TabsTrigger value="pay">
            <Wallet /> Payslips
          </TabsTrigger>
          <TabsTrigger value="leave">
            <CalendarDays /> Leave
          </TabsTrigger>
          <TabsTrigger value="time">
            <Clock /> Timesheet
          </TabsTrigger>
          {mara ? <TabsTrigger value="cpd">CPD</TabsTrigger> : null}
          <TabsTrigger value="details">My details</TabsTrigger>
        </TabsList>
        <TabsContent value="work">
          <Section title={`Tasks assigned to me · ${open.length} open`} bodyClassName="p-0">
            <ul>
              {open.map((t) => (
                <li key={t.id} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0">
                  <span className="min-w-0 flex-1 truncate">{t.title}</span>
                  <Pill t={priorityTone[t.priority]}>{relativeDays(t.dueAt)}</Pill>
                </li>
              ))}
              {!open.length ? <li className="p-6 text-center text-sm text-muted-foreground">Nothing assigned to you.</li> : null}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="pay">
          <Section title="Payslips" bodyClassName="p-0">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Pay date</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Super</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {me.slips.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="pl-4">{dmy(s.run.payDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {dmy(s.run.periodStart)} – {dmy(s.run.periodEnd)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{aud(s.gross, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{aud(s.tax, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{aud(s.superAmount, 2)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{aud(s.net, 2)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Link href={`/app/me/payslips/${s.id}`} className="inline-flex items-center gap-1 text-xs hover:underline">
                        <FileText className="size-3.5" /> View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!me.slips.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                      No payslips yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
        <TabsContent value="leave">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Section title="My leave requests" bodyClassName="p-0">
              <ul>
                {me.leave.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0">
                    <span className="w-28 capitalize text-muted-foreground">{l.kind} leave</span>
                    <span className="min-w-0 flex-1">
                      {dmy(l.startDate)}
                      {l.endDate !== l.startDate ? ` – ${dmy(l.endDate)}` : ""} · {Number(l.hours)} h
                    </span>
                    <Pill t={leaveTone[l.status as keyof typeof leaveTone] ?? "gray"}>{label(l.status)}</Pill>
                  </li>
                ))}
                {!me.leave.length ? <li className="p-6 text-center text-sm text-muted-foreground">No leave requested.</li> : null}
              </ul>
            </Section>
            <Section title="Balances">
              <div className="grid gap-4 text-sm">
                {[
                  ["Annual leave", Number(p?.annualLeaveHours ?? 0), 152],
                  ["Personal leave", Number(p?.personalLeaveHours ?? 0), 76],
                ].map(([k, v, max]) => (
                  <div key={k as string}>
                    <p className="mb-1.5 flex justify-between">
                      <span>{k as string}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {(v as number).toFixed(1)} h · {((v as number) / 7.6).toFixed(1)} days
                      </span>
                    </p>
                    <ProgressBar value={(v as number) / (max as number)} />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">Accrues with each pay run: 4 weeks' annual and 10 days' personal leave a year for full-time staff.</p>
              </div>
            </Section>
          </div>
        </TabsContent>
        <TabsContent value="time">
          <Section title="Last 120 days" bodyClassName="p-0">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Matter</TableHead>
                  <TableHead>Note</TableHead>
                  <TableHead className="pr-4 text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {me.time.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="pl-4">{dmy(t.date)}</TableCell>
                    <TableCell className="tabular-nums">{Number(t.hours)}</TableCell>
                    <TableCell className="font-mono text-xs">{t.matterRef ?? "—"}</TableCell>
                    <TableCell className="max-w-[24rem] truncate text-muted-foreground">{t.note ?? ""}</TableCell>
                    <TableCell className="pr-4 text-right">{t.payRunId ? <Pill t="green">Paid</Pill> : t.billable ? <Pill t="violet">Billable</Pill> : <Pill>Logged</Pill>}</TableCell>
                  </TableRow>
                ))}
                {!me.time.length ? (
                  <TableRow>
                    <TableCell colSpan={5} className="p-6 text-center text-muted-foreground">
                      No time logged.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
        {mara ? (
          <TabsContent value="cpd">
            <div className="grid gap-3 lg:grid-cols-[20rem_minmax(0,1fr)]">
              <Section title="This registration year">
                <p className="text-3xl font-semibold tabular-nums">
                  {cpdYear}
                  <span className="text-base font-normal text-muted-foreground"> / {p?.cpdTarget ?? 10} points</span>
                </p>
                <ProgressBar value={cpdYear / (p?.cpdTarget ?? 10)} className="mt-3" />
                <p className="mt-3 text-xs text-muted-foreground">Keep evidence of each activity; OMARA can ask for it when you renew. Your target is set by your agency.</p>
              </Section>
              <Section title="Activities" bodyClassName="p-0">
                <ul>
                  {me.cpd.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 border-b px-4 py-2.5 text-sm last:border-0">
                      <span className="w-24 text-muted-foreground">{dmy(c.date)}</span>
                      <span className="min-w-0 flex-1 truncate">
                        {c.activity}
                        {c.provider ? <span className="text-muted-foreground"> · {c.provider}</span> : null}
                      </span>
                      <span className="tabular-nums">{Number(c.points)} pts</span>
                    </li>
                  ))}
                  {!me.cpd.length ? <li className="p-6 text-center text-sm text-muted-foreground">No CPD recorded yet.</li> : null}
                </ul>
              </Section>
            </div>
          </TabsContent>
        ) : null}
        <TabsContent value="details">
          <Section title="Pay and contact details">
            <MyDetails p={p} />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function MePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Me />
    </Suspense>
  );
}
