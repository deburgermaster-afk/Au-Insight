import { ArrowLeft, Briefcase, Download, Eye, FileText, Mail, Plus, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { clientStageTone, invoiceTone, label, matterStageTone, Pill, priorityTone } from "@/components/app/badges";
import { ClientStageSelect, NoteComposer, TaskCheck } from "@/components/app/inline-actions";
import { FadeIn, ProgressBar } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { FactStrip } from "@/components/app/stat-card";
import { Timeline } from "@/components/app/timeline";
import { WithPickers } from "@/components/app/with-pickers";
import { ComposeDialog, NewAppointmentDialog, NewInvoiceDialog, NewMatterDialog, NewTaskDialog, RecordPaymentDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { HeaderActions } from "@/components/app/header-actions";
import { PortalMenu } from "@/components/portal/staff-actions";
import { PathwayPanel } from "@/components/app/pathways";
import { ClientEmails, InsightCard } from "@/components/mail-ai/insight";
import { UploadButton } from "@/components/mail/upload-button";
import { getCtx } from "@/lib/session";
import { fileUrl } from "@/components/mail/file-icon";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClient } from "@/lib/data";
import { aud, daysUntil, dmy, fullName, initials, relativeDays, time } from "@/lib/format";
import { stages, visaByCode } from "@/lib/visas";

const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k;

function Tile({ label: l, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/80">{l}</p>
      <p className="mt-2 text-xl font-semibold tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="uppercase tracking-wide text-muted-foreground/80">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  );
}

async function ClientView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const [data, ctx] = await Promise.all([getClient(id), getCtx()]);
  if (!data) notFound();
  const { client: c, matters, documents, activities, tasks, dependants, invoices, appointments, pathway, studies, emails, insights, aiMailOn } = data;
  const openInsights = insights.filter((i) => i.actionStatus === "open" && i.category !== "unrelated");
  const name = fullName(c);
  const invoiced = invoices.reduce((a, i) => a + Number(i.total), 0);
  const paid = invoices.reduce((a, i) => a + Number(i.paid), 0);
  const nextDue = invoices.filter((i) => Number(i.total) - Number(i.paid) > 0.005 && i.status !== "void").sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0];
  const open = matters.filter((m) => m.stage !== "closed");

  return (
    <div className="grid gap-4">
      <FadeIn className="flex flex-wrap items-center gap-3">
        <Link href="/app/clients" aria-label="Back" className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.78_0.15_60)] to-[oklch(0.62_0.2_20)] text-sm font-semibold text-white shadow-lg shadow-orange-500/10">{initials(name)}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
          <p className="truncate text-[13px] text-muted-foreground">{[c.occupation, c.nationality, c.onshore ? "Onshore" : "Offshore"].filter(Boolean).join(" • ")}</p>
        </div>
        <HeaderActions>
          <ClientStageSelect clientId={c.id} stage={c.stage} />
          <ComposeDialog
            to={c.email ?? ""}
            clientId={c.id}
            trigger={
              <Button size="sm" variant="outline">
                <Mail /> Email
              </Button>
            }
          />
          <UploadButton agencyId={ctx.agencyId} clientId={c.id} label="Upload" />
          <PortalMenu clientId={c.id} enabled={c.portalEnabled} hasEmail={Boolean(c.email)} />
          <WithPickers render={(p) => <NewMatterDialog pickers={p} clientId={c.id} />} />
        </HeaderActions>
      </FadeIn>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="grid min-w-0 gap-4">
      {openInsights.length ? (
        <FadeIn className="grid gap-2">
          {openInsights.slice(0, 3).map((i) => (
            <InsightCard key={i.id} i={i} from={emails.find((e) => e.id === i.messageId)?.fromName ?? undefined} />
          ))}
        </FadeIn>
      ) : null}
      <FadeIn delay={0.04}>
        <Section title="Client details">
          <FactStrip
            items={[
              { label: "Total matters", value: `${matters.length} matter${matters.length === 1 ? "" : "s"}`, tone: "rose" },
              { label: "Open matters", value: `${open.length} open`, tone: "amber" },
              { label: "Current visa", value: c.currentVisa ? `${c.currentVisa} · ${visaByCode(c.currentVisa)?.name ?? ""}` : null, tone: "primary" },
              { label: "Visa expiry", value: c.visaExpiry ? dmy(c.visaExpiry) : null, tone: "violet" },
              { label: "Passport", value: c.passportNumber, tone: "sky" },
              { label: "Client status", value: <Pill t={clientStageTone[c.stage]}>{label(c.stage)}</Pill>, tone: "emerald" },
            ]}
          />
        </Section>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Section title="Contact information">
          <FactStrip
            items={[
              { label: "Address", value: [c.address, c.city, c.state].filter(Boolean).join(", ") || null, tone: "rose" },
              { label: "Email", value: c.email, tone: "primary" },
              { label: "Phone", value: c.phone, tone: "amber" },
              { label: "Date of birth", value: c.dateOfBirth ? dmy(c.dateOfBirth) : null, tone: "violet" },
              { label: "Source", value: c.source ? label(c.source) : null, tone: "sky" },
              { label: "Client since", value: dmy(c.createdAt), tone: "emerald" },
            ]}
          />
        </Section>
      </FadeIn>

      <FadeIn delay={0.12}>
        <Section title="Client activity" bodyClassName="p-3 sm:p-4">
          <Tabs defaultValue="matters" className="gap-4">
            <TabsList className="max-w-full justify-start overflow-x-auto">
              <TabsTrigger value="matters">Matters</TabsTrigger>
              <TabsTrigger value="emails">
                Emails{emails.length ? ` · ${emails.length}` : ""}
              </TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="tasks">Tasks</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="family">Family</TabsTrigger>
            </TabsList>

            <TabsContent value="matters">
              {matters.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {matters.map((m) => (
                    <Link key={m.id} href={`/app/matters/${m.id}`} className="rounded-xl border bg-muted/20 p-4 transition hover:border-foreground/15">
                      <div className="flex items-center gap-2">
                        <Briefcase className="size-4 text-muted-foreground" />
                        <span className="font-mono text-[11px] text-muted-foreground">{m.reference}</span>
                        <Pill t={matterStageTone[m.stage]} className="ml-auto">
                          {stageLabel(m.stage)}
                        </Pill>
                      </div>
                      <p className="mt-3 truncate text-sm font-medium">{m.title}</p>
                      <div className="mt-3 grid gap-1.5">
                        <Row k="Priority" v={<Pill t={priorityTone[m.priority]}>{label(m.priority)}</Pill>} />
                        <Row k="TRN" v={m.trn ?? "—"} />
                        <Row k={m.lodgedAt ? "Lodged" : "Target"} v={dmy(m.lodgedAt ?? m.dueAt)} />
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No matters yet.</p>
              )}
            </TabsContent>

            <TabsContent value="documents">
              {documents.length ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {documents.map((d) => {
                    const days = d.expiresAt ? daysUntil(d.expiresAt) : null;
                    const status = days != null && days < 0 ? ["Expired", "text-rose-500"] : d.certified ? ["Verified", "text-emerald-500"] : ["Pending review", "text-amber-500"];
                    return (
                      <div key={d.id} className="flex flex-col rounded-xl border bg-muted/20 p-3.5">
                        <p className="flex items-center gap-2 text-sm font-medium">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="truncate">{d.name}</span>
                        </p>
                        <div className="mt-3 grid gap-1.5">
                          <Row k="Type" v={d.category ?? "Document"} />
                          <Row k="Uploaded" v={dmy(d.createdAt)} />
                          <Row k="Expiry" v={d.expiresAt ? `Valid till ${dmy(d.expiresAt)}` : "N/A"} />
                          <Row k="Translated" v={d.translated ? "Yes" : "No"} />
                          <Row k="Status" v={<span className={status[1]}>{status[0]}</span>} />
                        </div>
                        <div className="mt-3.5 grid grid-cols-2 gap-2">
                          {d.storageKey ? (
                            <>
                              <Button size="sm" variant="secondary" asChild>
                                <a href={fileUrl(d.storageKey, d.name)} target="_blank" rel="noreferrer">
                                  <Eye /> View
                                </a>
                              </Button>
                              <Button size="sm" variant="secondary" asChild>
                                <a href={fileUrl(d.storageKey, d.name, true)}>
                                  <Download /> Download
                                </a>
                              </Button>
                            </>
                          ) : (
                            <p className="col-span-2 rounded-md bg-muted/50 px-2 py-1.5 text-center text-[11px] text-muted-foreground">Recorded without a file</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No documents on file.</p>
              )}
            </TabsContent>

            <TabsContent value="financial">
              <div className="grid gap-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile label="Total invoiced" value={aud(invoiced)} />
                  <Tile label="Total paid" value={aud(paid)} />
                  <Tile label="Outstanding balance" value={aud(invoiced - paid)} />
                  <Tile label="Next payment due" value={nextDue ? aud(Number(nextDue.total) - Number(nextDue.paid)) : "—"} />
                </div>
                <div className="flex items-center gap-2 pt-2">
                  <p className="tick text-sm font-medium" style={{ "--tick": "var(--chart-2)" } as React.CSSProperties}>
                    Invoices
                  </p>
                  <div className="ml-auto">
                    <WithPickers render={(p) => <NewInvoiceDialog pickers={p} clientId={c.id} />} />
                  </div>
                </div>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                      <tr>
                        {["Invoice #", "Issued", "Amount", "Paid", "Status", "Due date", ""].map((h) => (
                          <th key={h} className="border-r px-3 py-2.5 font-medium last:border-r-0">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((i) => {
                        const owing = Number(i.total) - Number(i.paid);
                        return (
                          <tr key={i.id} className="border-t">
                            <td className="px-3 py-3 font-mono">{i.number}</td>
                            <td className="px-3 py-3 text-muted-foreground">{dmy(i.issuedAt)}</td>
                            <td className="px-3 py-3 tabular-nums">{aud(i.total, 2)}</td>
                            <td className="px-3 py-3 tabular-nums text-muted-foreground">{aud(i.paid, 2)}</td>
                            <td className="px-3 py-3">
                              <Pill t={invoiceTone[owing <= 0.005 ? "paid" : i.status]}>{label(owing <= 0.005 ? "paid" : i.status)}</Pill>
                            </td>
                            <td className="px-3 py-3 text-muted-foreground">{dmy(i.dueAt)}</td>
                            <td className="px-3 py-3 text-right">
                              {owing > 0.005 && i.status !== "void" ? (
                                <RecordPaymentDialog invoiceId={i.id} outstanding={owing} trigger={<Button size="xs" variant="outline">Record payment</Button>} />
                              ) : null}
                            </td>
                          </tr>
                        );
                      })}
                      {!invoices.length ? (
                        <tr>
                          <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                            No invoices.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tasks">
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center">
                    <p className="text-sm font-medium">Tasks</p>
                    <div className="ml-auto">
                      <WithPickers render={(p) => <NewTaskDialog pickers={p} clientId={c.id} />} />
                    </div>
                  </div>
                  {tasks.length ? (
                    <ul className="grid gap-3">
                      {tasks.map((t) => (
                        <li key={t.id} className="flex items-center gap-3">
                          <TaskCheck id={t.id} done={t.status === "done"} title={t.title} className="flex-1" />
                          <Pill t={priorityTone[t.priority]}>{relativeDays(t.dueAt)}</Pill>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">No tasks.</p>
                  )}
                </div>
                <div className="rounded-xl border p-4">
                  <div className="mb-3 flex items-center">
                    <p className="text-sm font-medium">Appointments</p>
                    <div className="ml-auto">
                      <WithPickers fallback="Book" render={(p) => <NewAppointmentDialog pickers={p} clientId={c.id} trigger={<Button size="sm" variant="outline"><Plus /> Book</Button>} />} />
                    </div>
                  </div>
                  {appointments.length ? (
                    <ul className="grid gap-2">
                      {appointments.map((a) => (
                        <li key={a.id} className="flex items-center gap-3 text-sm">
                          <span className="min-w-0 flex-1 truncate">{a.title}</span>
                          <span className="text-xs text-muted-foreground">
                            {dmy(a.startsAt)} {time(a.startsAt)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">None booked.</p>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="activity">
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <div className="grid content-start gap-3">
                  <NoteComposer clientId={c.id} />
                  {c.notes ? <p className="rounded-xl border bg-muted/30 p-3 text-[13px] text-muted-foreground">{c.notes}</p> : null}
                  {open.length ? (
                    <div className="rounded-xl border p-4">
                      <p className="mb-3 text-sm font-medium">Checklist progress</p>
                      {open.map((m) => (
                        <div key={m.id} className="mb-2 last:mb-0">
                          <p className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>{m.title}</span>
                            <span>{stageLabel(m.stage)}</span>
                          </p>
                          <ProgressBar value={(stages.findIndex((s) => s.key === m.stage) + 1) / stages.length} />
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <Timeline items={activities} empty="No activity yet. Add the first note." />
              </div>
            </TabsContent>

            <TabsContent value="emails">
              <ClientEmails emails={emails} insights={insights} aiOn={aiMailOn} />
            </TabsContent>

            <TabsContent value="family">
              {dependants.length ? (
                <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {dependants.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-xl border bg-muted/20 p-3">
                      <UsersRound className="size-4 text-muted-foreground" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {label(d.relationship)}
                          {d.dateOfBirth ? ` · born ${dmy(d.dateOfBirth)}` : ""}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No family members recorded.</p>
              )}
            </TabsContent>
          </Tabs>
        </Section>
      </FadeIn>
      </div>
      <FadeIn delay={0.1} className="xl:sticky xl:top-16">
        <PathwayPanel clientId={c.id} row={pathway} study={studies[0] ? { course: studies[0].a.course, institution: studies[0].inst, status: studies[0].a.status, intake: studies[0].a.intake } : null} />
      </FadeIn>
      </div>
    </div>
  );
}

export default function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients"><ClientView params={params} /></Guard>
    </Suspense>
  );
}
