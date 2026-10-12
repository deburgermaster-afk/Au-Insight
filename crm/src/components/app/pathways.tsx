import { AlertTriangle, BadgeCheck, Briefcase, Clock, GraduationCap, Home, Languages, Plane, Sparkles, Target, Users, Zap, type LucideIcon } from "lucide-react";
import { Pill } from "@/components/app/badges";
import { SuggestButton } from "@/components/app/pathway-button";
import { aud, ago } from "@/lib/format";
import { type Pathway, schedule } from "@/lib/pathways";
import { cn } from "@/lib/utils";

const kinds: Record<string, { icon: LucideIcon; tone: string }> = {
  study: { icon: GraduationCap, tone: "text-sky-400 bg-sky-500/10 ring-sky-500/30" },
  english: { icon: Languages, tone: "text-violet-400 bg-violet-500/10 ring-violet-500/30" },
  skills: { icon: BadgeCheck, tone: "text-amber-400 bg-amber-500/10 ring-amber-500/30" },
  work: { icon: Briefcase, tone: "text-orange-400 bg-orange-500/10 ring-orange-500/30" },
  visa: { icon: Plane, tone: "text-fuchsia-400 bg-fuchsia-500/10 ring-fuchsia-500/30" },
  pr: { icon: Home, tone: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/30" },
};
const yrs = (m: number) => (m >= 12 ? `${(m / 12).toFixed(m % 12 ? 1 : 0)} yr` : `${Math.round(m)} mo`);

type Row = { payload: unknown; source: string; model: string | null; createdAt: Date; createdBy: string | null };
type Study = { course: string; institution: string | null; status: string; intake: string | null };

/** Right-hand panel on a client file: current study plus the suggested route to permanent residence. */
export function PathwayPanel({ clientId, row, study }: { clientId: string; row: Row | null; study: Study | null }) {
  const p = row?.payload as Pathway | undefined;
  const plan = p ? schedule(p.steps) : { slots: [], total: 0 };
  const slots = plan.slots;
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <span className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-fuchsia-500 text-white">
          <Sparkles className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Suggested pathways</p>
          <p className="truncate text-[11px] text-muted-foreground">{row ? (row.source === "rules" ? "Rules estimate" : `AI · ${row.model?.split("/").pop()?.replace(":free", "") ?? row.source}`) : "Study to permanent residence"}</p>
        </div>
        {row ? <SuggestButton clientId={clientId} again /> : null}
      </div>

      {study ? (
        <div className="flex items-center gap-3 border-b bg-muted/20 px-4 py-2.5">
          <GraduationCap className="size-4 shrink-0 text-sky-400" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium">{study.course}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {study.institution ?? "Institution not set"}
              {study.intake ? ` · ${study.intake}` : ""}
            </p>
          </div>
          <Pill t={study.status === "enrolled" ? "green" : "blue"} className="capitalize">
            {study.status === "coe" ? "CoE" : study.status}
          </Pill>
        </div>
      ) : null}

      {!p ? (
        <div className="grid gap-3 p-4">
          <p className="text-[13px] text-muted-foreground">
            AI reviews this file against similar students your agency has helped and maps the route to PR. With too little history, it plans the fastest route from the current visa and course, plus courses that add points.
          </p>
          <SuggestButton clientId={clientId} />
        </div>
      ) : (
        <div className="grid gap-4 p-4">
          <div>
            <p className="text-[15px] leading-snug font-semibold">{p.headline}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{p.summary}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
              <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                <Clock className="size-3" /> ~{yrs(plan.total || p.totalMonths)} to PR
              </span>
              {p.pointsEstimate ? (
                <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
                  <Target className="size-3" /> ~{p.pointsEstimate} pts
                </span>
              ) : null}
              <span className={cn("rounded-full border px-2 py-0.5 capitalize", p.confidence === "high" ? "text-emerald-400" : p.confidence === "medium" ? "text-amber-400" : "text-muted-foreground")}>{p.confidence} confidence</span>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {p.mode === "agency_pattern" ? <Users className="size-3" /> : <Zap className="size-3" />}
              {p.mode === "agency_pattern" ? "From your agency's similar students" : "Fastest route (not enough agency history)"} · {p.basedOn}
            </p>
          </div>

          <ol className="relative grid gap-0">
            {p.steps.map((s, i) => {
              const k = kinds[s.kind] ?? kinds.visa;
              const { from, to: at } = slots[i];
              return (
                <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                  {i < p.steps.length - 1 ? <span className="absolute top-8 bottom-0 left-[15px] w-px bg-gradient-to-b from-border to-border/30" /> : null}
                  <span className={cn("z-10 grid size-8 shrink-0 place-items-center rounded-full ring-1", k.tone)}>
                    <k.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium">{s.title}</p>
                      {s.visa ? <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">{s.visa}</span> : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {s.overlapsPrevious ? "Alongside · " : ""}Month {Math.round(from)}–{Math.round(at)} · {yrs(s.months)}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              );
            })}
          </ol>

          {p.secondaryCourses.length ? (
            <div className="grid gap-1.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Courses that help</p>
              {p.secondaryCourses.map((c, i) => {
                const hit = p.courses?.[i];
                return (
                  <div key={i} className="rounded-lg border bg-muted/20 p-2.5">
                    <div className="flex items-start gap-2">
                      <p className="min-w-0 flex-1 text-[13px] leading-snug font-medium">{c.name}</p>
                      {c.pointsGain ? <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">+{c.pointsGain} pts</span> : null}
                    </div>
                    <p className="text-[11px] text-muted-foreground">{c.why}</p>
                    {hit ? (
                      <p className="mt-1 truncate text-[11px]">
                        <span className="text-sky-400">CRICOS {hit.code}</span> · {hit.provider}
                        {hit.tuition ? ` · ${aud(hit.tuition)}/yr` : ""}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {p.alternatives.length ? (
            <div className="grid gap-1">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Other routes</p>
              {p.alternatives.map((a, i) => (
                <div key={i} className="flex items-baseline gap-2 text-xs">
                  <span className="font-medium">{a.title}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{a.visas}</span>
                  <span className="ml-auto shrink-0 text-muted-foreground">~{yrs(a.months)}</span>
                </div>
              ))}
            </div>
          ) : null}

          {p.risks.length ? (
            <ul className="grid gap-1 rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
              {p.risks.map((r, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3 shrink-0 text-amber-500" /> {r}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="text-[10px] text-muted-foreground" suppressHydrationWarning>
            {row ? `Suggested ${ago(row.createdAt)}${row.createdBy ? ` for ${row.createdBy}` : ""}. ` : ""}Decision support for a registered agent: check current visa settings before advising.
          </p>
        </div>
      )}
    </div>
  );
}
