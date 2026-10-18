"use client";

import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, Check, Clock, LayoutGrid, Rows3 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";

export type Paper = "paid" | "due" | "overdue" | "doc";
export type FolderItem = { id: string; title: string; sub: string; right?: string; rightSub?: string; state: Paper; href?: string; external?: boolean; badge?: ReactNode };
export type Folder = { key: string; name: string; mark: string; color: string; items: FolderItem[] };

const PAPER = {
  paid: { bg: "bg-white dark:bg-zinc-200", icon: Check, ring: "text-emerald-500" },
  due: { bg: "bg-amber-200 dark:bg-amber-300", icon: Clock, ring: "text-amber-600" },
  overdue: { bg: "bg-rose-300 dark:bg-rose-400", icon: AlertTriangle, ring: "text-rose-600" },
  doc: { bg: "bg-white dark:bg-zinc-200", icon: Check, ring: "text-sky-500" },
} as const;

/** A frosted folder with the top papers peeking out (tinted by status), a sticker and a count. */
function FolderCard({ f, onOpen }: { f: Folder; onOpen: () => void }) {
  const papers = f.items.slice(0, 3);
  return (
    <button type="button" onClick={onOpen} className="group grid justify-items-center gap-2 text-center transition active:scale-[.97]">
      <span className="relative block aspect-[1.15] w-full">
        {/* papers */}
        {papers.map((p, i) => {
          const P = PAPER[p.state];
          return (
            <span
              key={p.id}
              className={cn("absolute top-[2%] h-[46%] w-[36%] rounded-md shadow-sm ring-1 ring-black/5 transition-transform duration-300 group-hover:-translate-y-1", P.bg)}
              style={{ left: `${18 + i * 14}%`, transform: `rotate(${(i - 1) * 7}deg)`, zIndex: i }}
            >
              <P.icon className={cn("absolute top-1.5 left-1.5 size-3.5 rounded-full bg-white/80 p-0.5", P.ring)} strokeWidth={3} />
            </span>
          );
        })}
        {/* folder back tab */}
        <span className="absolute top-[22%] left-0 h-[16%] w-[42%] rounded-t-xl bg-zinc-200/90 backdrop-blur dark:bg-zinc-700/80" style={{ zIndex: 4 }} />
        {/* folder front */}
        <span className="absolute inset-x-0 top-[30%] bottom-0 overflow-hidden rounded-2xl bg-gradient-to-b from-zinc-100/85 to-zinc-200/95 shadow-[0_10px_30px_-12px_rgba(0,0,0,.35)] ring-1 ring-white/60 backdrop-blur-md dark:from-zinc-700/85 dark:to-zinc-800/95 dark:ring-white/10" style={{ zIndex: 5 }}>
          <svg viewBox="0 0 40 16" className="absolute bottom-3 left-3 h-3.5 w-9 text-zinc-400" aria-hidden>
            <path d="M2 12 C6 2, 9 2, 10 9 S14 14, 17 6 S22 3, 24 10 L38 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="absolute right-3 bottom-3 grid size-11 rotate-[-8deg] place-items-center rounded-xl text-[13px] font-bold text-white shadow-md ring-2 ring-white" style={{ background: f.color }}>
            {f.mark}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-1.5 text-[13px] font-medium">
        <span className="max-w-[9rem] truncate">{f.name}</span>
        <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{f.items.length}</span>
      </span>
    </button>
  );
}

/**
 * Items grouped into folders (grid or list), with All / Paid / Unpaid style filter chips. Tapping a
 * folder opens its items.
 */
export function FolderView({ folders, filters, empty }: { folders: Folder[]; filters?: { key: string; label: string; states: Paper[] }[]; empty: string }) {
  const [filter, setFilter] = useState(filters?.[0]?.key ?? "all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [open, setOpen] = useState<string | null>(null);
  const f = filters?.find((x) => x.key === filter);
  const shown = folders.map((x) => ({ ...x, items: f ? x.items.filter((i) => f.states.includes(i.state)) : x.items })).filter((x) => x.items.length);
  const current = shown.find((x) => x.key === open);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1.5">
        {filters?.map((x) => (
          <button key={x.key} type="button" onClick={() => setFilter(x.key)} className={cn("rounded-full px-3.5 py-1.5 text-[13px] font-medium transition", filter === x.key ? "bg-foreground text-background" : "bg-muted text-foreground/80")}>
            {x.label}
          </button>
        ))}
        <div className="ml-auto flex rounded-full bg-muted p-0.5">
          {(["grid", "list"] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-label={v === "grid" ? "Grid" : "List"} className={cn("grid size-8 place-items-center rounded-full transition", view === v && "bg-background shadow-sm")}>
              {v === "grid" ? <LayoutGrid className="size-4" /> : <Rows3 className="size-4" />}
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence mode="wait">
        {current ? (
          <motion.div key={`open-${current.key}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="grid gap-2">
            <button type="button" onClick={() => setOpen(null)} className="flex w-fit items-center gap-1 text-[13px] text-muted-foreground">
              <ArrowLeft className="size-4" /> All folders
            </button>
            <p className="flex items-center gap-2 text-base font-semibold">
              <span className="grid size-7 place-items-center rounded-lg text-[11px] font-bold text-white" style={{ background: current.color }}>
                {current.mark}
              </span>
              {current.name}
            </p>
            <List items={current.items} />
          </motion.div>
        ) : view === "grid" ? (
          <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {shown.map((x) => (
              <FolderCard key={x.key} f={x} onOpen={() => setOpen(x.key)} />
            ))}
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid gap-3">
            {shown.map((x) => (
              <section key={x.key} className="grid gap-1.5">
                <p className="flex items-center gap-1.5 px-0.5 text-xs font-medium text-muted-foreground">
                  <span className="size-2 rounded-full" style={{ background: x.color }} /> {x.name} · {x.items.length}
                </p>
                <List items={x.items} />
              </section>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {!shown.length ? <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">{empty}</p> : null}
    </div>
  );
}

function List({ items }: { items: FolderItem[] }) {
  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
      {items.map((i) => {
        const P = PAPER[i.state];
        const body = (
          <>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg ring-1 ring-black/5", P.bg)}>
              <P.icon className={cn("size-4", P.ring)} strokeWidth={2.5} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 truncate text-[13px] font-medium">
                {i.title}
                {i.badge}
              </span>
              <span className="block truncate text-[11px] text-muted-foreground">{i.sub}</span>
            </span>
            {i.right ? (
              <span className="text-right">
                <span className="block text-[13px] font-medium tabular-nums">{i.right}</span>
                {i.rightSub ? <span className="block text-[10px] text-muted-foreground">{i.rightSub}</span> : null}
              </span>
            ) : null}
          </>
        );
        return (
          <li key={i.id}>
            {i.href ? (
              i.external ? (
                <a href={i.href} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2.5 active:bg-muted/50">
                  {body}
                </a>
              ) : (
                <Link href={i.href} className="flex items-center gap-2.5 px-3 py-2.5 active:bg-muted/50">
                  {body}
                </Link>
              )
            ) : (
              <div className="flex items-center gap-2.5 px-3 py-2.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
