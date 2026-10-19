import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Circle, ExternalLink, FileText, Printer } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pill } from "@/components/app/badges";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { AdDialog, DeleteAd, Exemption } from "@/components/employers/lmt";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { aud, dmy, todayIso } from "@/lib/format";
import { adProblems, assessLmt, daysOpen, LMT_PROGRAMS, type LmtAd, MIN_AD_DAYS, platformLabel } from "@/lib/lmt";
import { programLabel } from "@/lib/nominations";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Labour market testing" };

async function LmtView({ params }: { params: Promise<{ id: string; nominationId: string }> }) {
  await connection();
  const { id, nominationId } = await params;
  const ctx = await getCtx();
  const [row] = await db
    .select({ n: s.nominations, employer: s.employers.name, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.nominations)
    .innerJoin(s.employers, eq(s.employers.id, s.nominations.employerId))
    .leftJoin(s.clients, eq(s.clients.id, s.nominations.clientId))
    .where(and(eq(s.nominations.agencyId, ctx.agencyId), eq(s.nominations.id, nominationId), eq(s.nominations.employerId, id)));
  if (!row) notFound();
  const { n } = row;
  const ads = (await db.select().from(s.lmtAds).where(eq(s.lmtAds.nominationId, n.id)).orderBy(asc(s.lmtAds.publishedOn))) as LmtAd[];
  const today = todayIso();
  const salary = n.salary ? Number(n.salary) : null;
  const r = assessLmt(ads, { salary, lodgeOn: n.lodgedAt, today });
  const usual = LMT_PROGRAMS.includes(n.program);
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <Button asChild size="sm" variant="outline">
          <a href={`/api/lmt/${n.id}`} target="_blank" rel="noreferrer">
            <Printer /> Evidence summary
          </a>
        </Button>
        {n.lmtExemption ? null : <AdDialog nominationId={n.id} agencyId={ctx.agencyId} positionTitle={n.positionTitle} today={today} />}
      </HeaderActions>
      <div className="flex flex-wrap items-start gap-3 rounded-2xl border bg-card p-5 shadow-xs">
        <Button asChild size="icon-sm" variant="ghost" aria-label="Back to employer">
          <Link href={`/app/employers/${id}`}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">Labour market testing</h1>
          <p className="text-sm text-muted-foreground">
            {[n.positionTitle, row.employer, programLabel(n.program), salary ? `${aud(salary)} p.a.` : null, row.first ? `for ${row.first} ${row.last}` : null].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {n.lmtExemption ? <Pill t="gray">Exempt</Pill> : r.complete ? <Pill t="green">Testing complete</Pill> : ads.length ? <Pill t="amber">Advertising</Pill> : <Pill t="red">Not started</Pill>}
            {!n.lmtExemption && r.lodgeBy ? <span className="text-xs text-muted-foreground">Lodge the nomination by {dmy(r.lodgeBy)}</span> : null}
            {!n.lmtExemption && !r.complete && r.finish ? <span className="text-xs text-muted-foreground">{r.finish <= today ? `Four weeks reached ${dmy(r.finish)}` : `Four weeks finish ${dmy(r.finish)}`}</span> : null}
            {n.lodgedAt ? <span className="text-xs text-muted-foreground">Nomination lodged {dmy(n.lodgedAt)}: checked as at that date</span> : null}
          </div>
        </div>
      </div>
      {!usual && !n.lmtExemption ? <p className="rounded-xl border px-4 py-2.5 text-sm text-muted-foreground">{programLabel(n.program)} nominations don&apos;t usually need labour market testing. Mark it exempt below if that applies.</p> : null}
      {n.lmtExemption ? null : (
        <Section title="Checklist">
          <ul className="divide-y rounded-2xl border bg-card">
            {r.checks.map((c) => (
              <li key={c.label} className="flex items-start gap-3 px-4 py-3 text-sm">
                {c.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                <span>
                  <span className="block font-medium">{c.label}</span>
                  <span className="block text-xs text-muted-foreground">{c.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted-foreground">Based on the requirements in force from 7 December 2024: two ads in Australia (one on Workforce Australia), each open at least 4 weeks, within 6 months before lodging. Check the current instrument before you lodge.</p>
        </Section>
      )}
      {n.lmtExemption ? null : (
        <Section title="Ads">
          {ads.length ? (
            <ul className="divide-y rounded-2xl border bg-card">
              {ads.map((a) => {
                const days = daysOpen(a, n.lodgedAt ?? today);
                const problems = adProblems(a, salary);
                return (
                  <li key={a.id} className="grid gap-2 px-4 py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{platformLabel(a.platform)}</span>
                        <span className="text-muted-foreground"> · {a.adTitle}</span>
                      </span>
                      <Pill t={days >= MIN_AD_DAYS ? "green" : "amber"}>{`${Math.max(0, days)} of ${MIN_AD_DAYS} days`}</Pill>
                      {problems.length ? <Pill t="red">{`${problems.length} to fix`}</Pill> : null}
                      {a.url ? (
                        <Button asChild size="icon-sm" variant="ghost" aria-label="Open ad">
                          <a href={a.url} target="_blank" rel="noreferrer">
                            <ExternalLink />
                          </a>
                        </Button>
                      ) : null}
                      <AdDialog nominationId={n.id} agencyId={ctx.agencyId} positionTitle={n.positionTitle} today={today} ad={a} />
                      <DeleteAd id={a.id} title={a.adTitle} />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Published {dmy(a.publishedOn)} · {a.endsOn ? `closed ${dmy(a.endsOn)}` : "still open"}
                      {a.applicants != null ? ` · ${a.applicants} applicant${a.applicants === 1 ? "" : "s"}` : ""}
                      {a.notes ? ` · ${a.notes}` : ""}
                    </p>
                    {problems.length ? <p className="text-xs text-rose-600 dark:text-rose-300">This ad {problems.join(", ")}.</p> : null}
                    {a.evidence.length ? (
                      <div className="flex flex-wrap gap-1.5">
                        {a.evidence.map((f) => (
                          <a key={f.key} href={`/api/files/${f.key.split("/").map(encodeURIComponent).join("/")}`} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs hover:bg-muted">
                            <FileText className="size-3" /> {f.name}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No ads recorded yet. Start with the Workforce Australia ad, then a second national ad.</p>
          )}
        </Section>
      )}
      <Section title="Exemption">
        <Exemption nominationId={n.id} reason={n.lmtExemption} />
      </Section>
    </div>
  );
}

export default function LmtPage({ params }: PageProps<"/app/employers/[id]/lmt/[nominationId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <LmtView params={params} />
      </Guard>
    </Suspense>
  );
}
