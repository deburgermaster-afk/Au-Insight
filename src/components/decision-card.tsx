"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangleIcon, CheckIcon, ChevronDownIcon, CircleHelpIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import type { CriterionStatus, Outcome, VisaAssessment } from "@/lib/engine";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const outcomeStyle: Record<Outcome, { label: string; className: string }> = {
  eligible: { label: "Eligible", className: "bg-brand text-brand-foreground" },
  needs_info: { label: "Needs information", className: "bg-muted text-foreground" },
  not_eligible: { label: "Not eligible", className: "bg-destructive/15 text-destructive" },
};

const statusIcon: Record<CriterionStatus, { icon: typeof CheckIcon; className: string; label: string }> = {
  met: { icon: CheckIcon, className: "bg-success/15 text-success", label: "Met" },
  not_met: { icon: XIcon, className: "bg-destructive/15 text-destructive", label: "Not met" },
  unknown: { icon: CircleHelpIcon, className: "bg-muted text-muted-foreground", label: "Unknown" },
  at_risk: { icon: AlertTriangleIcon, className: "bg-warning/15 text-warning", label: "At risk" },
};

export function PointsMeter({ min, max, passMark }: { min: number; max: number; passMark: number }) {
  const scale = 130;
  const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-muted-foreground">Points</span>
        <span className="font-medium tabular-nums">
          {min === max ? min : `${min}–${max}`} <span className="text-muted-foreground">/ {passMark} needed</span>
        </span>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-muted">
        <motion.div className="absolute inset-y-0 left-0 rounded-full bg-foreground/25" initial={{ width: 0 }} animate={{ width: pct(max) }} transition={spring.gentle} />
        <motion.div
          className={cn("absolute inset-y-0 left-0 rounded-full", min >= passMark ? "bg-brand" : "bg-foreground")}
          initial={{ width: 0 }}
          animate={{ width: pct(min) }}
          transition={spring.gentle}
        />
        <div className="absolute inset-y-0 w-0.5 bg-background" style={{ left: pct(passMark) }} />
      </div>
    </div>
  );
}

export function DecisionCard({ result, defaultOpen = false }: { result: VisaAssessment; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const o = outcomeStyle[result.outcome];

  return (
    <motion.div layout transition={spring.soft} className="overflow-hidden rounded-2xl border bg-card">
      <button onClick={() => setOpen(!open)} className="flex w-full items-start gap-3 p-4 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-muted-foreground">
            Subclass {result.subclass} · {result.stream}
          </p>
          <p className="mt-0.5 font-medium">{result.name}</p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", o.className)}>{o.label}</span>
        <ChevronDownIcon className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <div className="space-y-3 px-4 pb-4">
        {result.points && <PointsMeter {...result.points} />}
        {result.blockers.length > 0 && (
          <ul className="space-y-1 text-sm text-destructive">
            {result.blockers.map((b) => (
              <li key={b}>• {b}</li>
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring.soft}>
            <ul className="divide-y border-t">
              {result.criteria.map((c, i) => {
                const s = statusIcon[c.status];
                return (
                  <motion.li
                    key={c.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ ...spring.soft, delay: i * 0.025 }}
                    className="flex gap-3 px-4 py-3"
                  >
                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", s.className)} title={s.label}>
                      <s.icon className="size-3" />
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p>{c.title}</p>
                      {c.detail && <p className="text-muted-foreground">{c.detail}</p>}
                      {c.missing.length > 0 && <p className="text-muted-foreground">{c.missing[0].question}</p>}
                      <a href={c.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        {c.source.title} <ExternalLinkIcon className="size-3" />
                      </a>
                    </div>
                  </motion.li>
                );
              })}
            </ul>
            {result.points && (
              <div className="border-t px-4 py-3">
                <p className="mb-2 text-xs text-muted-foreground">Points breakdown (Schedule 6D)</p>
                <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                  {result.points.factors.map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-muted-foreground">{f.label}</dt>
                      <dd className="text-right tabular-nums">{f.min === f.max ? f.min : `${f.min}–${f.max}`}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
            {result.reviewStatus === "draft" && (
              <p className="border-t px-4 py-2 text-xs text-muted-foreground">Rule set awaiting expert review against the cited sources.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
