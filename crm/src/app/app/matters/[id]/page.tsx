import { connection } from "next/server";
import { ArrowLeft, Building2, ExternalLink, UserRound } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { label, Pill, priorityTone } from "@/components/app/badges";
import { NoteComposer, TaskCheck } from "@/components/app/inline-actions";
import { FadeIn } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { Timeline } from "@/components/app/timeline";
import { WithPickers } from "@/components/app/with-pickers";
import { NewTaskDialog } from "@/components/forms/dialogs";
import { getMatter } from "@/lib/data";
import { aud, dmy, fullName, relativeDays } from "@/lib/format";
import { visaByCode } from "@/lib/visas";
import { Checklist, MatterDetailsForm, StageStepper } from "./matter-client";

async function MatterView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const data = await getMatter(id);
  if (!data) notFound();
  const { matter: m, client, employer, checklist, activities, tasks } = data;
  const visa = visaByCode(m.visaCode);
  return (
    <>
      <FadeIn className="mb-6 grid gap-4 rounded-2xl border bg-card p-4 shadow-xs sm:p-6">
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
          </div>
        </div>
        <StageStepper matterId={m.id} stage={m.stage} />
      </FadeIn>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="grid content-start gap-6">
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
            <Checklist matterId={m.id} items={checklist} />
          </Section>
          <Section title="Timeline">
            <div className="grid gap-5">
              <NoteComposer clientId={client.id} matterId={m.id} />
              <Timeline items={activities} />
            </div>
          </Section>
        </div>
        <div className="grid content-start gap-6">
          <Section title="Lodgement">
            <MatterDetailsForm matterId={m.id} m={m} />
          </Section>
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

export default function MatterPage({ params }: PageProps<"/app/matters/[id]">) {
  return (
    <>
      <Link href="/app/matters" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Matters
      </Link>
      <Suspense fallback={<PageSkeleton />}>
        <MatterView params={params} />
      </Suspense>
    </>
  );
}
