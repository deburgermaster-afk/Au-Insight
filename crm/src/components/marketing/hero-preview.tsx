"use client";

import { motion } from "motion/react";

// A live-looking slice of the app for the landing page: a pipeline whose cards drift between
// columns. Pure markup, no data.

const columns = [
  { name: "Collecting documents", tone: "bg-amber-500", cards: [["Priya Sharma", "190 · NSW", 0.62], ["Tomás Silva", "482 · Core", 0.4]] },
  { name: "Ready to lodge", tone: "bg-fuchsia-500", cards: [["Istiak Ahmed", "485 · Post-study", 1], ["Mei Chen", "820/801", 0.9]] },
  { name: "Lodged", tone: "bg-sky-500", cards: [["Saima Rahman", "500 · Student", 1], ["Arjun Patel", "189 · Points", 1]] },
  { name: "Granted", tone: "bg-emerald-500", cards: [["Liam O'Connor", "186 · TRT", 1]] },
] as const;

export function HeroPreview() {
  return (
    <div className="relative mx-auto max-w-5xl">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-b from-orange-400/20 via-fuchsia-500/10 to-transparent blur-3xl" />
      <div className="ring-gradient relative overflow-hidden rounded-2xl bg-[#141414] text-white shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-rose-400" />
          <span className="size-2.5 rounded-full bg-amber-400" />
          <span className="size-2.5 rounded-full bg-emerald-400" />
          <span className="ml-3 truncate text-xs text-white/45">app.lodgely.au/app/matters</span>
        </div>
        <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
          {columns.map((c, ci) => (
            <div key={c.name} className="rounded-xl bg-white/[0.04] p-2.5">
              <div className="mb-2 flex items-center gap-2 px-1 text-xs font-medium">
                <span className={`size-2 rounded-full ${c.tone}`} />
                <span className="truncate">{c.name}</span>
              </div>
              <div className="grid gap-2">
                {c.cards.map(([name, visa, p], i) => (
                  <motion.div
                    key={name}
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: [0, -3, 0], scale: 1 }}
                    transition={{
                      opacity: { delay: 0.3 + ci * 0.12 + i * 0.08 },
                      scale: { delay: 0.3 + ci * 0.12 + i * 0.08 },
                      y: { duration: 4 + i, repeat: Infinity, ease: "easeInOut", delay: ci * 0.4 + i },
                    }}
                    className="rounded-lg border border-white/10 bg-[#1c1c1c] p-2.5 text-left"
                  >
                    <p className="truncate text-xs font-medium">{name}</p>
                    <p className="truncate text-[11px] text-white/45">{visa}</p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${(p as number) * 100}%` }}
                        transition={{ delay: 0.6 + ci * 0.12, duration: 0.9 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
