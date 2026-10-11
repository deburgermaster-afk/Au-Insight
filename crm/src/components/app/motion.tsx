"use client";

import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";

const ease = [0.22, 1, 0.36, 1] as const;

/** Fades and lifts its children in, once, when first shown. */
export function FadeIn({ children, delay = 0, className, y = 8 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay, ease }}>
      {children}
    </motion.div>
  );
}

/** Staggers its direct children in. */
export function Stagger({ children, className, gap = 0.04 }: { children: ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.32, ease } } }}
    >
      {children}
    </motion.div>
  );
}

/** Counts up to [value] when it scrolls into view. */
export function NumberTicker({ value, prefix = "", suffix = "", decimals = 0, className }: { value: number; prefix?: string; suffix?: string; decimals?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toLocaleString("en-AU", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    if (!inView) return;
    const c = animate(mv, value, { duration: 0.9, ease });
    return () => c.stop();
  }, [inView, mv, value]);
  return (
    <motion.span ref={ref} className={className}>
      {text}
    </motion.span>
  );
}

/** A thin bar that fills to [value] (0–1). */
export function ProgressBar({ value, className = "" }: { value: number; className?: string }) {
  return (
    <div className={`h-1.5 w-full overflow-hidden rounded-full bg-muted ${className}`}>
      <motion.div
        className="h-full rounded-full bg-gradient-to-r from-[var(--chart-3)] to-[var(--chart-2)]"
        initial={{ width: 0 }}
        animate={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%` }}
        transition={{ duration: 0.7, ease }}
      />
    </div>
  );
}
