"use client";

import { Check, Loader2, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";
import { DuskScene } from "@/components/marketing/dusk";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type WizardStep = { key: string; title: string; hint: string; icon: LucideIcon };

/**
 * Full-screen guided setup: a step rail on the left, the current step on the right, sliding
 * between steps. Used for agency setup and for new staff joining an agency.
 */
export function WizardShell({ steps, index, org, accent, children, aside }: { steps: WizardStep[]; index: number; org: string; accent?: string | null; children: ReactNode; aside?: ReactNode }) {
  const step = steps[index];
  const pct = Math.round((index / (steps.length - 1)) * 100);
  return (
    <div className="dark relative min-h-dvh bg-black text-foreground">
      <DuskScene className="opacity-70" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,transparent,rgba(0,0,0,.65))]" />
      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl items-center p-3 sm:p-6">
        <div className="glass grid w-full overflow-hidden rounded-3xl border border-white/10 shadow-2xl lg:min-h-[40rem] lg:grid-cols-[17rem_minmax(0,1fr)]">
          <aside className="hidden flex-col border-r border-white/10 bg-white/[0.02] p-6 lg:flex">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Logo className="size-6" /> Lodgely
            </div>
            <p className="mt-1 truncate text-xs text-white/50">{org}</p>
            <ol className="mt-8 grid gap-1">
              {steps.map((s, i) => {
                const done = i < index;
                const now = i === index;
                return (
                  <li key={s.key} className={cn("flex items-center gap-3 rounded-xl px-2.5 py-2 transition", now && "bg-white/[0.06]")}>
                    <span
                      className={cn("grid size-7 shrink-0 place-items-center rounded-full border text-[11px] font-semibold transition", done ? "border-transparent bg-emerald-500 text-white" : now ? "border-white/40 bg-white text-black" : "border-white/15 text-white/40")}
                      style={now && accent ? { background: accent, borderColor: accent, color: "white" } : undefined}
                    >
                      {done ? <Check className="size-3.5" /> : <s.icon className="size-3.5" />}
                    </span>
                    <span className="min-w-0">
                      <span className={cn("block truncate text-[13px]", now ? "font-medium text-white" : done ? "text-white/70" : "text-white/40")}>{s.title}</span>
                      {now ? <span className="block truncate text-[11px] text-white/45">{s.hint}</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <div className="mt-auto">
              <div className="h-1 overflow-hidden rounded-full bg-white/10">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-fuchsia-500" initial={false} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
              </div>
              <p className="mt-2 text-[11px] text-white/45">{pct}% complete · you can change all of this later in Settings</p>
            </div>
          </aside>

          <section className="flex min-w-0 flex-col">
            <div className="flex items-center gap-3 border-b border-white/10 px-5 py-3 lg:hidden">
              <Logo className="size-5" />
              <span className="truncate text-xs text-white/60">
                Step {index + 1} of {steps.length} · {step.title}
              </span>
              <div className="ml-auto h-1 w-20 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-fuchsia-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className={cn("grid flex-1", aside && "xl:grid-cols-[minmax(0,1fr)_18rem]")}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={step.key} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.22, ease: "easeOut" }} className="flex min-w-0 flex-col p-5 sm:p-8">
                  <p className="text-[11px] font-medium tracking-[0.18em] text-white/45 uppercase">
                    Step {index + 1} of {steps.length}
                  </p>
                  {children}
                </motion.div>
              </AnimatePresence>
              {aside ? <div className="hidden border-l border-white/10 bg-white/[0.02] p-6 xl:block">{aside}</div> : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export function StepTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mt-2 mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-[28px]">{title}</h1>
      {sub ? <p className="mt-1.5 max-w-xl text-sm text-white/55">{sub}</p> : null}
    </div>
  );
}

export function StepFooter({ onBack, next = "Continue", pending, onSkip, disabled }: { onBack?: () => void; next?: string; pending?: boolean; onSkip?: () => void; disabled?: boolean }) {
  return (
    <div className="mt-auto flex items-center gap-2 pt-8">
      {onBack ? (
        <Button type="button" variant="ghost" className="rounded-full text-white/70" onClick={onBack} disabled={pending}>
          Back
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {onSkip ? (
          <Button type="button" variant="ghost" className="rounded-full text-white/50" onClick={onSkip} disabled={pending}>
            Skip for now
          </Button>
        ) : null}
        <Button type="submit" className="h-10 min-w-32 rounded-full bg-white text-black hover:bg-white/90" disabled={pending || disabled}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          {next}
        </Button>
      </div>
    </div>
  );
}

/** A dark input group used across both wizards. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn("grid gap-1.5", className)}>
      <span className="text-[13px] text-white/75">{label}</span>
      {children}
      {hint ? <span className="text-[11px] text-white/40">{hint}</span> : null}
    </label>
  );
}

export const inputCls = "h-10 border-white/10 bg-white/[0.04] text-white placeholder:text-white/30";
