import { connection } from "next/server";
import { ArrowLeft, Building2, ExternalLink, ListChecks, Mail, PackageCheck, UserRound } from "lucide-react";
import { HeaderActions } from "@/components/app/header-actions";
import { SendChecklist } from "@/components/mail/send-checklist";
import { UploadButton } from "@/components/mail/upload-button";
import { ComposeDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { getCtx } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { label, Pill, priorityTone } from "@/components/app/badges";
import { NoteComposer, TaskCheck } from "@/components/app/inline-actions";
import { FadeIn } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { Timeline } from "@/components/app/timeline";
import { WithPickers } from "@/components/app/with-pickers";
import { NewTaskDialog } from "@/components/forms/dialogs";
import { getAgencyProfile, getMatter } from "@/lib/data";
import { MatterAiToggle } from "@/components/mail-ai/controls";
import { ReviewDeadlineCard } from "@/components/lodge/review-deadline";
import { aud, daysUntil, dmy, fullName, relativeDays } from "@/lib/format";
import { visaByCode } from "@/lib/visas";
import { Checklist, ComplianceChecks, MatterDetailsForm, StageStepper } from "./matter-client";

async function MatterView({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  await connection();
  const data = await getMatter(id);
  if (!data) notFound();
  const { matter: m, client, employer, checklist, activities, tasks } = data;
  const ctx = await getCtx();
  const visa = visaByCode(m.visaCode);
  const aiOn = Boolean((await getAgencyProfile())?.aiMailEnabledAt);
  return (
    <>
      <HeaderActions>
        <SendChecklist
          defaultOpen={sp.send === "1"}
          matterId={m.id}
          clientName={fullName(client)}
          clientEmail={client.email}
          items={checklist}
          trigger={
            <Button size="sm" className="rounded-full">
              <ListChecks /> Send checklist
            </Button>
          }
        />
        <ComposeDialog to={client.email ?? ""} clientId={client.id} matterId={m.id} subject={`${m.title} · ${m.reference}`} trigger={<Button size="sm" variant="outline"><Mail /> Email</Button>} />
        <UploadButton agencyId={ctx.agencyId} clientId={client.id} matterId={m.id} label="Upload" />
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/matters/${m.id}/lodge`}>
            <PackageCheck /> Lodgement pack
          </Link>
        </Button>
        <MatterAiToggle matterId={m.id} tracking={m.aiTracking} clientName={fullName(client)} agencyOn={aiOn} />
      </HeaderActions>
      <FadeIn className="mb-4 grid gap-4 rounded-xl border bg-card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">{m.reference}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{m.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <Link href={`/app/clients/${client.id}`} className="flex items-center gap-1.5 hover:text-foreground">
                <UserRound className="size-3.5" /> {fullName(client)}
              </Link>
              {employer ? (
                <span className="flex items-center gap-1.5">
                  <Building2 className="size-3.5" /> {employer.name}
                </span>
              ) : null}
              {m.stream ? <span>Stream: {m.stream}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Pill t={priorityTone[m.priority]}>{label(m.priority)} priority</Pill>
            {m.outcome ? <Pill t={m.outcome === "granted" ? "green" : "red"}>{label(m.outcome)}</Pill> : null}
            {m.rfiDueAt && !m.decisionAt ? (
              <Pill t={daysUntil(m.rfiDueAt) <= 7 ? "red" : "amber"}>
                RFI due {daysUntil(m.rfiDueAt) < 0 ? `${-daysUntil(m.rfiDueAt)}d overdue` : daysUntil(m.rfiDueAt) === 0 ? "today" : `in ${daysUntil(m.rfiDueAt)}d`}
              </Pill>
            ) : null}
            {m.reviewDueAt && !m.reviewLodgedAt ? (
              <Pill t={daysUntil(m.reviewDueAt) <= 7 ? "red" : "amber"}>
                ART review due {daysUntil(m.reviewDueAt) < 0 ? `${-daysUntil(m.reviewDueAt)}d ago` : daysUntil(m.reviewDueAt) === 0 ? "today" : `in ${daysUntil(m.reviewDueAt)}d`}
              </Pill>
            ) : null}
            {!m.consumerGuideAt || !m.agreementSignedAt ? <Pill t="amber">Compliance incomplete</Pill> : null}
          </div>
        </div>
        <StageStepper matterId={m.id} stage={m.stage} askAi={aiOn && m.aiTracking == null} clientName={fullName(client)} />
      </FadeIn>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-4">
          <Section
            title="Document checklist"
            action={
              visa ? (
                <a href={visa.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-primary hover:underline">
                  Home Affairs <ExternalLink className="size-3" />
                </a>
              ) : null
            }
          >
            <Checklist matterId={m.id} items={checklist} docs={data.documents} agencyId={ctx.agencyId} clientId={client.id} />
          </Section>
          <Section title="Timeline">
            <div className="grid gap-5">
              <NoteComposer clientId={client.id} matterId={m.id} />
              <Timeline items={activities} />
            </div>
          </Section>
        </div>
        <div className="grid content-start gap-4">
          <Section title="Code of Conduct">
            <ComplianceChecks matterId={m.id} guide={m.consumerGuideAt} agreement={m.agreementSignedAt} />
          </Section>
          <Section title="Lodgement">
            <MatterDetailsForm matterId={m.id} m={m} />
          </Section>
          {m.outcome === "refused" || m.outcome === "cancelled" || m.reviewDueAt || ["decision", "lodged", "rfi"].includes(m.stage) ? (
            <Section title="Tribunal review (ART)">
              <ReviewDeadlineCard matterId={m.id} dueAt={m.reviewDueAt} basis={m.reviewBasis} lodgedAt={m.reviewLodgedAt} outcome={m.outcome} decisionAt={m.decisionAt} onshore={client.onshore} canEdit={ctx.caps.includes("immigration")} />
            </Section>
          ) : null}
          <Section title="Fees">
            <dl className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Professional</dt>
                <dd className="tabular-nums">{aud(m.feeProfessional)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Government (VAC)</dt>
                <dd className="tabular-nums">{aud(m.feeGovernment)}</dd>
              </div>
              <div className="flex justify-between border-t pt-2 font-medium">
                <dt>Total quoted</dt>
                <dd className="tabular-nums">{aud(Number(m.feeProfessional ?? 0) + Number(m.feeGovernment ?? 0))}</dd>
              </div>
            </dl>
          </Section>
          <Section title="Tasks" action={<WithPickers render={(p) => <NewTaskDialog pickers={p} clientId={client.id} matterId={m.id} />} />}>
            {tasks.length ? (
              <ul className="grid gap-3">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <TaskCheck id={t.id} done={t.status === "done"} title={t.title} className="flex-1" />
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeDays(t.dueAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tasks.</p>
            )}
          </Section>
          {visa ? (
            <Section title={`About subclass ${visa.code}`}>
              <p className="text-sm text-muted-foreground">{visa.summary}</p>
              <Link href={`/app/visas/${visa.code}`} className="mt-3 inline-block text-sm text-primary hover:underline">
                Requirements →
              </Link>
            </Section>
          ) : null}
          <p className="text-xs text-muted-foreground">Opened {dmy(m.createdAt)}</p>
        </div>
      </div>
    </>
  );
}

export default function MatterPage({ params, searchParams }: PageProps<"/app/matters/[id]">) {
  return (
    <>
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="clients"><MatterView params={params} searchParams={searchParams} /></Guard>
      </Suspense>
    </>
  );
}
