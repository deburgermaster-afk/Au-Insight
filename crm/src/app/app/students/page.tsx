import { CircleAlert, GraduationCap, HandCoins, Send, School } from "lucide-react";
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
import { getEducation, getPickers } from "@/lib/data";
import { aud, daysUntil, dmy, initials } from "@/lib/format";
import { appStages, appTone, commissionTone, stageLabel } from "@/lib/education";
import { AppMenu, CommissionMenu, CourseFinder, NewApplication, NewInstitution } from "./students-client";

export const metadata = { title: "Students" };

const commissionOf = (a: { tuitionFee: string | null; commissionRate: string | null }) => (Number(a.tuitionFee ?? 0) * Number(a.commissionRate ?? 0)) / 100;

async function Students() {
  await connection();
  const [{ apps, institutions }, pickers] = await Promise.all([getEducation(), getPickers()]);
  const insts = institutions.map((i) => ({ id: i.id, name: i.name }));
  const live = apps.filter((a) => !["rejected", "withdrawn"].includes(a.status));
  const sum = (st: string) => apps.filter((a) => a.commissionStatus === st).reduce((t, a) => t + commissionOf(a), 0);
  const ineligible = apps.filter((a) => a.commissionStatus === "ineligible");
  const closed = apps.filter((a) => ["rejected", "withdrawn"].includes(a.status));
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <NewInstitution />
        <NewApplication clients={pickers.clients} institutions={insts} />
      </HeaderActions>
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={GraduationCap} label="Active applications" value={live.length} hint={`${live.filter((a) => a.status === "enrolled").length} enrolled`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Send} label="Offers waiting" value={live.filter((a) => a.status === "offer" || a.status === "conditional").length} tone="violet" hint="Need student acceptance" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={HandCoins} label="Commission to claim" value={Math.round(sum("claimable") + sum("invoiced"))} prefix="$" tone="amber" hint={`${aud(sum("received"))} received`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={School} label="Partner institutions" value={institutions.length} tone="emerald" hint={`${institutions.filter((i) => i.agreementExpiry && daysUntil(i.agreementExpiry) < 90).length} agreements expire soon`} />
        </StaggerItem>
      </Stagger>
      <Tabs defaultValue="pipeline" className="gap-3">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="commissions">Commissions</TabsTrigger>
          <TabsTrigger value="institutions">Institutions</TabsTrigger>
          <TabsTrigger value="courses">Course finder</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline">
          <div className="-mx-3 overflow-x-auto px-3 pb-2">
            <div className="grid min-w-max auto-cols-[260px] grid-flow-col gap-3">
              {appStages.map((st) => {
                const col = live.filter((a) => a.status === st);
                return (
                  <div key={st} className="flex flex-col gap-2 rounded-2xl border bg-muted/20 p-2">
                    <div className="flex items-center justify-between px-1.5 pt-1">
                      <Pill t={appTone[st]}>{stageLabel(st)}</Pill>
                      <span className="text-xs text-muted-foreground tabular-nums">{col.length}</span>
                    </div>
                    {col.map((a) => (
                      <div key={a.id} className="rounded-xl border bg-card p-3 text-[13px]">
                        <div className="flex items-start gap-2">
                          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">{initials(a.student)}</span>
                          <div className="min-w-0 flex-1">
                            <Link href={`/app/clients/${a.clientId}`} className="font-medium hover:underline">
                              {a.student}
                            </Link>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{a.course}</p>
                          </div>
                          <AppMenu id={a.id} status={a.status} commission={a.commissionStatus} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span className="truncate">{a.institution ?? "No institution"}</span>
                          {a.intake ? <span>· {a.intake}</span> : null}
                          {a.onshoreTransfer ? <Pill t="amber">Onshore transfer</Pill> : null}
                        </div>
                      </div>
                    ))}
                    {!col.length ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here</p> : null}
                  </div>
                );
              })}
            </div>
          </div>
          {closed.length ? <p className="mt-2 text-xs text-muted-foreground">{closed.length} rejected or withdrawn applications hidden.</p> : null}
        </TabsContent>
        <TabsContent value="commissions">
          <Section bodyClassName="p-0">
            <Table className="text-[13px]">
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead className="pl-4">Student</TableHead>
                  <TableHead>Institution</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Tuition</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-4" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="pl-4">
                      <p className="font-medium">{a.student}</p>
                      <p className="max-w-64 truncate text-xs text-muted-foreground">{a.course}</p>
                    </TableCell>
                    <TableCell>{a.institution ?? "—"}</TableCell>
                    <TableCell>
                      <Pill t={appTone[a.status]}>{stageLabel(a.status)}</Pill>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{a.tuitionFee ? aud(a.tuitionFee) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.commissionRate ? `${Number(a.commissionRate)}%` : "—"}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{a.commissionStatus === "ineligible" ? <s className="text-muted-foreground">{aud(commissionOf(a))}</s> : aud(commissionOf(a))}</TableCell>
                    <TableCell>
                      <Pill t={commissionTone[a.commissionStatus]}>{label(a.commissionStatus)}</Pill>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <CommissionMenu id={a.id} commission={a.commissionStatus} />
                    </TableCell>
                  </TableRow>
                ))}
                {!apps.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-8 text-center text-muted-foreground">
                      No applications yet.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Section>
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
            <p>
              ESOS: providers can't pay commission for onshore students who change provider once they've been accepted after 31 March 2026. {ineligible.length ? `${ineligible.length} application${ineligible.length > 1 ? "s are" : " is"} flagged ineligible.` : ""} Commission becomes claimable at enrolment; record
              what you receive so it can be reported to the provider.
            </p>
          </div>
        </TabsContent>
        <TabsContent value="institutions">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {institutions.map((i) => {
              const n = apps.filter((a) => a.institutionId === i.id);
              const left = i.agreementExpiry ? daysUntil(i.agreementExpiry) : null;
              return (
                <div key={i.id} className="rounded-2xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {i.cricos ? `CRICOS ${i.cricos}` : "No CRICOS code"}
                        {i.state ? ` · ${i.state}` : ""}
                      </p>
                    </div>
                    {i.commissionRate ? <Pill t="green">{Number(i.commissionRate)}%</Pill> : null}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Students</p>
                      <p className="font-medium tabular-nums">{n.length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Enrolled</p>
                      <p className="font-medium tabular-nums">{n.filter((a) => a.status === "enrolled").length}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Agreement</p>
                      <p className={`font-medium ${left != null && left < 90 ? "text-amber-500" : ""}`}>{i.agreementExpiry ? dmy(i.agreementExpiry) : "—"}</p>
                    </div>
                  </div>
                  {i.contactName || i.contactEmail ? (
                    <p className="mt-3 truncate border-t pt-2 text-xs text-muted-foreground">
                      {i.contactName}
                      {i.contactEmail ? ` · ${i.contactEmail}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
            {!institutions.length ? <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">No partner institutions yet.</p> : null}
          </div>
        </TabsContent>
        <TabsContent value="courses">
          <CourseFinder clients={pickers.clients} institutions={insts} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="education">
        <Students />
      </Guard>
    </Suspense>
  );
}
