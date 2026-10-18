import { and, desc, eq, gte, inArray, notInArray, sql } from "drizzle-orm";
import { AlertOctagon, FileSignature, ShieldCheck, Sparkles } from "lucide-react";
import Link from "next/link";
import { Section } from "@/components/app/section";
import { db, schema as s } from "@/db";
import { getCtx } from "@/lib/session";

const READY = { not_ready: ["Not ready", "text-rose-500"], needs_work: ["Needs work", "text-amber-600"], nearly_ready: ["Nearly ready", "text-sky-600"], ready: ["Ready", "text-emerald-600"] } as const;

async function load(agencyId: string) {
  const since = new Date(Date.now() - 90 * 864e5);
  const [reviews, signs] = await Promise.all([
    db
      .selectDistinctOn([s.caseReviews.matterId], { matterId: s.caseReviews.matterId, result: s.caseReviews.result, at: s.caseReviews.createdAt, by: s.caseReviews.requestedByName, ref: s.matters.reference, title: s.matters.title, client: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}` })
      .from(s.caseReviews)
      .innerJoin(s.matters, eq(s.matters.id, s.caseReviews.matterId))
      .innerJoin(s.clients, eq(s.clients.id, s.caseReviews.clientId))
      .where(and(eq(s.caseReviews.agencyId, agencyId), eq(s.caseReviews.status, "done"), notInArray(s.matters.stage, ["closed"])))
      .orderBy(s.caseReviews.matterId, desc(s.caseReviews.createdAt)),
    db
      .select({ status: s.signRequests.status, createdAt: s.signRequests.createdAt, signedAt: s.signRequests.signedAt, dueAt: s.signRequests.dueAt })
      .from(s.signRequests)
      .where(and(eq(s.signRequests.agencyId, agencyId), inArray(s.signRequests.status, ["sent", "viewed", "signed"]), gte(s.signRequests.createdAt, since))),
  ]);
  return { reviews, signs, dayAgo: Date.now() - 26 * 3600_000, today: new Date().toISOString().slice(0, 10) };
}

/** Dashboard: new risks found overnight, the riskiest open cases, and signatures waiting. */
export async function CaseHealth() {
  const ctx = await getCtx();
  if (!ctx.caps.includes("clients")) return null;
  const { reviews, signs, dayAgo, today } = await load(ctx.agencyId);
  const fresh = reviews.filter((r) => r.at.getTime() > dayAgo && r.result?.newCritical?.length);
  const crit = (r: (typeof reviews)[number]) => r.result?.flags.filter((f) => f.level === "critical").length ?? 0;
  const risky = reviews.filter((r) => r.result && (crit(r) > 0 || r.result.readiness === "not_ready")).sort((a, b) => crit(b) - crit(a) || (a.result!.profileScore + a.result!.documentScore) - (b.result!.profileScore + b.result!.documentScore)).slice(0, 6);
  const open = signs.filter((x) => x.status !== "signed");
  const signed = signs.filter((x) => x.status === "signed" && x.signedAt);
  const avgH = signed.length ? signed.reduce((t, x) => t + (x.signedAt!.getTime() - x.createdAt.getTime()), 0) / signed.length / 3600_000 : null;
  if (!reviews.length && !signs.length) return null;
  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <Section title={<span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-[var(--chart-2)]" /> Case health</span>} action={<span className="text-[11px] text-muted-foreground">{reviews.length} active cases reviewed</span>}>
        {fresh.length ? (
          <div className="mb-3 grid gap-1.5 rounded-lg border border-rose-500/25 bg-rose-500/[0.04] p-2.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <AlertOctagon className="size-3.5" /> New since the overnight review
            </p>
            {fresh.slice(0, 5).map((r) => (
              <Link key={r.matterId} href={`/app/matters/${r.matterId}`} className="flex items-baseline gap-2 text-[13px] hover:underline">
                <span className="font-medium">{r.client}</span>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{r.result!.newCritical!.join(" · ")}</span>
              </Link>
            ))}
          </div>
        ) : null}
        {risky.length ? (
          <ul className="grid divide-y">
            {risky.map((r) => {
              const [label, cls] = READY[r.result!.readiness];
              return (
                <li key={r.matterId}>
                  <Link href={`/app/matters/${r.matterId}`} className="flex items-center gap-3 py-2 text-[13px] hover:bg-muted/30">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {r.client} <span className="font-normal text-muted-foreground">· {r.ref}</span>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">{r.result!.flags.filter((f) => f.level === "critical").map((f) => f.title).slice(0, 2).join(" · ") || r.result!.summary}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums">
                      <span className={`block font-medium ${cls}`}>{label}</span>
                      <span className="text-muted-foreground">
                        {r.result!.profileScore} / {r.result!.documentScore}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-[var(--success)]" /> No critical issues on reviewed cases.
          </p>
        )}
      </Section>
      <Section title={<span className="flex items-center gap-1.5"><FileSignature className="size-3.5" /> E-sign</span>} action={<Link href="/app/sign" className="text-xs text-primary hover:underline">Open</Link>}>
        <dl className="grid grid-cols-2 gap-3">
          {[
            ["Waiting", open.length],
            ["Overdue", open.filter((x) => x.dueAt && x.dueAt < today).length],
            ["Signed (90 days)", signed.length],
            ["Average time to sign", avgH == null ? "—" : avgH < 24 ? `${Math.max(1, Math.round(avgH))} h` : `${Math.round(avgH / 24)} d`],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-muted/40 p-2.5">
              <dt className="text-[11px] text-muted-foreground">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  );
}
