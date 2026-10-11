import { connection } from "next/server";
import { ArrowLeft, Briefcase, CalendarDays, FileText, Mail, MapPin, Phone, Plus, Receipt, UsersRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { clientStageTone, ExpiryPill, invoiceTone, label, matterStageTone, Pill, priorityTone } from "@/components/app/badges";
import { ClientStageSelect, NoteComposer, TaskCheck } from "@/components/app/inline-actions";
import { FadeIn } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { Timeline } from "@/components/app/timeline";
import { initials } from "@/lib/format";
import { WithPickers } from "@/components/app/with-pickers";
import { ComposeDialog, NewAppointmentDialog, NewInvoiceDialog, NewMatterDialog, NewTaskDialog } from "@/components/forms/dialogs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getClient } from "@/lib/data";
import { aud, daysUntil, dmy, fullName, relativeDays, time } from "@/lib/format";
import { stages, visaByCode } from "@/lib/visas";

function Detail({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="truncate text-right font-medium">{v ?? "—"}</dd>
    </div>
  );
}

const stageLabel = (k: string) => stages.find((s) => s.key === k)?.label ?? k;

async function ClientView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const data = await getClient(id);
  if (!data) notFound();
  const { client: c, matters, documents, activities, tasks, dependants, invoices, appointments } = data;
  const name = fullName(c);
  const owing = invoices.reduce((a, i) => a + Number(i.total) - Number(i.paid), 0);

  return (
    <>
      <FadeIn className="mb-6 overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="h-20 bg-gradient-to-r from-primary/25 via-primary/10 to-fuchsia-500/15 sm:h-24" />
        <div className="-mt-10 flex flex-col gap-4 px-4 pb-5 sm:flex-row sm:items-end sm:px-6">
          <Avatar className="size-20 border-4 border-card shadow-md">
            <AvatarFallback className="bg-primary text-xl font-semibold text-primary-foreground">{initials(name)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
              <Pill t={clientStageTone[c.stage]}>{label(c.stage)}</Pill>
              <Pill t={c.onshore ? "blue" : "gray"}>{c.onshore ? "Onshore" : "Offshore"}</Pill>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {c.email ? (
                <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-foreground">
                  <Mail className="size-3.5" /> {c.email}
                </a>
              ) : null}
              {c.phone ? (
                <a href={`tel:${c.phone}`} className="flex items-center gap-1.5 hover:text-foreground">
                  <Phone className="size-3.5" /> {c.phone}
                </a>
              ) : null}
              {c.city || c.nationality ? (
                <span className="flex items-center gap-1.5">
                  <MapPin className="size-3.5" /> {[c.city, c.nationality].filter(Boolean).join(" · ")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ClientStageSelect clientId={c.id} stage={c.stage} />
            <WithPickers
              render={(p) => (
                <>
                  <ComposeDialog
                    to={c.email ?? ""}
                    clientId={c.id}
                    trigger={
                      <Button size="sm" variant="outline">
                        <Mail /> Email
                      </Button>
                    }
                  />
                  <NewMatterDialog pickers={p} clientId={c.id} />
                </>
              )}
            />
          </div>
        </div>
      </FadeIn>

      <Tabs defaultValue="overview" className="gap-4">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="matters">Matters · {matters.length}</TabsTrigger>
          <TabsTrigger value="documents">Documents · {documents.length}</TabsTrigger>
          <TabsTrigger value="tasks">Tasks · {tasks.filter((t) => t.status !== "done").length}</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="family">Family · {dependants.length}</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="grid content-start gap-6">
              {matters.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {matters.slice(0, 4).map((m) => (
                    <Link key={m.id} href={`/app/matters/${m.id}`} className="rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
                        <Pill t={matterStageTone[m.stage]}>{stageLabel(m.stage)}</Pill>
                      </div>
                      <p className="mt-2 truncate font-medium">{m.title}</p>
                      <p className="text-xs text-muted-foreground">{m.lodgedAt ? `Lodged ${dmy(m.lodgedAt)}` : m.dueAt ? `Target ${dmy(m.dueAt)}` : "Not lodged"}</p>
                    </Link>
                  ))}
                </div>
              ) : null}
              <Section title="Timeline">
                <div className="grid gap-5">
                  <NoteComposer clientId={c.id} />
                  <Timeline items={activities} empty="No activity yet. Add the first note above." />
                </div>
              </Section>
            </div>
            <div className="grid content-start gap-6">
              <Section title="Immigration">
                <dl>
                  <Detail k="Current visa" v={c.currentVisa ? `${c.currentVisa} · ${visaByCode(c.currentVisa)?.name ?? ""}` : null} />
                  <Detail k="Visa expiry" v={c.visaExpiry ? <span className="flex items-center gap-2">{dmy(c.visaExpiry)} <ExpiryPill days={daysUntil(c.visaExpiry)} /></span> : null} />
                  <Detail k="Conditions" v={c.visaConditions?.join(", ")} />
                  <Detail k="Passport" v={c.passportNumber} />
                  <Detail k="Passport expiry" v={c.passportExpiry ? dmy(c.passportExpiry) : null} />
                  <Detail k="Occupation" v={c.occupation ? `${c.occupation}${c.anzsco ? ` (${c.anzsco})` : ""}` : null} />
                  <Detail k="English" v={c.englishTest ? `${c.englishTest} ${c.englishScore ?? ""}` : null} />
                </dl>
              </Section>
              <Section title="Personal">
                <dl>
                  <Detail k="Date of birth" v={c.dateOfBirth ? dmy(c.dateOfBirth) : null} />
                  <Detail k="Nationality" v={c.nationality} />
                  <Detail k="Source" v={c.source ? label(c.source) : null} />
                  <Detail k="Client since" v={dmy(c.createdAt)} />
                </dl>
                {c.notes ? <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">{c.notes}</p> : null}
              </Section>
              <Section title="Appointments" action={<WithPickers fallback="Book" render={(p) => <NewAppointmentDialog pickers={p} clientId={c.id} trigger={<Button size="xs" variant="ghost"><Plus /> Book</Button>} />} />}>
                {appointments.length ? (
                  <ul className="grid gap-2">
                    {appointments.slice(0, 5).map((a) => (
                      <li key={a.id} className="flex items-center gap-3 text-sm">
                        <CalendarDays className="size-4 text-primary" />
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
              </Section>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="matters">
          <Section title="Matters" action={<WithPickers render={(p) => <NewMatterDialog pickers={p} clientId={c.id} />} />} bodyClassName="p-0 sm:p-0">
            {matters.length ? (
              <ul>
                {matters.map((m) => (
                  <li key={m.id} className="border-b last:border-0">
                    <Link href={`/app/matters/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/50 sm:px-5">
                      <Briefcase className="size-4 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{m.title}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          {m.reference}
                          {m.trn ? ` · TRN ${m.trn}` : ""}
                        </p>
                      </div>
                      <Pill t={priorityTone[m.priority]}>{label(m.priority)}</Pill>
                      <Pill t={matterStageTone[m.stage]}>{stageLabel(m.stage)}</Pill>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No matters yet.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="documents">
          <Section title="Documents" bodyClassName="p-0 sm:p-0">
            {documents.length ? (
              <ul>
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
                    <FileText className="size-4 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{d.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {d.category ?? "Document"} · added {dmy(d.createdAt)}
                      </p>
                    </div>
                    {d.certified ? <Pill t="green">Certified</Pill> : null}
                    {d.translated ? <Pill t="blue">Translated</Pill> : null}
                    {d.expiresAt ? <ExpiryPill days={daysUntil(d.expiresAt)} /> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No documents on file.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="tasks">
          <Section title="Tasks" action={<WithPickers render={(p) => <NewTaskDialog pickers={p} clientId={c.id} />} />}>
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
          </Section>
        </TabsContent>

        <TabsContent value="billing">
          <Section
            title={
              <span className="flex items-center gap-2">
                <Receipt className="size-4" /> Invoices · {aud(owing)} owing
              </span>
            }
            action={<WithPickers render={(p) => <NewInvoiceDialog pickers={p} clientId={c.id} />} />}
            bodyClassName="p-0 sm:p-0"
          >
            {invoices.length ? (
              <ul>
                {invoices.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
                    <span className="font-mono text-sm">{i.number}</span>
                    <span className="text-xs text-muted-foreground">{dmy(i.issuedAt)}</span>
                    <span className="ml-auto text-sm tabular-nums">{aud(i.total, 2)}</span>
                    <Pill t={invoiceTone[i.status]}>{label(i.status)}</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="p-6 text-center text-sm text-muted-foreground">No invoices.</p>
            )}
          </Section>
        </TabsContent>

        <TabsContent value="family">
          <Section title="Family members">
            {dependants.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {dependants.map((d) => (
                  <li key={d.id} className="flex items-center gap-3 rounded-xl border p-3">
                    <UsersRound className="size-4 text-primary" />
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
              <p className="text-sm text-muted-foreground">No family members recorded.</p>
            )}
          </Section>
        </TabsContent>
      </Tabs>
    </>
  );
}

export default function ClientPage({ params }: PageProps<"/app/clients/[id]">) {
  return (
    <>
      <Link href="/app/clients" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Clients
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <ClientView params={params} />
      </Suspense>
    </>
  );
}
