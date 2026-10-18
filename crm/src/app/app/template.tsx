"use client";

import { motion, useReducedMotion } from "motion/react";

// Re-mounts on every navigation inside the app: each page eases in, so moving around feels fluid.
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }} className="flex min-w-0 flex-1 flex-col">
      {children}
    </motion.div>
  );
}
