import { and, asc, desc, eq, sql } from "drizzle-orm";
import { ArrowLeft, BadgeCheck, Briefcase, Building2, CalendarClock, ClipboardList, Mail, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { ExpiryPill, label, matterStageTone, Pill } from "@/components/app/badges";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { Stagger, StaggerItem } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatCard } from "@/components/app/stat-card";
import { EditRecord } from "@/components/edit/edit-record";
import { NewNominationDialog } from "@/components/employers/nominations";
import { RecordEventDialog, SponsorEvents } from "@/components/employers/obligations";
import { NominationsTable } from "@/components/employers/nominations-table";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { getEditOptions } from "@/lib/edit-data";
import { daysUntil, dmy, todayIso } from "@/lib/format";
import { sponsorTimeline } from "@/lib/key-dates";
import { nominationsFor, sponsoredMatterOptions } from "@/lib/nomination-data";
import { OPEN_STATUSES } from "@/lib/nominations";
import { plainValues } from "@/lib/record-specs";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Employer" };

async function EmployerView({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const ctx = await getCtx();
  const [e] = await db.select().from(s.employers).where(and(eq(s.employers.agencyId, ctx.agencyId), eq(s.employers.id, id)));
  if (!e) notFound();
  const [noms, options, matterOpts, clients, cases, timeline, events] = await Promise.all([
    nominationsFor(ctx.agencyId, id),
    getEditOptions(),
    sponsoredMatterOptions(ctx.agencyId),
    db.select({ id: s.clients.id, name: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}` }).from(s.clients).where(eq(s.clients.agencyId, ctx.agencyId)).orderBy(asc(s.clients.firstName)),
    db
      .select({ m: s.matters, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.matters)
      .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.employerId, id)))
      .orderBy(desc(s.matters.updatedAt)),
    sponsorTimeline(ctx.agencyId, id),
    db
      .select({ e: s.sponsorEvents, first: s.clients.firstName, last: s.clients.lastName })
      .from(s.sponsorEvents)
      .leftJoin(s.clients, eq(s.clients.id, s.sponsorEvents.clientId))
      .where(and(eq(s.sponsorEvents.agencyId, ctx.agencyId), eq(s.sponsorEvents.employerId, id)))
      .orderBy(desc(s.sponsorEvents.occurredOn)),
  ]);
  const today = todayIso();
  const workers = [...new Map(cases.map((c) => [c.m.clientId, { id: c.m.clientId, name: `${c.first} ${c.last}` }])).values()];
  const openEvents = events.filter((r) => !r.e.notifiedOn).length;
  const open = noms.filter((r) => OPEN_STATUSES.includes(r.n.status));
  const approved = noms.filter((r) => r.n.status === "approved");
  const expiring = approved.filter((r) => r.n.approvalExpires && daysUntil(r.n.approvalExpires) <= 60);
  const sbsDays = e.sbsExpiry ? daysUntil(e.sbsExpiry) : null;
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <RecordEventDialog employerId={e.id} workers={workers} today={today} />
        <NewNominationDialog employerId={e.id} clients={clients} matters={matterOpts} />
      </HeaderActions>
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-5 shadow-xs">
        <Button asChild size="icon-sm" variant="ghost" aria-label="Back to employers">
          <Link href="/app/employers">
            <ArrowLeft />
          </Link>
        </Button>
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary">
          <Building2 className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1 text-xl font-semibold tracking-tight">
            {e.name}
            <EditRecord entity="employer" id={e.id} values={plainValues(e)} options={options} caps={ctx.caps} />
          </h1>
          <p className="text-sm text-muted-foreground">{[e.industry, e.abn ? `ABN ${e.abn}` : null].filter(Boolean).join(" · ") || "No details yet"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {e.sbsApproved ? (
              <Pill t="green">
                <BadgeCheck className="size-3" /> Approved sponsor
              </Pill>
            ) : (
              <Pill t="amber">Not an approved sponsor yet</Pill>
            )}
            {e.sbsExpiry ? (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Sponsorship expires {dmy(e.sbsExpiry)} <ExpiryPill days={sbsDays} />
              </span>
            ) : null}
          </div>
        </div>
        <div className="grid gap-1 text-sm text-muted-foreground">
          {e.contactName ? <p className="font-medium text-foreground">{e.contactName}</p> : null}
          {e.contactEmail ? (
            <a href={`mailto:${e.contactEmail}`} className="flex items-center gap-1.5 hover:text-foreground">
              <Mail className="size-3.5" /> {e.contactEmail}
            </a>
          ) : null}
          {e.phone ? (
            <span className="flex items-center gap-1.5">
              <Phone className="size-3.5" /> {e.phone}
            </span>
          ) : null}
        </div>
      </div>
      {!e.sbsApproved && open.length ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">This employer isn&apos;t recorded as an approved sponsor. Nominations need approved sponsorship (or a labour agreement) first.</p> : null}
      {sbsDays != null && sbsDays <= 120 ? <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-amber-700 dark:text-amber-300">Sponsorship {sbsDays < 0 ? "has expired" : `expires in ${sbsDays} days`}. Plan the renewal before new nominations are lodged.</p> : null}
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={ClipboardList} label="Nominations in progress" value={open.length} hint={`${noms.length} in total`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={BadgeCheck} label="Approved" value={approved.length} tone="emerald" hint="Waiting on the visa" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CalendarClock} label="Approvals expiring" value={expiring.length} tone="amber" hint="Within 60 days" />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Briefcase} label="Sponsored cases" value={cases.length} tone="violet" hint={`${cases.filter((c) => !["decision", "closed"].includes(c.m.stage)).length} open`} />
        </StaggerItem>
      </Stagger>
      <Section title="Nominations">
        <NominationsTable rows={noms} options={options} caps={ctx.caps} />
      </Section>
      <Section title="Sponsor obligations" action={openEvents ? <Pill t="amber">{`${openEvents} to report to Home Affairs`}</Pill> : null}>
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="grid content-start gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Coming up</p>
            {timeline.length ? (
              <ul className="divide-y rounded-2xl border bg-card">
                {timeline.map((t) => {
                  const d = daysUntil(t.date);
                  const body = (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{t.title}</span>
                        <span className="block text-xs text-muted-foreground">
                          {dmy(t.date)} · {t.detail}
                        </span>
                      </span>
                      <ExpiryPill days={d} />
                    </>
                  );
                  return (
                    <li key={t.title + t.date}>
                      {t.href ? (
                        <Link href={t.href} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-2.5 text-sm">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No sponsorship, approval or visa dates yet.</p>
            )}
          </div>
          <div className="grid content-start gap-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">28-day notifications</p>
            <SponsorEvents
              today={today}
              canDelete={["owner", "admin"].includes(ctx.role)}
              rows={events.map(({ e: x, first, last }) => ({ id: x.id, kind: x.kind, worker: first ? `${first} ${last}` : null, clientId: x.clientId, occurredOn: x.occurredOn, notifyBy: x.notifyBy, notifiedOn: x.notifiedOn, reference: x.reference, notes: x.notes, daysLeft: daysUntil(x.notifyBy) }))}
            />
          </div>
        </div>
      </Section>
      <Section title="Sponsored cases">
        {cases.length ? (
          <ul className="divide-y rounded-2xl border bg-card">
            {cases.map(({ m, first, last }) => (
              <li key={m.id}>
                <Link href={`/app/matters/${m.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">
                      {first} {last}
                    </span>
                    <span className="text-muted-foreground"> · {m.title} · {m.reference}</span>
                  </span>
                  <Pill t={matterStageTone[m.stage]}>{label(m.stage)}</Pill>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No visa cases linked to this sponsor. Set the sponsor on a 482, 186 or 494 case, or link one from a nomination.</p>
        )}
      </Section>
    </div>
  );
}

export default function EmployerPage({ params }: PageProps<"/app/employers/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <EmployerView params={params} />
      </Guard>
    </Suspense>
  );
}
