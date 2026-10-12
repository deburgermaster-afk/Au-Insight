import { BadgeCheck, CircleAlert } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aud, daysUntil, dmy, initials } from "@/lib/format";
import { getHr } from "@/lib/hr-data";
import { marnCurrent, positionLabel } from "@/lib/permissions";
import { CalendarClock, Users, Wallet, PiggyBank } from "lucide-react";
import { EditStaff, LeaveDecision, NewPayRun, RunActions } from "./hr-client";

export const metadata = { title: "HR & payroll" };

async function Hr() {
  await connection();
  const { staff, leave, runs } = await getHr();
  const pending = leave.filter((l) => l.status === "pending");
  const last = runs.find((r) => r.status === "finalised");
  const annualCost = staff.reduce((a, s) => {
    const p = s.profile;
    if (!p?.payRate) return a;
    const yearly = p.payType === "hourly" ? Number(p.payRate) * Number(p.hoursPerWeek) * 52 : Number(p.payRate);
    return a + yearly * (1 + Number(p.superRate) / 100);
  }, 0);
  const managers = staff.map((s) => ({ id: s.userId, name: s.name }));
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <NewPayRun />
      </HeaderActions>
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Users} label="Staff" value={staff.length} hint={`${staff.filter((s) => s.profile?.position === "migration_agent" || s.profile?.position === "principal").length} registered agents`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CalendarClock} label="Leave to approve" value={pending.length} tone="amber" hint={`${leave.filter((l) => l.status === "approved").length} approved this year`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Wallet} label="Last pay run (net)" value={Math.round(Number(last?.net ?? 0))} prefix="$" tone="emerald" hint={last ? `Paid ${dmy(last.payDate)}` : "No pay runs yet"} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={PiggyBank} label="Annual payroll + super" value={Math.round(annualCost)} prefix="$" tone="violet" hint="From current rates" />
        </StaggerItem>
      </Stagger>
      <Tabs defaultValue="staff" className="gap-3">
        <TabsList>
          <TabsTrigger value="staff">Staff</TabsTrigger>
          <TabsTrigger value="leave">Leave {pending.length ? `· ${pending.length}` : ""}</TabsTrigger>
          <TabsTrigger value="pay">Pay runs</TabsTrigger>
        </TabsList>
        <TabsContent value="staff">
          <Section bodyClassName="p-0">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Registration</TableHead>
                  <TableHead>Employment</TableHead>
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
                  return (
                    <TableRow key={s.memberId}>
                      <TableCell className="pl-4">
                        <div className="flex items-center gap-2.5">
                          <span className="grid size-8 place-items-center rounded-full bg-muted text-[11px] font-semibold">{initials(s.name)}</span>
                          <div>
                            <p className="font-medium">{s.name}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <p>{positionLabel(p?.position ?? "consultant")}</p>
                        <p className="text-xs text-muted-foreground">{label(s.role)} access</p>
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
                      <TableCell className="capitalize">{(p?.employment ?? "full_time").replace("_", " ")}</TableCell>
                      <TableCell className="text-right tabular-nums">{p?.payRate ? (p.payType === "hourly" ? `${aud(p.payRate, 2)}/h` : `${aud(p.payRate)}/yr`) : <span className="text-muted-foreground">Not set</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(p?.annualLeaveHours ?? 0).toFixed(1)} h</TableCell>
                      <TableCell className="pr-4 text-right">
                        <EditStaff userId={s.userId} name={s.name} p={p} managers={managers.filter((m) => m.id !== s.userId)} />
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
            {runs.map((r) => (
              <Section
                key={r.id}
                title={
                  <span className="flex items-center gap-2">
                    {dmy(r.periodStart)} – {dmy(r.periodEnd)} · paid {dmy(r.payDate)}
                    <Pill t={r.status === "finalised" ? "green" : "amber"}>{label(r.status)}</Pill>
                  </span>
                }
                action={r.status === "draft" ? <RunActions id={r.id} /> : <span className="text-xs text-muted-foreground">{label(r.frequency)}</span>}
                bodyClassName="p-0"
              >
                <Table className="text-[13px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Employee</TableHead>
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
                        <TableCell className="pl-4 font-medium">{p.name}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(p.hours)}</TableCell>
                        <TableCell className="text-right tabular-nums">{aud(p.gross, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{aud(p.tax, 2)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{aud(p.superAmount, 2)}</TableCell>
                        <TableCell className="text-right font-medium tabular-nums">{aud(p.net, 2)}</TableCell>
                        <TableCell className="pr-4 text-right">
                          <Link href={`/app/me/payslips/${p.id}`} className="text-xs hover:underline">
                            Payslip
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell className="pl-4">Total</TableCell>
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
            ))}
            {!runs.length ? <p className="rounded-xl border p-10 text-center text-sm text-muted-foreground">No pay runs yet. Set pay rates under Staff, then start a pay run.</p> : null}
            <p className="text-xs text-muted-foreground">
              Withholding is an estimate from 2026–27 resident rates; check against the ATO tables. Report each pay to the ATO through Single Touch Payroll and pay super within 7 days of payday.
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function HrPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="payroll">
        <Hr />
      </Guard>
    </Suspense>
  );
}
