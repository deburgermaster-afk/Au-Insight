"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertOctagon, AlertTriangle, CheckCircle2, ChevronDown, Info, ListTodo, RefreshCw, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { CaseFlag, CaseReviewResult } from "@/db/crm-schema";
import { finishCaseReview, reviewReadDocument, startCaseReview } from "@/lib/case-review-actions";
import { cn } from "@/lib/utils";
import { ReadingAnimation } from "./reading";

const READY = {
  not_ready: { label: "Not ready", cls: "bg-rose-500/12 text-rose-600" },
  needs_work: { label: "Needs work", cls: "bg-amber-500/14 text-amber-700" },
  nearly_ready: { label: "Nearly ready", cls: "bg-sky-500/12 text-sky-700" },
  ready: { label: "Ready to lodge", cls: "bg-emerald-500/12 text-emerald-700" },
} as const;
const LEVEL = {
  critical: { icon: AlertOctagon, cls: "text-rose-500", ring: "border-rose-500/30 bg-rose-500/[0.04]" },
  warning: { icon: AlertTriangle, cls: "text-amber-500", ring: "border-amber-500/30 bg-amber-500/[0.04]" },
  info: { icon: Info, cls: "text-sky-500", ring: "border-border" },
} as const;

function Gauge({ value, label }: { value: number; label: string }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = value >= 80 ? "var(--success)" : value >= 55 ? "var(--chart-3)" : "oklch(0.64 0.21 25)";
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 64 64" className="size-14 -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--muted)" strokeWidth="7" />
        <motion.circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - value / 100) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
      </svg>
      <div>
        <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function Flag({ f }: { f: CaseFlag }) {
  const [open, setOpen] = useState(false);
  const L = LEVEL[f.level];
  return (
    <li className={cn("rounded-lg border", L.ring)}>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-start gap-2 px-2.5 py-2 text-left">
        <L.icon className={cn("mt-0.5 size-4 shrink-0", L.cls)} />
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-medium leading-snug">{f.title}</span>
          <span className="block text-[11px] text-muted-foreground">
            {f.area}
            {f.source === "ai" ? " · AI" : ""}
          </span>
        </span>
        <ChevronDown className={cn("mt-0.5 size-3.5 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="grid gap-1 px-2.5 pb-2.5 pl-8 text-xs">
              <p className="text-muted-foreground">{f.detail}</p>
              {f.fix ? <p><span className="font-medium">Fix: </span>{f.fix}</p> : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

/**
 * The AI case review section: profile and document strength, flags (mistakes, gaps, risks) and next
 * steps. Refresh reads any unchecked documents on the server, then re-weighs the whole file.
 */
export function CaseReview({ clientId, matterId, initial, finishedAt, aiOn }: { clientId: string; matterId: string | null; initial: CaseReviewResult | null; finishedAt: string | null; aiOn: boolean }) {
  const [result, setResult] = useState(initial);
  const [when, setWhen] = useState(finishedAt);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [level, setLevel] = useState<"all" | "critical" | "warning" | "info">("all");
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();

  const run = async () => {
    setRunning(true);
    setSteps(["Gathering the client file…", "Checking the profile against the visa…"]);
    try {
      const s = await startCaseReview(clientId, matterId);
      if (!s.ok) throw new Error(s.error);
      for (const [i, d] of s.docs.entries()) {
        setSteps([`Reading ${d.name}`, `Document ${i + 1} of ${s.docs.length}`, "Comparing with the client record…"]);
        await reviewReadDocument(s.id, d.id);
      }
      setSteps(s.ai ? ["Cross-checking names, dates and claims…", "Scoring profile strength…", "Scoring document strength…", "Writing the summary…"] : ["Running rule checks…"]);
      const f = await finishCaseReview(s.id);
      if (!f.ok) throw new Error(f.error);
      setResult(f.result);
      setWhen(new Date().toISOString());
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The review didn't finish.");
    } finally {
      setRunning(false);
    }
  };

  const flags = (result?.flags ?? []).filter((f) => level === "all" || f.level === level);
  const counts = { critical: 0, warning: 0, info: 0, ...Object.fromEntries((["critical", "warning", "info"] as const).map((l) => [l, result?.flags.filter((f) => f.level === l).length ?? 0])) };

  return (
    <section className="rounded-xl border bg-card">
      <header className="flex min-h-11 items-center gap-2 border-b px-4 py-2.5">
        <Sparkles className="size-3.5 text-[var(--chart-2)]" />
        <h2 className="text-[13px] font-medium text-foreground/90">AI case review</h2>
        {when && !running ? <span className="text-[11px] text-muted-foreground" suppressHydrationWarning>· {new Date(when).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span> : null}
        <Button size="xs" variant="outline" className="ml-auto" disabled={running} onClick={run}>
          <RefreshCw className={cn(running && "animate-spin")} /> {result ? "Refresh" : "Review now"}
        </Button>
      </header>
      <div className="p-4">
        <AnimatePresence mode="wait">
          {running ? (
            <motion.div key="run" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ReadingAnimation steps={steps} />
              <p className="text-center text-[11px] text-muted-foreground">The agent is reading the file on the server. Keep this page open; it takes about a minute.</p>
            </motion.div>
          ) : !result ? (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid place-items-center gap-2 py-6 text-center">
              <Sparkles className="size-6 text-muted-foreground" />
              <p className="max-w-sm text-sm text-muted-foreground">Check profile strength and document strength, and flag mistakes, gaps and risks across the whole file.</p>
              {!aiOn ? <p className="text-[11px] text-muted-foreground">AI document reading is off (Settings → AI assistant): the review uses rule checks only.</p> : null}
              <Button size="sm" className="mt-1 rounded-full" onClick={run}>
                <Sparkles /> Review this file
              </Button>
            </motion.div>
          ) : (
            <motion.div key="res" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="grid gap-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Gauge value={result.profileScore} label="Profile strength" />
                <Gauge value={result.documentScore} label="Document strength" />
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", READY[result.readiness].cls)}>{READY[result.readiness].label}</span>
              </div>
              <p className="text-sm leading-relaxed">{result.summary}</p>
              {result.strengths.length ? (
                <ul className="grid gap-1">
                  {result.strengths.slice(0, 4).map((s) => (
                    <li key={s} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--success)]" /> {s}
                    </li>
                  ))}
                </ul>
              ) : null}
              {result.flags.length ? (
                <div className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <p className="mr-1 text-[13px] font-medium">Flags</p>
                    {(["all", "critical", "warning", "info"] as const).map((l) => (
                      <button key={l} type="button" onClick={() => setLevel(l)} className={cn("rounded-full px-2 py-0.5 text-[11px] capitalize", level === l ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted")}>
                        {l} {l === "all" ? result.flags.length : counts[l]}
                      </button>
                    ))}
                  </div>
                  <ul className="grid gap-1.5">
                    {flags.slice(0, showAll ? 60 : 6).map((f, i) => (
                      <Flag key={`${f.title}-${i}`} f={f} />
                    ))}
                  </ul>
                  {flags.length > 6 ? (
                    <button type="button" className="justify-self-start text-xs text-primary hover:underline" onClick={() => setShowAll(!showAll)}>
                      {showAll ? "Show fewer" : `Show all ${flags.length}`}
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-sm text-[var(--success)]">
                  <CheckCircle2 className="size-4" /> No problems found.
                </p>
              )}
              {result.nextSteps.length ? (
                <div className="grid gap-1.5 rounded-lg bg-muted/40 p-3">
                  <p className="flex items-center gap-1.5 text-[13px] font-medium">
                    <ListTodo className="size-4" /> Next steps
                  </p>
                  <ol className="grid list-decimal gap-1 pl-5 text-xs">
                    {result.nextSteps.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ol>
                </div>
              ) : null}
              <p className="text-[11px] text-muted-foreground">
                {result.documentsRead} document{result.documentsRead === 1 ? "" : "s"} read by AI. Advice for the agent: check every flag before acting on it.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
