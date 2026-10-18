import { connection } from "next/server";
import { BookOpen, Building2, CalendarClock, ExternalLink, FileText, FolderOpen, Gavel, History, ListChecks, Mail, MessageSquareText, PackageCheck, PenLine, Receipt, ShieldCheck, SquareCheckBig, UserRound, Wallet } from "lucide-react";
import { NewDraft } from "@/components/ai/drafts";
import { DRAFT_KINDS, kindsFor } from "@/lib/drafting";
import { llmEnabled } from "@/lib/llm";
import { HeaderActions } from "@/components/app/header-actions";
import { SendChecklist } from "@/components/mail/send-checklist";
import { UploadButton } from "@/components/mail/upload-button";
import { ComposeDialog, NewInvoiceDialog, RecordPaymentDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { getCtx } from "@/lib/session";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { invoiceTone, label, Pill, priorityTone } from "@/components/app/badges";
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
import { ChecklistTimelineTabs, MatterWorkspace, type WorkspaceTile } from "@/components/app/matter-workspace";
import { ClientEmails } from "@/components/mail-ai/insight";

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
  const [editOptions, pickers, invoices, emails, insights, dependants] = await Promise.all([
    getEditOptions(),
    getPickers(),
    db.select().from(sch.invoices).where(and(eq(sch.invoices.agencyId, ctx.agencyId), eq(sch.invoices.matterId, m.id))).orderBy(desc(sch.invoices.createdAt)),
    db
      .select({ id: sch.messages.id, folder: sch.messages.folder, fromName: sch.messages.fromName, fromAddress: sch.messages.fromAddress, subject: sch.messages.subject, bodyText: sch.messages.bodyText, sentAt: sch.messages.sentAt, attachments: sch.messages.attachments, auth: sch.messages.auth })
      .from(sch.messages)
      .where(and(eq(sch.messages.agencyId, ctx.agencyId), eq(sch.messages.matterId, m.id)))
      .orderBy(desc(sch.messages.sentAt))
      .limit(50),
    db.select().from(sch.mailInsights).where(and(eq(sch.mailInsights.agencyId, ctx.agencyId), eq(sch.mailInsights.matterId, m.id))).orderBy(desc(sch.mailInsights.createdAt)),
    db.select().from(sch.dependants).where(and(eq(sch.dependants.agencyId, ctx.agencyId), eq(sch.dependants.clientId, client.id))),
  ]);
  const kinds = kindsFor(m.visaCode, m.stage, Boolean(m.rfiDueAt)).map((k) => ({ key: k, ...DRAFT_KINDS[k] }));
  const esign = ag ? { id: ag.id, status: ag.status, createdAt: ag.createdAt, viewedAt: ag.viewedAt, signedAt: ag.signedAt, signerName: ag.signerName, pdf: agDoc?.key ? fileUrl(agDoc.key, agDoc.name) : null } : null;
  const required = checklist.filter((i) => i.required);
  const reqDone = required.filter((i) => ["approved", "received", "waived"].includes(i.status)).length;
  const invoiced = invoices.filter((i) => i.status !== "void").reduce((a, i) => a + Number(i.total), 0);
  const paidSum = invoices.filter((i) => i.status !== "void").reduce((a, i) => a + Number(i.paid), 0);
  const owing = invoiced - paidSum;
  const openTasks = tasks.filter((t) => t.status !== "done");
  const overdueTasks = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < new Date());
  const pendingSigns = signRows.filter((x) => x.r.status === "sent" || x.r.status === "viewed").length;
  const compliant = Boolean(m.consumerGuideAt && m.agreementSignedAt);
  const passportDays = client.passportExpiry ? daysUntil(client.passportExpiry) : null;
  const quoted = Number(m.feeProfessional ?? 0) + Number(m.feeGovernment ?? 0);
  const showReview = m.outcome === "refused" || m.outcome === "cancelled" || Boolean(m.reviewDueAt) || ["decision", "lodged", "rfi"].includes(m.stage);
  const fact = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{v ?? "—"}</dd>
    </div>
  );
  const tiles: WorkspaceTile[] = [
    {
      key: "documents",
      label: "Documents",
      icon: <FolderOpen />,
      stat: `${data.documents.length} file${data.documents.length === 1 ? "" : "s"}`,
      action: <UploadButton agencyId={ctx.agencyId} clientId={client.id} matterId={m.id} label="Upload" />,
      content: data.documents.length ? (
        <ul className="grid gap-1.5">
          {data.documents
            .slice()
            .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
            .map((d) => (
              <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  {d.storageKey ? (
                    <a href={fileUrl(d.storageKey, d.name)} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                      {d.name}
                    </a>
                  ) : (
                    <span className="block truncate">{d.name}</span>
                  )}
                  <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                    {[d.category, d.source === "portal" ? "from client" : null, relativeDays(d.createdAt)].filter(Boolean).join(" · ")}
                  </span>
                </span>
                {checkOf.get(d.id)?.verdict ? <Pill t={checkOf.get(d.id)!.verdict === "pass" ? "green" : "amber"}>AI {checkOf.get(d.id)!.verdict}</Pill> : null}
              </li>
            ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No files yet. Upload here or from a checklist item.</p>
      ),
    },
    {
      key: "client",
      label: "Client",
      icon: <UserRound />,
      stat: passportDays != null && passportDays < 180 ? (passportDays < 0 ? "Passport expired" : `Passport ${passportDays}d left`) : fullName(client),
      tone: passportDays != null && passportDays < 180 ? (passportDays < 0 ? "bad" : "warn") : "default",
      action: (
        <Button asChild size="xs" variant="outline">
          <Link href={`/app/clients/${client.id}`}>Open client file</Link>
        </Button>
      ),
      content: (
        <div className="grid gap-4 sm:grid-cols-2">
          <dl className="text-sm">
            {fact("Name", fullName(client))}
            {fact("Email", client.email ? <a className="hover:underline" href={`mailto:${client.email}`}>{client.email}</a> : null)}
            {fact("Phone", client.phone ? <a className="hover:underline" href={`tel:${client.phone}`}>{client.phone}</a> : null)}
            {fact("Date of birth", client.dateOfBirth ? dmy(client.dateOfBirth) : null)}
            {fact("Nationality", client.nationality)}
            {fact("Address", [client.address, client.city, client.state].filter(Boolean).join(", ") || null)}
          </dl>
          <dl className="text-sm">
            {fact("Passport", client.passportNumber ? `${client.passportNumber}${client.passportExpiry ? ` · exp ${dmy(client.passportExpiry)}` : ""}` : null)}
            {fact("Location", client.onshore ? "Onshore (in Australia)" : "Offshore")}
            {fact("Current visa", client.currentVisa ? `${client.currentVisa}${client.visaExpiry ? ` · exp ${dmy(client.visaExpiry)}` : ""}` : null)}
            {fact("English", client.englishTest ? `${client.englishTest}${client.englishScore ? ` ${client.englishScore}` : ""}` : null)}
            {fact("Occupation", client.occupation ? `${client.occupation}${client.anzsco ? ` (${client.anzsco})` : ""}` : null)}
            {fact("Family on the file", dependants.length ? dependants.map((d) => `${d.fullName} (${d.relationship})`).join(", ") : "None")}
          </dl>
        </div>
      ),
    },
    {
      key: "payments",
      label: "Payments",
      icon: <Wallet />,
      stat: invoices.length ? (owing > 0.005 ? `${aud(owing)} owing` : "Paid up") : quoted ? `${aud(quoted)} quoted` : "No invoices",
      tone: owing > 0.005 ? "warn" : invoices.length ? "good" : "default",
      action: <NewInvoiceDialog pickers={pickers} clientId={client.id} matterId={m.id} trigger={<Button size="xs" variant="outline"><Receipt /> New invoice</Button>} />,
      content: (
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Invoiced", aud(invoiced, 2)],
              ["Paid", aud(paidSum, 2)],
              ["Owing", aud(Math.max(owing, 0), 2)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-muted/40 px-2 py-2">
                <p className="text-[11px] text-muted-foreground">{k}</p>
                <p className="text-sm font-medium tabular-nums">{v}</p>
              </div>
            ))}
          </div>
          {invoices.length ? (
            <ul className="grid gap-1.5">
              {invoices.map((i) => {
                const left = Number(i.total) - Number(i.paid);
                return (
                  <li key={i.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span className="font-mono text-xs">{i.number}</span>
                    <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                      {aud(i.total, 2)} · paid {aud(i.paid, 2)}
                      {i.dueAt ? ` · due ${dmy(i.dueAt)}` : ""}
                    </span>
                    <Pill t={invoiceTone[left <= 0.005 ? "paid" : i.status]}>{label(left <= 0.005 ? "paid" : i.status)}</Pill>
                    {left > 0.005 && i.status !== "void" ? <RecordPaymentDialog invoiceId={i.id} outstanding={left} trigger={<Button size="xs" variant="outline">Record payment</Button>} /> : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No invoices for this case yet. Quoted: {aud(quoted)}.</p>
          )}
          <Link href={`/app/billing/trust/${client.id}`} className="text-xs text-primary hover:underline">
            Client trust statement →
          </Link>
        </div>
      ),
    },
    {
      key: "emails",
      label: "Emails",
      icon: <Mail />,
      stat: `${emails.length} email${emails.length === 1 ? "" : "s"}`,
      action: <ComposeDialog to={client.email ?? ""} clientId={client.id} matterId={m.id} subject={`${m.title} · ${m.reference}`} trigger={<Button size="xs" variant="outline"><Mail /> Email client</Button>} />,
      content: <ClientEmails emails={emails} insights={insights.filter((x): x is typeof x & { messageId: string } => Boolean(x.messageId))} aiOn={aiOn} />,
    },
    {
      key: "tasks",
      label: "Tasks",
      icon: <SquareCheckBig />,
      stat: overdueTasks.length ? `${overdueTasks.length} overdue` : `${openTasks.length} open`,
      tone: overdueTasks.length ? "bad" : "default",
      action: <WithPickers render={(p) => <NewTaskDialog pickers={p} clientId={client.id} matterId={m.id} />} />,
      content: tasks.length ? (
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
      ),
    },
    {
      key: "lodgement",
      label: "Lodgement",
      icon: <PackageCheck />,
      stat: m.lodgedAt ? `Lodged ${dmy(m.lodgedAt)}` : m.trn ? `TRN ${m.trn}` : "Not lodged",
      tone: m.lodgedAt ? "good" : "default",
      action: (
        <Button asChild size="xs" variant="outline">
          <Link href={`/app/matters/${m.id}/lodge`}>
            <PackageCheck /> Lodgement pack
          </Link>
        </Button>
      ),
      content: <MatterDetailsForm matterId={m.id} m={m} />,
    },
    {
      key: "processing",
      label: "Processing",
      icon: <CalendarClock />,
      stat: `${fmtMonths(p50)}–${fmtMonths(p90)}`,
      content: <PredictedTimeline items={milestones} processing={live ? `${live.p50} to ${live.p90}${live.stream ? `, ${live.stream}` : ""}` : `${fmtMonths(p50)} to ${fmtMonths(p90)}`} source={live ? { asAt: live.asAt, url: live.sourceUrl } : null} />,
    },
    {
      key: "signatures",
      label: "Signatures",
      icon: <FileSignature />,
      stat: pendingSigns ? `${pendingSigns} waiting` : `${signRows.length} sent`,
      tone: pendingSigns ? "warn" : "default",
      action: (
        <Button asChild size="xs" variant="outline">
          <Link href={`/app/sign/new?client=${client.id}&matter=${m.id}`}>
            <FileSignature /> Send to sign
          </Link>
        </Button>
      ),
      content: <SignList rows={signRows.map((x) => ({ ...x.r, signedKey: x.signedKey, signedName: x.signedName }))} showClient={false} empty="Consent forms and PDFs sent to the client to sign appear here." />,
    },
    {
      key: "compliance",
      label: "Compliance",
      icon: <ShieldCheck />,
      stat: compliant ? "Complete" : "Incomplete",
      tone: compliant ? "good" : "warn",
      content: <ComplianceChecks matterId={m.id} guide={m.consumerGuideAt} agreement={m.agreementSignedAt} esign={esign} hasEmail={Boolean(client.email)} />,
    },
    {
      key: "fees",
      label: "Fees",
      icon: <Receipt />,
      stat: `${aud(quoted)} quoted`,
      content: (
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
            <dd className="tabular-nums">{aud(quoted)}</dd>
          </div>
        </dl>
      ),
    },
    {
      key: "drafts",
      label: "Drafts",
      icon: <PenLine />,
      stat: `${draftRows.length} draft${draftRows.length === 1 ? "" : "s"}`,
      action: <NewDraft matterId={m.id} kinds={kinds} enabled={aiDocs} />,
      content: draftRows.length ? (
        <ul className="grid gap-2">
          {draftRows.map((d) => (
            <li key={d.id}>
              <Link href={`/app/matters/${m.id}/drafts/${d.id}`} className="flex items-start gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-muted/40">
                <FileText className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{d.title}</span>
                  <span className="block text-xs text-muted-foreground" suppressHydrationWarning>
                    {relativeDays(d.updatedAt)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{aiDocs ? "Cover letters, submissions and responses, drafted from this file." : "Turn on AI drafting in Settings → AI assistant."}</p>
      ),
    },
    {
      key: "ask",
      label: "Ask AI",
      icon: <MessageSquareText />,
      stat: aiDocs ? "Ask this file" : "Off",
      content: <AskFile matterId={m.id} enabled={aiDocs} />,
    },
    ...(showReview
      ? [
          {
            key: "review",
            label: "ART review",
            icon: <Gavel />,
            stat: m.reviewDueAt && !m.reviewLodgedAt ? (daysUntil(m.reviewDueAt) < 0 ? `${-daysUntil(m.reviewDueAt)}d overdue` : `Due in ${daysUntil(m.reviewDueAt)}d`) : m.reviewLodgedAt ? "Lodged" : "Check",
            tone: (m.reviewDueAt && !m.reviewLodgedAt ? (daysUntil(m.reviewDueAt) <= 7 ? "bad" : "warn") : "default") as WorkspaceTile["tone"],
            content: <ReviewDeadlineCard matterId={m.id} dueAt={m.reviewDueAt} basis={m.reviewBasis} lodgedAt={m.reviewLodgedAt} outcome={m.outcome} decisionAt={m.decisionAt} onshore={client.onshore} canEdit={ctx.caps.includes("immigration")} />,
          },
        ]
      : []),
    {
      key: "history",
      label: "History",
      icon: <History />,
      stat: "Changes",
      content: <RecordHistory entity="matter" id={m.id} />,
    },
    ...(visa
      ? [
          {
            key: "visa",
            label: `Subclass ${visa.code}`,
            icon: <BookOpen />,
            stat: "About the visa",
            content: (
              <div>
                <p className="text-sm text-muted-foreground">{visa.summary}</p>
                <Link href={`/app/visas/${visa.code}`} className="mt-3 inline-block text-sm text-primary hover:underline">
                  Requirements →
                </Link>
              </div>
            ),
          },
        ]
      : []),
  ];
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

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <MatterWorkspace tiles={tiles} initial={typeof sp.panel === "string" ? sp.panel : null}>
          <CaseReview clientId={client.id} matterId={m.id} initial={review?.result ?? null} finishedAt={review?.finishedAt?.toISOString() ?? null} aiOn={aiDocs} />
        </MatterWorkspace>
        <div className="lg:sticky lg:top-4">
          <ChecklistTimelineTabs
            checklistLabel={`Checklist · ${reqDone}/${required.length}`}
            timelineLabel={`Timeline · ${activities.length}`}
            checklist={
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
            }
            timeline={
              <Section title="Timeline">
                <div className="grid gap-5">
                  <NoteComposer clientId={client.id} matterId={m.id} />
                  <Timeline items={activities} />
                </div>
              </Section>
            }
          />
        </div>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Opened {dmy(m.createdAt)}</p>
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
