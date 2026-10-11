"use client";

import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill } from "@/components/app/badges";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Visa, visaCategories } from "@/lib/visas";

export function VisaLibrary({ visas }: { visas: Visa[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return visas.filter((v) => (cat === "All" || v.category === cat) && (!t || `${v.code} ${v.name} ${v.summary} ${v.streams?.join(" ")}`.toLowerCase().includes(t)));
  }, [visas, q, cat]);
  return (
    <div className="grid gap-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 189, partner, graduate…" className="pl-9" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {["All", ...visaCategories].map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCat(c)}
            className={cn("relative rounded-full border px-3 py-1 text-xs font-medium transition", cat === c ? "border-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            {cat === c ? <motion.span layoutId="visa-cat" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 500, damping: 35 }} /> : null}
            <span className="relative">{c}</span>
          </button>
        ))}
      </div>
      <motion.div layout className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((v) => (
            <motion.div key={v.code} layout initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.2 }}>
              <Link href={`/app/visas/${v.code}`} className="group flex h-full flex-col rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-primary/10 px-2 font-mono text-sm font-semibold text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                    {v.code}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{v.name}</p>
                    <p className="text-xs text-muted-foreground">{v.category}</p>
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{v.summary}</p>
                <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                  <Pill t={v.permanent ? "green" : "blue"}>{v.permanent ? "Permanent" : "Temporary"}</Pill>
                  <Pill>{v.checklist.length} documents</Pill>
                  {v.streams?.length ? <Pill t="violet">{v.streams.length} streams</Pill> : null}
                </div>
              </Link>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
