import { desc, eq } from "drizzle-orm";
import { BellRing, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Pill } from "@/components/app/badges";
import { Section } from "@/components/app/section";
import { db, schema as s } from "@/db";
import { dmy } from "@/lib/format";
import { describeWatch } from "@/lib/occupation-watch";
import { WatchButton, WatchMenu } from "./watch-controls";

const fmt = (n: number, approx: boolean) => `${approx ? "about " : ""}${n.toLocaleString("en-AU")}`;

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${28 - (v / max) * 26}`).join(" ");
  return (
    <svg viewBox="0 0 100 30" className="h-6 w-20 text-primary" preserveAspectRatio="none" aria-hidden>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Client page: occupations watched for this client, with cut-offs vs points and their EOI position. */
export async function OccupationWatchPanel({ clientId, anzsco, points }: { clientId: string; anzsco: string | null; points: number | null }) {
  const rows = await db.select().from(s.occupationWatches).where(eq(s.occupationWatches.clientId, clientId)).orderBy(desc(s.occupationWatches.createdAt));
  const views = await Promise.all(rows.map(describeWatch));
  return (
    <Section title="Occupation watch" action={<WatchButton clientId={clientId} anzsco={anzsco} points={points} />}>
      {views.length ? (
        <div className="grid gap-3">
          {views.map((w) => (
            <div key={w.id} className="grid gap-2.5 rounded-xl border p-3">
              <div className="flex items-start gap-2">
                <BellRing className={`mt-0.5 size-4 shrink-0 ${w.active ? "text-primary" : "text-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <Link href={`/app/occupations/${w.anzsco}`} className="block truncate text-sm font-medium hover:underline">
                    {w.occupation}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    ANZSCO {w.anzsco} · {w.points} points{w.active ? "" : " · paused"}
                  </p>
                </div>
                <WatchMenu id={w.id} anzsco={w.anzsco} points={w.points} subclasses={w.subclasses} active={w.active} />
              </div>
              {w.subs.map((x) => {
                const h = x.history.map((p) => p.ahead);
                const trend = h.length > 1 ? h[h.length - 1] - h[h.length - 2] : 0;
                return (
                  <div key={x.subclass} className="grid gap-1 rounded-lg bg-muted/40 px-2.5 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{x.subclass}</span>
                      {x.cutoff ? (
                        <Pill t={x.cutoff.reaches ? "green" : "amber"}>{x.cutoff.reaches ? `Reaches last cut-off (${x.cutoff.minPoints})` : `${x.cutoff.gap} below last cut-off (${x.cutoff.minPoints})`}</Pill>
                      ) : (
                        <span className="text-muted-foreground">{x.subclass === "189" ? "No round has invited this occupation yet" : "No national cut-off (state nomination)"}</span>
                      )}
                      <span className="ml-auto">
                        <Spark values={h} />
                      </span>
                    </div>
                    {x.position ? (
                      <p className="flex items-center gap-1 text-muted-foreground">
                        {fmt(x.position.ahead, x.position.approx)} submitted EOIs on {w.points}+ points
                        {x.position.submitted ? ` of ${x.position.submitted.toLocaleString("en-AU")}` : ""}
                        {trend ? trend > 0 ? <TrendingUp className="size-3 text-amber-500" /> : <TrendingDown className="size-3 text-emerald-500" /> : null}
                      </p>
                    ) : null}
                    {x.cutoff ? <p className="text-muted-foreground">Last round {dmy(x.cutoff.date)}</p> : null}
                  </div>
                );
              })}
              {w.eoiAsAt ? <p className="text-[11px] text-muted-foreground">EOI data as at {dmy(w.eoiAsAt)}. Checked hourly for new rounds.</p> : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="py-4 text-center text-sm text-muted-foreground">Watch this client&apos;s occupation to see their place in the EOI backlog each month and get an alert when a round reaches their points.</p>
      )}
    </Section>
  );
}
