import { ArrowRightLeft, BadgeCheck, CircleAlert, CircleCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { PageSkeleton } from "@/components/app/skeletons";
import { IssueContract } from "@/components/payroll/contracts";
import { EmployeeSelfSections, EmploymentSections } from "@/components/payroll/employee-sections";
import { Pill, Summary } from "@/components/settings/summary";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { aud, dmy, initials } from "@/lib/format";
import { getEmployee, getPayroll, readiness } from "@/lib/payroll-data";
import { marnCurrent, positionLabel } from "@/lib/permissions";

export const metadata = { title: "Employee" };

const ctone = { draft: "muted", sent: "info", signed: "ok", void: "bad" } as const;

async function Employee({ params }: { params: Promise<{ userId: string }> }) {
  await connection();
  const { userId } = await params;
  const [e, payroll] = await Promise.all([getEmployee(userId), getPayroll()]);
  if (!e) notFound();
  const p = e.profile;
  const gaps = readiness(p);
  const awardConnected = payroll.connectors.some((c) => c.kind === "fwc" && c.status === "active") || Boolean(process.env.FWC_API_KEY);
  const settings = { whmRegistered: e.settings.whmRegistered, defaultFundName: e.settings.defaultFundName, frequency: e.settings.frequency };
  const finalised = e.slips.filter((x) => x.run.status === "finalised");
  const fyStart = `${new Date().getMonth() < 6 ? new Date().getFullYear() - 1 : new Date().getFullYear()}-07-01`;
  const ytd = finalised.filter((x) => x.run.payDate >= fyStart);
  const sum = (k: "gross" | "tax" | "superAmount" | "net") => ytd.reduce((a, x) => a + Number(x[k]), 0);
  const mara = p?.position === "principal" || p?.position === "migration_agent";
  return (
    <div className="grid gap-4">
      <HeaderActions>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/app/team/handover?from=${userId}`}>
            <ArrowRightLeft /> Hand over work
          </Link>
        </Button>
        <IssueContract userId={userId} templates={payroll.templates.map((t) => ({ id: t.id, name: t.name }))} />
      </HeaderActions>
      <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <span className="grid size-14 place-items-center rounded-full bg-muted text-lg font-semibold">{initials(e.name)}</span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold tracking-tight">{[p?.givenName, p?.familyName].filter(Boolean).join(" ") || e.name}</p>
          <p className="text-[13px] text-muted-foreground">
            {p?.title ?? positionLabel((p?.position ?? "consultant") as "consultant")} · {e.email}
            {p?.startDate ? ` · since ${dmy(p.startDate)}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {gaps.length ? <Pill tone="warn">{gaps.length} to set up for payroll</Pill> : <Pill tone="ok">Ready for payroll</Pill>}
            {mara ? marnCurrent(p?.marn, p?.marnExpiry) ? <Pill tone="info">MARN {p?.marn}</Pill> : <Pill tone="bad">MARN not current</Pill> : null}
            {p?.endDate ? <Pill tone="muted">Finished {dmy(p.endDate)}</Pill> : null}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] sm:grid-cols-4">
          <div>
            <dt className="text-muted-foreground">Gross this year</dt>
            <dd className="font-medium tabular-nums">{aud(sum("gross"))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Tax this year</dt>
            <dd className="font-medium tabular-nums">{aud(sum("tax"))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Super this year</dt>
            <dd className="font-medium tabular-nums">{aud(sum("superAmount"))}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Annual leave</dt>
            <dd className="font-medium tabular-nums">{Number(p?.annualLeaveHours ?? 0).toFixed(1)} h</dd>
          </div>
        </dl>
      </section>
      <Tabs defaultValue={gaps.length ? "overview" : "details"} className="gap-3">
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="details">Details & tax</TabsTrigger>
          <TabsTrigger value="job">Job & pay</TabsTrigger>
          <TabsTrigger value="leave">Leave</TabsTrigger>
          <TabsTrigger value="pay">Payslips</TabsTrigger>
          <TabsTrigger value="super">Super</TabsTrigger>
          <TabsTrigger value="contracts">Contracts {e.contracts.length ? `· ${e.contracts.length}` : ""}</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-3">
          <Summary title="Payroll checklist" description="Everything needed to pay them correctly and report to the ATO. They can fill in their own details from Me → Payroll details.">
            <ul className="grid gap-1.5 text-[13px] sm:grid-cols-2">
              {[
                ["Pay rate", !gaps.some((g) => g.text === "Pay rate")],
                ["Legal name", !gaps.some((g) => g.text === "Legal name")],
                ["Date of birth", !gaps.some((g) => g.text === "Date of birth")],
                ["Home address", !gaps.some((g) => g.text === "Home address")],
                ["TFN declaration", !gaps.some((g) => g.text === "TFN declaration")],
                ["Super choice", !gaps.some((g) => g.text === "Super choice")],
                ["Bank account", !gaps.some((g) => g.text === "Bank account")],
                ["Start date", !gaps.some((g) => g.text === "Start date")],
                ["Signed contract", e.contracts.some((c) => c.status === "signed")],
              ].map(([label, ok]) => (
                <li key={String(label)} className="flex items-center gap-2">
                  {ok ? <CircleCheck className="size-4 text-emerald-500" /> : <CircleAlert className="size-4 text-amber-500" />} {label}
                </li>
              ))}
            </ul>
          </Summary>
        </TabsContent>
        <TabsContent value="details">
          <EmployeeSelfSections p={p} userId={userId} tfnLast3={e.tfnLast3} settings={settings} show={["personal", "tax", "super", "bank"]} />
        </TabsContent>
        <TabsContent value="job">
          <EmploymentSections p={p} userId={userId} managers={e.managers} settings={settings} awardConnected={awardConnected} />
        </TabsContent>
        <TabsContent value="leave" className="grid gap-3">
          <Summary
            title="Leave balances"
            description="Accrue each pay on ordinary hours: 4 weeks' annual and 10 days' personal leave a year (NES). Casuals don't accrue."
            rows={[
              { label: "Annual leave", value: `${Number(p?.annualLeaveHours ?? 0).toFixed(2)} hours` },
              { label: "Personal/carer's leave", value: `${Number(p?.personalLeaveHours ?? 0).toFixed(2)} hours` },
            ]}
          />
          <section className="rounded-2xl border bg-card">
            {e.leave.length ? (
              <ul>
                {e.leave.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0">
                    <span className="w-28 capitalize">{l.kind} leave</span>
                    <span className="flex-1">
                      {dmy(l.startDate)}
                      {l.endDate !== l.startDate ? ` – ${dmy(l.endDate)}` : ""} · {Number(l.hours)} h
                    </span>
                    <Pill tone={l.status === "approved" ? "ok" : l.status === "declined" ? "bad" : "warn"}>{l.status}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No leave requests.</p>
            )}
          </section>
        </TabsContent>
        <TabsContent value="pay">
          <section className="overflow-hidden rounded-2xl border bg-card">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Paid</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Tax</TableHead>
                  <TableHead className="text-right">Super</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.slips.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="pl-4">{dmy(x.run.payDate)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {dmy(x.run.periodStart)} – {dmy(x.run.periodEnd)} {x.run.status === "draft" ? <Pill tone="warn">Draft</Pill> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{aud(x.gross, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{aud(x.tax, 2)}</TableCell>
                    <TableCell className="text-right tabular-nums">{aud(x.superAmount, 2)}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{aud(x.net, 2)}</TableCell>
                    <TableCell className="pr-4 text-right">
                      <Link className="text-xs hover:underline" href={`/app/me/payslips/${x.id}`}>
                        Payslip
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
                {!e.slips.length ? (
                  <TableRow>
                    <TableCell colSpan={7} className="p-6 text-center text-muted-foreground">
                      No payslips yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </section>
        </TabsContent>
        <TabsContent value="super">
          <section className="rounded-2xl border bg-card">
            {e.contributions.length ? (
              <ul>
                {e.contributions.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0">
                    <span className="w-32">Pay {dmy(c.payDate)}</span>
                    <span className="flex-1 text-muted-foreground">{c.fund.name ?? "Default fund"}</span>
                    <span className="tabular-nums">{aud(Number(c.sg) + Number(c.sacrifice) + Number(c.extra), 2)}</span>
                    <Pill tone={c.status === "paid" ? "ok" : c.status === "sent" ? "info" : "warn"}>{c.status === "due" ? `Due ${dmy(c.dueDate)}` : c.status}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No super contributions yet. They&apos;re booked when a pay run is finalised.</p>
            )}
          </section>
        </TabsContent>
        <TabsContent value="contracts">
          <section className="rounded-2xl border bg-card">
            {e.contracts.length ? (
              <ul>
                {e.contracts.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5 text-[13px] last:border-0">
                    <Link href={`/app/hr/contracts/${c.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {c.title}
                    </Link>
                    <span className="text-muted-foreground">{c.signedAt ? `Signed ${dmy(c.signedAt)}` : c.sentAt ? `Sent ${dmy(c.sentAt)}` : `Drafted ${dmy(c.createdAt)}`}</span>
                    <Pill tone={ctone[c.status as keyof typeof ctone] ?? "muted"}>{c.status === "sent" ? "Waiting" : c.status}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                <BadgeCheck className="size-4" /> No contracts yet. Use Issue contract to fill a template with their details.
              </p>
            )}
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page(props: { params: Promise<{ userId: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="payroll">
        <Employee {...props} />
      </Guard>
    </Suspense>
  );
}
