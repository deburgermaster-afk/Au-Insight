import { ExternalLink } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/app/skeletons";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { dmy } from "@/lib/format";
import { news, NEWS_UPDATED, type NewsItem } from "@/lib/news";
import { invitationRounds } from "@/lib/occupations";
import { cn } from "@/lib/utils";

export const metadata = { title: "Immigration updates" };

const STATUS: Record<NewsItem["status"], { label: string; cls: string }> = {
  "in-force": { label: "In force", cls: "bg-emerald-500/12 text-emerald-600" },
  announced: { label: "Announced", cls: "bg-amber-500/15 text-amber-700" },
  upcoming: { label: "Watch", cls: "bg-sky-500/12 text-sky-600" },
};

function News() {
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">Changes that affect your clients, newest first. Updated {dmy(NEWS_UPDATED)}. &ldquo;Announced&rdquo; items have no legal instrument yet; check Home Affairs before advising.</p>
      {news.map((n) => (
        <article key={n.id} className="grid gap-2 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[n.status].cls)}>{STATUS[n.status].label}</span>
            <span className="text-xs text-muted-foreground">{n.effective ? `From ${dmy(n.effective)}` : dmy(n.date)}</span>
            <span className="ml-auto flex flex-wrap gap-1">
              {n.tags.map((t) =>
                /^\d|^[A-Z]{2,4}$/.test(t) && !["Fees", "Agents"].includes(t) ? (
                  <Link key={t} href={`/app/visas/${encodeURIComponent(t)}`} className="rounded-md border px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted">
                    {t}
                  </Link>
                ) : (
                  <span key={t} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {t}
                  </span>
                ),
              )}
            </span>
          </div>
          <h2 className="text-[15px] font-semibold">{n.title}</h2>
          <p className="text-[13px] text-foreground/85">{n.summary}</p>
          <ul className="grid list-disc gap-1 pl-5 text-[13px] text-foreground/80">
            {n.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p className="flex flex-wrap gap-x-3 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
            Sources:
            {n.sources.map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 underline-offset-2 hover:underline">
                {s.label} <ExternalLink className="size-3" />
              </a>
            ))}
          </p>
        </article>
      ))}
    </div>
  );
}

async function Rounds() {
  await connection();
  const { rounds, latest, cutoffs, checked } = await invitationRounds().catch(() => ({ rounds: [], latest: null, cutoffs: [], checked: null }));
  if (!rounds.length) return <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Invitation round data isn&apos;t available right now.</p>;
  const latestRows = rounds.filter((r) => r.round_date === latest);
  const years = [...new Set(rounds.map((r) => r.program_year).filter(Boolean))];
  const thisYear = "2026-27";
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {latestRows.map((r) => (
          <div key={r.subclass + r.subclass_name} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Latest round · {dmy(r.round_date)}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{r.invited?.toLocaleString() ?? "—"}</p>
            <p className="text-[13px]">{r.subclass_name.replace(/ visa \(subclass \d+\)/, ` (${r.subclass})`)}</p>
          </div>
        ))}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">{thisYear} program year</p>
          <p className="mt-1 text-[15px] font-semibold">{years.includes(thisYear) ? "Rounds published" : "No round yet"}</p>
          <p className="text-[12px] text-muted-foreground">{years.includes(thisYear) ? "See the table below." : "Home Affairs hasn't published a 2026–27 round. Rounds have no fixed dates."}{checked ? ` Checked ${dmy(checked)}.` : ""}</p>
        </div>
      </div>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Cut-offs in the {latest ? dmy(latest) : ""} round · {cutoffs.length} occupations</h2>
        <div className="max-h-[420px] overflow-auto rounded-xl border bg-card">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 bg-muted/80 text-left text-xs text-muted-foreground backdrop-blur">
              <tr>
                <th className="px-3 py-2 font-medium">Occupation</th>
                <th className="px-3 py-2 font-medium">ANZSCO</th>
                <th className="px-3 py-2 font-medium">Visa</th>
                <th className="px-3 py-2 text-right font-medium">Min points</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {cutoffs.map((c) => (
                <tr key={c.subclass + c.anzsco}>
                  <td className="px-3 py-1.5">
                    <Link href={`/app/occupations/${c.anzsco}`} className="hover:underline">
                      {c.occupation}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-xs text-muted-foreground">{c.anzsco}</td>
                  <td className="px-3 py-1.5">{c.subclass}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{c.min_points ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-2">
        <h2 className="text-sm font-semibold">Round history</h2>
        <div className="overflow-auto rounded-xl border bg-card">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Visa</th>
                <th className="px-3 py-2 font-medium">Program year</th>
                <th className="px-3 py-2 text-right font-medium">Invited</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rounds.map((r) => (
                <tr key={r.round_date + r.subclass_name}>
                  <td className="px-3 py-1.5 tabular-nums">{dmy(r.round_date)}</td>
                  <td className="px-3 py-1.5">
                    {r.subclass} <span className="text-xs text-muted-foreground">{/Family/.test(r.subclass_name) ? "Family sponsored" : ""}</span>
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.program_year}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.invited?.toLocaleString() ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">
          From the Department of Home Affairs SkillSelect invitation rounds pages, imported by Immi Insight.{" "}
          <a href="https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds" target="_blank" rel="noreferrer" className="underline">
            Source
          </a>
        </p>
      </section>
    </div>
  );
}

export default async function UpdatesPage({ searchParams }: PageProps<"/app/updates">) {
  const tab = (await searchParams).tab === "rounds" ? "rounds" : "news";
  return (
    <Tabs defaultValue={tab} className="max-w-5xl gap-3">
      <TabsList>
        <TabsTrigger value="news">
          News <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">{news.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="rounds">Invitation rounds</TabsTrigger>
      </TabsList>
      <TabsContent value="news">
        <News />
      </TabsContent>
      <TabsContent value="rounds">
        <Suspense fallback={<TableSkeleton />}>
          <Rounds />
        </Suspense>
      </TabsContent>
    </Tabs>
  );
}
