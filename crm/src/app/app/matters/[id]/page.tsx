import { connection } from "next/server";
import { ArrowLeft, Building2, ExternalLink, FileText, ListChecks, Mail, PackageCheck, UserRound } from "lucide-react";
import { NewDraft } from "@/components/ai/drafts";
import { DRAFT_KINDS, kindsFor } from "@/lib/drafting";
import { llmEnabled } from "@/lib/llm";
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
import { getAgencyProfile, getMatter, getPickers } from "@/lib/data";
import { and, desc, eq, ne } from "drizzle-orm";
import { db, schema as sch } from "@/db";
import { fileUrl } from "@/components/mail/file-icon";
import { MatterAiToggle } from "@/components/mail-ai/controls";
import { ReviewDeadlineCard } from "@/components/lodge/review-deadline";
import { aud, daysUntil, dmy, fullName, relativeDays } from "@/lib/format";
import { visaByCode } from "@/lib/visas";
import { FileSignature } from "lucide-react";
import { CaseReview } from "@/components/ai/case-review";
import { AskFile } from "@/components/ai/ask-file";
import { PredictedTimeline } from "@/components/app/predicted-timeline";
import { SignList } from "@/components/sign/sign-list";
import { latestCaseReview } from "@/lib/case-review";
import { fmtMonths, predictTimeline, processingMonths } from "@/lib/visa-timeline";
import { liveProcessing } from "@/lib/processing-times";
import { Checklist, ComplianceChecks, MatterDetailsForm, StageStepper } from "./matter-client";
import { ManageCase } from "@/components/edit/case-manage";
import { EditRecord } from "@/components/edit/edit-record";
import { RecordHistory } from "@/components/edit/record-history";
import { getEditOptions } from "@/lib/edit-data";
import { plainValues } from "@/lib/record-specs";

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
  const [ag] = await db.select().from(sch.serviceAgreements).where(and(eq(sch.serviceAgreements.agencyId, ctx.agencyId), eq(sch.serviceAgreements.matterId, m.id), ne(sch.serviceAgreements.status, "void"))).orderBy(desc(sch.serviceAgreements.createdAt)).limit(1);
  const [agDoc] = ag?.documentId ? await db.select({ key: sch.documents.storageKey, name: sch.documents.name }).from(sch.documents).where(eq(sch.documents.id, ag.documentId)) : [];
  const [checks, draftRows, [aiP]] = await Promise.all([
    db.select({ documentId: sch.documentChecks.documentId, status: sch.documentChecks.status, verdict: sch.documentChecks.verdict, result: sch.documentChecks.result, error: sch.documentChecks.error }).from(sch.documentChecks).where(and(eq(sch.documentChecks.agencyId, ctx.agencyId), eq(sch.documentChecks.matterId, m.id))),
    db.select({ id: sch.drafts.id, title: sch.drafts.title, kind: sch.drafts.kind, updatedAt: sch.drafts.updatedAt }).from(sch.drafts).where(and(eq(sch.drafts.agencyId, ctx.agencyId), eq(sch.drafts.matterId, m.id))).orderBy(desc(sch.drafts.updatedAt)),
    db.select({ on: sch.agencyProfile.aiDocsEnabledAt }).from(sch.agencyProfile).where(eq(sch.agencyProfile.agencyId, ctx.agencyId)),
  ]);
  const aiDocs = Boolean(aiP?.on) && llmEnabled();
  const [review, signRows] = await Promise.all([
    latestCaseReview(ctx.agencyId, client.id, m.id),
    db
      .select({ r: sch.signRequests, signedKey: sch.documents.storageKey, signedName: sch.documents.name })
      .from(sch.signRequests)
      .leftJoin(sch.documents, eq(sch.documents.id, sch.signRequests.documentId))
      .where(and(eq(sch.signRequests.agencyId, ctx.agencyId), eq(sch.signRequests.matterId, m.id), ne(sch.signRequests.status, "draft")))
      .orderBy(desc(sch.signRequests.updatedAt))
      .limit(20),
  ]);
  const live = await liveProcessing(m.visaCode, m.stream);
  const milestones = predictTimeline(m, live);
  const [p50, p90] = live ? [live.p50Months, live.p90Months] : processingMonths(m.visaCode);
  const checkOf = new Map(checks.map((c) => [c.documentId, c]));
  const docsWithChecks = data.documents.map((d) => ({ ...d, check: checkOf.get(d.id) ?? null }));
  const [editOptions, pickers] = await Promise.all([getEditOptions(), getPickers()]);
  const kinds = kindsFor(m.visaCode, m.stage, Boolean(m.rfiDueAt)).map((k) => ({ key: k, ...DRAFT_KINDS[k] }));
  const esign = ag ? { id: ag.id, status: ag.status, createdAt: ag.createdAt, viewedAt: ag.viewedAt, signedAt: ag.signedAt, signerName: ag.signerName, pdf: agDoc?.key ? fileUrl(agDoc.key, agDoc.name) : null } : null;
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
          <Link href={`/app/sign/new?client=${client.id}&matter=${m.id}`}>
            <FileSignature /> Send to sign
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link href={`/app/matters/${m.id}/lodge`}>
            <PackageCheck /> Lodgement pack
          </Link>
        </Button>
        <MatterAiToggle matterId={m.id} tracking={m.aiTracking} clientName={fullName(client)} agencyOn={aiOn} />
        <ManageCase matter={{ id: m.id, reference: m.reference, clientId: m.clientId, visaCode: m.visaCode, stream: m.stream, stage: m.stage, assignedTo: m.assignedTo, supervisorId: m.supervisorId, title: m.title }} values={plainValues(m)} options={editOptions} caps={ctx.caps} clients={pickers.clients} staff={editOptions.staff} />
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
          <CaseReview clientId={client.id} matterId={m.id} initial={review?.result ?? null} finishedAt={review?.finishedAt?.toISOString() ?? null} aiOn={aiDocs} />
          <Section title="Ask this file">
            <AskFile matterId={m.id} enabled={aiDocs} />
          </Section>
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
            <Checklist matterId={m.id} items={checklist} docs={docsWithChecks} agencyId={ctx.agencyId} clientId={client.id} aiDocs={aiDocs} editOptions={editOptions} caps={ctx.caps} />
          </Section>
          <Section title="Timeline">
            <div className="grid gap-5">
              <NoteComposer clientId={client.id} matterId={m.id} />
              <Timeline items={activities} />
            </div>
          </Section>
        </div>
        <div className="grid content-start gap-4">
          <Section title="Predicted timeline" action={<span className="text-[11px] text-muted-foreground">{live ? "Home Affairs: " : ""}{fmtMonths(p50)}–{fmtMonths(p90)}</span>}>
            <PredictedTimeline items={milestones} processing={live ? `${live.p50} to ${live.p90}${live.stream ? `, ${live.stream}` : ""}` : `${fmtMonths(p50)} to ${fmtMonths(p90)}`} source={live ? { asAt: live.asAt, url: live.sourceUrl } : null} />
          </Section>
          <Section
            title="Signatures"
            action={
              <Link href={`/app/sign/new?client=${client.id}&matter=${m.id}`} className="text-xs text-primary hover:underline">
                Send to sign
              </Link>
            }
          >
            <SignList rows={signRows.map((x) => ({ ...x.r, signedKey: x.signedKey, signedName: x.signedName }))} showClient={false} empty="Consent forms and PDFs sent to the client to sign appear here." />
          </Section>
          <Section title="Code of Conduct">
            <ComplianceChecks matterId={m.id} guide={m.consumerGuideAt} agreement={m.agreementSignedAt} esign={esign} hasEmail={Boolean(client.email)} />
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
          <Section title="Drafts" action={<NewDraft matterId={m.id} kinds={kinds} enabled={aiDocs} />}>
            {draftRows.length ? (
              <ul className="grid gap-2">
                {draftRows.map((d) => (
                  <li key={d.id}>
                    <Link href={`/app/matters/${m.id}/drafts/${d.id}`} className="flex items-start gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-muted/40">
                      <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{d.title}</span>
                        <span className="block text-xs text-muted-foreground" suppressHydrationWarning>{relativeDays(d.updatedAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">{aiDocs ? "Cover letters, submissions and responses, drafted from this file." : "Turn on AI drafting in Settings → AI assistant."}</p>
            )}
          </Section>
          <Section title="Tasks" action={<WithPickers render={(p) => <NewTaskDialog pickers={p} clientId={client.id} matterId={m.id} />} />}>
            {tasks.length ? (
              <ul className="grid gap-3">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-2">
                    <TaskCheck id={t.id} done={t.status === "done"} title={t.title} className="flex-1" />
                    <span className="shrink-0 text-xs text-muted-foreground">{relativeDays(t.dueAt)}</span>
                    <EditRecord entity="task" id={t.id} values={plainValues({ ...t, dueAt: t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : null })} options={editOptions} caps={ctx.caps} canDelete />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No tasks.</p>
            )}
          </Section>
          <Section title="Change history">
            <RecordHistory entity="matter" id={m.id} />
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
