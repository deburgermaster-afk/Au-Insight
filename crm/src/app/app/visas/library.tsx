"use client";

import { CircleCheck, Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Pill } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { type Visa, visaCategories } from "@/lib/visas";

export function VisaLibrary({ visas }: { visas: Visa[] }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [open, setOpen] = useState<Visa | null>(null);
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
              <button type="button" onClick={() => setOpen(v)} className="group flex h-full w-full flex-col rounded-xl border bg-card p-4 text-left transition hover:border-foreground/20">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 min-w-10 place-items-center rounded-xl bg-muted px-2 font-mono text-sm font-semibold transition group-hover:bg-primary group-hover:text-primary-foreground">
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
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-lg" showCloseButton={false}>
          {open ? (
            <>
              <div className="relative h-36 overflow-hidden" style={{ background: art[open.category] ?? art.Other }}>
                <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_70%_120%,rgba(255,200,140,.45),transparent)]" />
                <span className="absolute bottom-3 left-5 font-mono text-5xl font-semibold tracking-tight text-white/90 drop-shadow">{open.code}</span>
              </div>
              <div className="p-6">
                <DialogTitle className="text-lg">{open.name}</DialogTitle>
                <DialogDescription className="mt-1.5 text-[13px] leading-relaxed">{open.summary}</DialogDescription>
                <p className="mt-5 text-sm font-medium">What's assessed</p>
                <ul className="mt-3 grid max-h-56 gap-3 overflow-y-auto">
                  {open.requirements.slice(0, 5).map((r) => (
                    <li key={r} className="flex gap-2.5 text-[13px]">
                      <CircleCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid grid-cols-2 gap-2">
                  <Button variant="secondary" className="h-10 rounded-full" onClick={() => setOpen(null)}>
                    Close
                  </Button>
                  <Button className="h-10 rounded-full" asChild>
                    <Link href={`/app/visas/${encodeURIComponent(open.code)}`}>Full checklist</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Header art per category: dusk skies in different moods.
const art: Record<string, string> = {
  Skilled: "linear-gradient(160deg,#1e2a44,#5b4a63 55%,#d08a5c)",
  Employer: "linear-gradient(160deg,#1a2c33,#3f6b6a 55%,#e0b06a)",
  Student: "linear-gradient(160deg,#20264a,#5a5296 55%,#e39a7a)",
  Graduate: "linear-gradient(160deg,#241c3a,#7a4a78 55%,#f0a46a)",
  Family: "linear-gradient(160deg,#2a1e2c,#8a4a5a 55%,#f2b48a)",
  Visitor: "linear-gradient(160deg,#16303a,#3a7a8a 55%,#f0d08a)",
  Business: "linear-gradient(160deg,#1c2230,#4a5a7a 55%,#c9a46a)",
  Humanitarian: "linear-gradient(160deg,#1e2a24,#4a7a5a 55%,#e0c08a)",
  Bridging: "linear-gradient(160deg,#22222a,#5a5a6a 55%,#b0a090)",
  Other: "linear-gradient(160deg,#1f1f24,#4a4a58 55%,#a89a8a)",
};
