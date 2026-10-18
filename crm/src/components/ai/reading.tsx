"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * An illustrated "agent reading" animation: a stack of pages being scanned under a magnifier,
 * with lines highlighting as they're read and the current step shown underneath.
 */
export function ReadingAnimation({ steps, className, compact }: { steps: string[]; className?: string; compact?: boolean }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (steps.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % steps.length), 2200);
    return () => clearInterval(t);
  }, [steps.length]);
  const W = compact ? 120 : 168;
  return (
    <div className={cn("grid place-items-center gap-3 py-4", className)} role="status" aria-live="polite">
      <div className="relative" style={{ width: W, height: W * 0.86 }}>
        {/* page stack */}
        {[2, 1].map((k) => (
          <motion.div
            key={k}
            className="absolute rounded-lg border bg-card shadow-sm"
            style={{ inset: 0, left: k * 8, top: -k * 6, right: -k * 8, opacity: 0.5 / k }}
            animate={{ rotate: k === 2 ? [3, 4, 3] : [-2, -3, -2] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
        <div className="absolute inset-0 overflow-hidden rounded-lg border bg-card p-3 shadow-md">
          <div className="mb-2 h-2 w-1/2 rounded bg-foreground/15" />
          {Array.from({ length: 7 }).map((_, n) => (
            <motion.div
              key={n}
              className="mb-1.5 h-1.5 rounded"
              style={{ width: `${[92, 78, 88, 64, 95, 70, 84][n]}%` }}
              animate={{ backgroundColor: ["color-mix(in oklch, var(--foreground) 10%, transparent)", "color-mix(in oklch, var(--chart-2) 55%, transparent)", "color-mix(in oklch, var(--foreground) 10%, transparent)"] }}
              transition={{ duration: 2.1, repeat: Infinity, delay: n * 0.28, ease: "easeInOut" }}
            />
          ))}
          {/* scan beam */}
          <motion.div className="pointer-events-none absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-[var(--chart-2)]/25 to-transparent" animate={{ top: ["-15%", "100%"] }} transition={{ duration: 2.1, repeat: Infinity, ease: "easeInOut" }} />
        </div>
        {/* magnifier */}
        <motion.svg
          viewBox="0 0 48 48"
          className="absolute text-[var(--chart-2)] drop-shadow"
          style={{ width: W * 0.36, height: W * 0.36 }}
          animate={{ left: ["8%", "52%", "30%", "8%"], top: ["10%", "34%", "58%", "10%"] }}
          transition={{ duration: 6.3, repeat: Infinity, ease: "easeInOut" }}
        >
          <circle cx="20" cy="20" r="13" fill="color-mix(in oklch, var(--card) 55%, transparent)" stroke="currentColor" strokeWidth="4" />
          <path d="M30 30 L43 43" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          <circle cx="15" cy="15" r="4" fill="white" opacity="0.6" />
        </motion.svg>
        {/* sparkles */}
        {[0, 1, 2].map((n) => (
          <motion.span
            key={n}
            className="absolute size-1.5 rounded-full bg-[var(--chart-4)]"
            style={{ left: `${[85, 10, 70][n]}%`, top: `${[5, 70, 90][n]}%` }}
            animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, delay: n * 0.6 }}
          />
        ))}
      </div>
      <div className="h-5 overflow-hidden text-center text-[13px] text-muted-foreground">
        <AnimatePresence mode="wait">
          <motion.p key={i} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }} transition={{ duration: 0.25 }}>
            {steps[i] ?? ""}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
