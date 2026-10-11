"use client";

import { motion } from "motion/react";

// A small, live-looking window of the app for the sign-in panel.
const rows = [
  ["Priya Sharma", "190 · NSW", "Documents", "bg-amber-400/80"],
  ["Istiak Ahmed", "485 · Post-study", "Ready", "bg-orange-400/80"],
  ["Mei Chen", "820/801", "Lodged", "bg-sky-400/80"],
  ["Saima Rahman", "500 · Student", "Granted", "bg-emerald-400/80"],
  ["Arjun Patel", "189 · Points", "RFI", "bg-rose-400/80"],
];

export function AppGlimpse() {
  return (
    <div className="w-full max-w-md overflow-hidden rounded-xl border border-white/10 bg-[#141414]/90 text-white shadow-2xl">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="size-2 rounded-full bg-white/20" />
        <span className="mx-auto rounded bg-white/5 px-6 py-0.5 text-[10px] text-white/50">lodgely.app/matters</span>
      </div>
      <div className="grid grid-cols-[6.5rem_1fr]">
        <div className="space-y-1 border-r border-white/10 p-2 text-[10px] text-white/55">
          {["Dashboard", "Inbox", "Clients", "Matters", "Billing", "Reports"].map((n, i) => (
            <p key={n} className={`rounded px-2 py-1 ${i === 3 ? "bg-white/10 text-white" : ""}`}>
              {n}
            </p>
          ))}
        </div>
        <div className="p-3">
          <p className="text-[11px] font-medium">Good afternoon, Ayesha</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              ["Open matters", "14"],
              ["Outstanding", "$4,750"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                <p className="text-[9px] text-white/50">{k}</p>
                <p className="text-sm font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            {rows.map(([n, v, s, c], i) => (
              <motion.div
                key={n}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08 }}
                className="flex items-center gap-2 rounded px-1.5 py-1 text-[10px] odd:bg-white/[0.03]"
              >
                <span className="truncate">{n}</span>
                <span className="truncate text-white/40">{v}</span>
                <span className={`ml-auto rounded px-1.5 py-px text-[9px] font-medium text-black ${c}`}>{s}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
