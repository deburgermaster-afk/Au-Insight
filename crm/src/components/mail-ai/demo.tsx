"use client";

import { BadgeCheck, Bot, Check, FileText, Mail, MousePointerClick, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const steps = [
  { icon: Mail, title: "Email arrives", text: "Home Affairs, an assessing body or the client writes in." },
  { icon: Bot, title: "AI reads it", text: "It classifies the email and pulls out the facts." },
  { icon: MousePointerClick, title: "You decide", text: "One suggested action. Nothing changes until you click." },
];

const json: [string, string, string][] = [
  ["category", '"grant"', "text-emerald-400"],
  ["visa", '"190"', "text-sky-300"],
  ["trn", '"EGOX4H7K2PQ"', "text-amber-300"],
  ["grantNumber", '"7791 2204 6618"', "text-amber-300"],
  ["decisionDate", '"2026-10-12"', "text-violet-300"],
  ["action", '"set_stage_decision"', "text-fuchsia-300"],
];

/** A looping three-step picture of what the AI mail assistant does. */
export function MailAiDemo() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => setI((x) => (x + 1) % 3), i === 1 ? 4200 : 3400);
    return () => clearTimeout(t);
  }, [i, paused]);
  return (
    <div className="grid gap-3" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid grid-cols-3 gap-1.5">
        {steps.map((s, n) => (
          <button key={s.title} type="button" onClick={() => setI(n)} className={cn("rounded-xl border p-2 text-left transition", n === i ? "border-primary/50 bg-primary/5" : "border-border/60 opacity-60 hover:opacity-90")}>
            <span className="flex items-center gap-1.5 text-[11px] font-medium">
              <span className={cn("grid size-5 place-items-center rounded-full text-[10px]", n === i ? "bg-primary text-primary-foreground" : n < i ? "bg-emerald-500 text-white" : "bg-muted")}>{n < i ? <Check className="size-3" /> : n + 1}</span>
              {s.title}
            </span>
            <span className="mt-0.5 hidden text-[10px] leading-snug text-muted-foreground sm:block">{s.text}</span>
          </button>
        ))}
      </div>
      <div className="relative h-56 overflow-hidden rounded-2xl border bg-[radial-gradient(120%_120%_at_0%_0%,oklch(0.75_0.15_55/.12),transparent_50%),radial-gradient(120%_120%_at_100%_100%,oklch(0.6_0.18_300/.14),transparent_55%)] p-4">
        <AnimatePresence mode="wait">
          {i === 0 ? (
            <motion.div key="mail" initial={{ opacity: 0, y: 24, rotate: -1 }} animate={{ opacity: 1, y: 0, rotate: 0 }} exit={{ opacity: 0, x: -40 }} transition={{ type: "spring", stiffness: 160, damping: 18 }} className="mx-auto max-w-md rounded-xl border bg-card p-3 shadow-xl">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-full bg-sky-500/15 text-[10px] font-bold text-sky-400">HA</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-[12px] font-medium">
                    ImmiAccount <BadgeCheck className="size-3 text-sky-400" />
                  </p>
                  <p className="truncate font-mono text-[10px] text-muted-foreground">noreply@homeaffairs.gov.au</p>
                </div>
                <span className="text-[10px] text-muted-foreground">9:41 am</span>
              </div>
              <p className="mt-2 text-[13px] font-medium">Grant notification · TRN <mark className="rounded bg-amber-400/20 px-0.5 text-amber-300">EGOX4H7K2PQ</mark></p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Dear <mark className="rounded bg-sky-400/15 px-0.5 text-sky-300">Priya Nair</mark>, a <mark className="rounded bg-sky-400/15 px-0.5 text-sky-300">Skilled Nominated (subclass 190)</mark> visa was granted on <mark className="rounded bg-violet-400/15 px-0.5 text-violet-300">12 October 2026</mark>. Grant number <mark className="rounded bg-amber-400/20 px-0.5 text-amber-300">7791 2204 6618</mark>…
              </p>
              <p className="mt-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                <FileText className="size-3" /> Grant_letter.pdf
              </p>
            </motion.div>
          ) : i === 1 ? (
            <motion.div key="ai" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: -40 }} className="mx-auto max-w-md overflow-hidden rounded-xl border bg-zinc-950 font-mono text-[11px] shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5 text-[10px] text-white/50">
                <span className="size-2 rounded-full bg-rose-500/70" />
                <span className="size-2 rounded-full bg-amber-500/70" />
                <span className="size-2 rounded-full bg-emerald-500/70" />
                <span className="ml-2">ai.understand(email)</span>
                <motion.span className="ml-auto text-emerald-400" animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                  reading…
                </motion.span>
              </div>
              <div className="p-3 leading-relaxed text-white/80">
                {"{"}
                {json.map(([k, v, tone], n) => (
                  <motion.div key={k} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.35 + n * 0.45 }} className="pl-4">
                    <span className="text-white/50">"{k}"</span>: <span className={tone}>{v}</span>
                    {n < json.length - 1 ? "," : ""}
                  </motion.div>
                ))}
                {"}"}
              </div>
            </motion.div>
          ) : (
            <motion.div key="you" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mx-auto max-w-md rounded-xl border bg-card p-3 shadow-xl">
              <div className="flex items-center gap-2.5">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 text-[11px] font-semibold text-white">PN</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">Priya Nair</p>
                  <p className="text-[10px] text-muted-foreground">LDG-2026-0008 · Skilled Nominated (190)</p>
                </div>
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.3 }} className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  Visa granted
                </motion.span>
              </div>
              <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium">
                  <Bot className="size-3.5 text-emerald-400" /> Subclass 190 visa granted
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Grant 7791 2204 6618 on 12 Oct 2026. Suggested: record the decision on the matter.</p>
                <div className="mt-2 flex gap-1.5">
                  <motion.span animate={{ boxShadow: ["0 0 0 0 rgba(16,185,129,.0)", "0 0 0 6px rgba(16,185,129,.18)", "0 0 0 0 rgba(16,185,129,.0)"] }} transition={{ repeat: Infinity, duration: 1.6 }} className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground">
                    Record the grant
                  </motion.span>
                  <span className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground">
                    <X className="size-3" /> Dismiss
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
