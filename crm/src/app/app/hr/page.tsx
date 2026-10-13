import { BadgeCheck, CalendarClock, ChevronRight, CircleAlert, FileSignature, PiggyBank, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { label, Pill } from "@/components/app/badges";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { Stagger, StaggerItem } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatCard } from "@/components/app/stat-card";
import { ContractLibrary } from "@/components/payroll/contracts";
import { NewPayRun, PayslipEditor, RunActions, RunDownloads, StpList, SuperTable } from "@/components/payroll/hr-payroll";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aud, daysUntil, dmy, initials, todayIso } from "@/lib/format";
import { getHr } from "@/lib/hr-data";
import { llmEnabled } from "@/lib/llm";
import { RULES } from "@/lib/payg";
import { nextPeriod } from "@/lib/payroll";
import { getPayroll, readiness } from "@/lib/payroll-data";
import { marnCurrent, positionLabel } from "@/lib/permissions";
import { LeaveDecision } from "./hr-client";

export const metadata = { title: "HR & payroll" };

const TABS = ["staff", "leave", "pay", "super", "stp", "contracts"];

async function Hr({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  const [{ staff, leave, runs }, payroll, sp] = await Promise.all([getHr(), getPayroll(), searchParams]);
  const tab = TABS.includes(sp.tab ?? "") ? sp.tab! : "staff";
  const today = todayIso();
  const pending = leave.filter((l) => l.status === "pending");
  const last = runs.find((r) => r.status === "finalised");
  const annualCost = staff.reduce((a, s) => {
    const p = s.profile;
    if (!p?.payRate) return a;
    const yearly = p.payType === "hourly" ? Number(p.payRate) * Number(p.hoursPerWeek) * 52 : Number(p.payRate);
    return a + yearly * (1 + Number(p.superRate) / 100);
  }, 0);
  const st = payroll.settings;
  const suggested = st.periodStart ? nextPeriod(st.periodStart, st.frequency as "weekly", st.payLagDays) : null;
  const superDue = payroll.contributions.filter((c) => c.status !== "paid");
  const superLate = superDue.filter((c) => c.dueDate < today);
  const stpOpen = payroll.events.filter((e) => e.status === "ready" || e.status === "needs_fixing");
  const xero = payroll.connectors.some((c) => c.kind === "xero" && c.status === "active");
  const eh = payroll.connectors.some((c) => c.kind === "employment_hero" && c.status === "active");
  const setupGaps = [!st.contactName && "STP contact", !st.stpDeclarationName && "STP declarer", !st.postcode && "business address", !st.defaultFundUsi && "default super fund", !st.payBsb && "wages bank account"].filter(Boolean) as string[];
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <NewPayRun suggested={suggested} frequency={st.frequency} />
      </HeaderActions>
      {setupGaps.length ? (
        <Link href="/app/settings/payroll" className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-[13px] hover:bg-amber-500/10">
          <CircleAlert className="size-4 text-amber-500" />
          <span className="flex-1">Finish payroll setup: {setupGaps.join(", ")}.</span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ) : null}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Users} label="Staff" value={staff.length} hint={`${staff.filter((s) => readiness(s.profile).length === 0).length} ready for payroll`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CalendarClock} label="Leave to approve" value={pending.length} tone="amber" hint={`${leave.filter((l) => l.status === "approved").length} approved`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Wallet} label="Last pay run (net)" value={Math.round(Number(last?.net ?? 0))} prefix="$" tone="emerald" hint={last ? `Paid ${dmy(last.payDate)}` : "No pay runs yet"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={PiggyBank} label="Super to pay" value={Math.round(superDue.reduce((a, c) => a + Number(c.sg) + Number(c.sacrifice) + Number(c.extra), 0))} prefix="$" tone={superLate.length ? "rose" : "violet"} hint={superLate.length ? `${superLate.length} late` : superDue.length ? `Next due ${dmy(superDue.map((c) => c.dueDate).sort()[0])}` : `Payroll + super ${aud(annualCost)}/yr`} />
        </StaggerItem>
      </Stagger>
      <Tabs defaultValue={tab} className="gap-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="leave">Leave {pending.length ? `· ${pending.length}` : ""}</TabsTrigger>
          <TabsTrigger value="pay">Pay runs</TabsTrigger>
          <TabsTrigger value="super">Super {superDue.length ? `· ${superDue.length}` : ""}</TabsTrigger>
          <TabsTrigger value="stp">STP {stpOpen.length ? `· ${stpOpen.length}` : ""}</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
        </TabsList>
        <TabsContent value="staff">
          <Section bodyClassName="p-0">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Payroll</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Annual leave</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((s) => {
                  const p = s.profile;
                  const mara = p?.position === "principal" || p?.position === "migration_agent";
                  const ok = marnCurrent(p?.marn, p?.marnExpiry);
                  const days = p?.marnExpiry ? daysUntil(p.marnExpiry) : null;
                  const gaps = readiness(p);
                  return (
                    <TableRow key={s.memberId} className="group">
                      <TableCell className="pl-4">
                        <Link href={`/app/hr/people/${s.userId}`} className="flex items-center gap-2.5">
                          <span className="grid size-8 place-items-center rounded-full bg-muted text-[11px] font-semibold">{initials(s.name)}</span>
                          <span>
                            <span className="block font-medium group-hover:underline">{s.name}</span>
                            <span className="block text-xs text-muted-foreground">{s.email}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <p>{positionLabel(p?.position ?? "consultant")}</p>
                        <p className="text-xs text-muted-foreground">
                          {label(s.role)} access · {(p?.employment ?? "full_time").replace("_", " ")}
                        </p>
                      </TableCell>
                      <TableCell>
                        {mara ? (
                          ok ? (
                            <span className={`inline-flex items-center gap-1 text-xs ${days != null && days < 60 ? "text-amber-500" : "text-sky-500"}`}>
                              <BadgeCheck className="size-3.5" /> MARN {p?.marn}
                              {days != null && days < 60 ? ` · renew in ${days}d` : ""}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-rose-500">
                              <CircleAlert className="size-3.5" /> {p?.marn ? "MARN expired" : "No MARN"}
                            </span>
                          )
                        ) : p?.qeac ? (
                          <span className="text-xs text-muted-foreground">QEAC {p.qeac}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>{gaps.length ? <span className="text-xs text-amber-500" title={gaps.map((g) => g.text).join(", ")}>{gaps.length} to set up</span> : <span className="text-xs text-emerald-500">Ready</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{p?.payRate ? (p.payType === "hourly" ? `${aud(p.payRate, 2)}/h` : `${aud(p.payRate)}/yr`) : <span className="text-muted-foreground">Not set</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(p?.annualLeaveHours ?? 0).toFixed(1)} h</TableCell>
                      <TableCell className="pr-4 text-right">
                        <Link href={`/app/hr/people/${s.userId}`} className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground">
                          Open <ChevronRight className="size-3.5" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Section>
        </TabsContent>
        <TabsContent value="leave">
          <Section bodyClassName="p-0">
            <ul>
              {leave.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                  <span className="w-40 font-medium">{l.name}</span>
                  <span className="w-32 capitalize text-muted-foreground">{l.kind} leave</span>
                  <span className="min-w-0 flex-1">
                    {dmy(l.startDate)}
                    {l.endDate !== l.startDate ? ` – ${dmy(l.endDate)}` : ""} · {Number(l.hours)} h{l.note ? <span className="text-muted-foreground"> · {l.note}</span> : null}
                  </span>
                  {l.status === "pending" ? <LeaveDecision id={l.id} /> : <Pill t={l.status === "approved" ? "green" : "red"}>{label(l.status)}</Pill>}
                </li>
              ))}
              {!leave.length ? <li className="p-8 text-center text-sm text-muted-foreground">No leave requests.</li> : null}
            </ul>
          </Section>
        </TabsContent>
        <TabsContent value="pay">
          <div className="grid gap-3">
            {runs.map((r) => {
              const warnings = r.slips.reduce((a, p) => a + (p.notes?.length ?? 0), 0);
              const ev = payroll.events.find((e) => e.payRunId === r.id);
              return (
                <Section
                  key={r.id}
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {dmy(r.periodStart)} – {dmy(r.periodEnd)} · paid {dmy(r.payDate)}
                      <Pill t={r.status === "finalised" ? "green" : "amber"}>{label(r.status)}</Pill>
                      {ev ? <span className="text-[11px] font-normal text-muted-foreground">STP: {ev.status === "accepted" ? "accepted" : ev.status === "lodged" ? "lodged" : ev.status === "needs_fixing" ? "fix details" : "ready to lodge"}</span> : null}
                    </span>
                  }
                  action={r.status === "draft" ? <RunActions id={r.id} warnings={warnings} /> : <RunDownloads id={r.id} xero={xero} />}
                  bodyClassName="p-0"
                >
                  <Table className="text-[13px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">Employee</TableHead>
                        <TableHead>Tax scale</TableHead>
                        <TableHead className="text-right">Hours</TableHead>
                        <TableHead className="text-right">Gross</TableHead>
                        <TableHead className="text-right">Tax</TableHead>
                        <TableHead className="text-right">Super</TableHead>
                        <TableHead className="text-right">Net</TableHead>
                        <TableHead className="pr-4" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {r.slips.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="max-w-80 pl-4 whitespace-normal">
                            <p className="font-medium">{p.name}</p>
                            {p.notes?.length ? (
                              <p className="flex items-start gap-1 text-[11px] leading-snug text-amber-500">
                                <CircleAlert className="mt-px size-3 shrink-0" /> {p.notes.join(" ")}
                              </p>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-[11px] text-muted-foreground">
                            {p.taxScale ?? "—"}
                            {Number(p.stsl) ? ` · STSL ${aud(p.stsl)}` : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{Number(p.hours)}</TableCell>
                          <TableCell className="text-right tabular-nums">{aud(p.gross, 2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{aud(p.tax, 2)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{aud(p.superAmount, 2)}</TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{aud(p.net, 2)}</TableCell>
                          <TableCell className="pr-4 text-right whitespace-nowrap">
                            {r.status === "draft" ? <PayslipEditor id={p.id} name={p.name} extras={p.extras} rate={staffRate(staff, p.userId)} /> : null}
                            <Link href={`/app/me/payslips/${p.id}`} className="ml-1 text-xs hover:underline">
                              Payslip
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell className="pl-4">Total</TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell className="text-right tabular-nums">{aud(r.gross, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{aud(r.tax, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{aud(r.superTotal, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums">{aud(r.net, 2)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                </Section>
              );
            })}
            {!runs.length ? <p className="rounded-xl border p-10 text-center text-sm text-muted-foreground">No pay runs yet. Set pay rates on each person&apos;s record, then start a pay run.</p> : null}
            <p className="text-xs text-muted-foreground">
              Tax uses the ATO&apos;s {RULES.year} withholding formulas (Schedule 1, and Schedule 8 for study loans). Super is {RULES.sgRate}% of qualifying earnings, due at the fund within {RULES.superDueDays} days of payday. Pay is checked against the ${RULES.nationalMinimumHourly}/hour national minimum wage and each person&apos;s award rate.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="super">
          <SuperTable rows={payroll.contributions.map((c) => ({ ...c, fund: c.fund }))} today={today} />
        </TabsContent>
        <TabsContent value="stp">
          <StpList rows={payroll.events} via={st.stpVia} ehConnected={eh} />
        </TabsContent>
        <TabsContent value="contracts" className="grid gap-4">
          <ContractLibrary templates={payroll.templates} aiOn={llmEnabled()} />
          {payroll.contracts.length ? (
            <Section title={<span className="flex items-center gap-2"><FileSignature className="size-4" /> Issued contracts</span>} bodyClassName="p-0">
              <ul>
                {payroll.contracts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0">
                    <Link href={`/app/hr/contracts/${c.id}`} className="min-w-0 flex-1 truncate hover:underline">
                      <span className="font-medium">{c.name}</span> <span className="text-muted-foreground">· {c.title}</span>
                    </Link>
                    <span className="text-muted-foreground">{c.signedAt ? `Signed ${dmy(c.signedAt)}` : c.sentAt ? `Sent ${dmy(c.sentAt)}` : "Draft"}</span>
                    <Pill t={c.status === "signed" ? "green" : c.status === "sent" ? "blue" : c.status === "void" ? "red" : "gray"}>{c.status === "sent" ? "Waiting" : label(c.status)}</Pill>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function staffRate(staff: Awaited<ReturnType<typeof getHr>>["staff"], userId: string) {
  const p = staff.find((s) => s.userId === userId)?.profile;
  if (!p?.payRate) return null;
  return p.payType === "hourly" ? Number(p.payRate) : Number(p.payRate) / 52 / Math.max(1, Number(p.hoursPerWeek));
}

export default function HrPage(props: { searchParams: Promise<{ tab?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="payroll">
        <Hr {...props} />
      </Guard>
    </Suspense>
  );
}
