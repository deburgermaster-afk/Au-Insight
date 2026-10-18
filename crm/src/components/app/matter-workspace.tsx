"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type WorkspaceTile = {
  key: string;
  label: string;
  icon: ReactNode;
  /** A short status under the label: "3 files", "$1,200 owing". */
  stat?: string;
  tone?: "default" | "good" | "warn" | "bad";
  /** What the panel shows when the tile is open. */
  content: ReactNode;
  /** An action shown in the open panel's header, e.g. "New invoice". */
  action?: ReactNode;
};

const toneClass = {
  default: "text-muted-foreground",
  good: "text-emerald-500",
  warn: "text-amber-500",
  bad: "text-red-500",
};

/**
 * The matter's control strip: small buttons for everything on the file. A button opens its panel in
 * place, under the strip, so the checklist and timeline stay on screen beside it. The open panel is
 * kept in the URL (?panel=) so a refresh or a shared link reopens it.
 */
export function MatterWorkspace({ tiles, initial, children }: { tiles: WorkspaceTile[]; initial?: string | null; children?: ReactNode }) {
  const [open, setOpen] = useState<string | null>(initial && tiles.some((t) => t.key === initial) ? initial : null);
  const toggle = useCallback((key: string | null) => {
    setOpen(key);
    const url = new URL(window.location.href);
    if (key) url.searchParams.set("panel", key);
    else url.searchParams.delete("panel");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && open && toggle(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, toggle]);
  const tile = tiles.find((t) => t.key === open);
  return (
    <div className="grid content-start gap-4">
      <div className="rounded-xl border bg-card p-2 sm:p-3">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
          {tiles.map((t) => {
            const active = t.key === open;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggle(active ? null : t.key)}
                aria-pressed={active}
                className={cn(
                  "group flex min-w-0 flex-col items-start gap-1 rounded-lg border px-2.5 py-2 text-left transition",
                  active ? "border-primary bg-primary/10" : "border-transparent bg-muted/30 hover:border-border hover:bg-muted/60",
                )}
              >
                <span className={cn("flex items-center gap-1.5 text-xs font-medium", active ? "text-primary" : "text-foreground")}>
                  <span className="[&_svg]:size-3.5">{t.icon}</span>
                  <span className="truncate">{t.label}</span>
                </span>
                <span className={cn("w-full truncate text-[11px] tabular-nums", toneClass[t.tone ?? "default"])}>{t.stat ?? "Open"}</span>
              </button>
            );
          })}
        </div>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        {tile ? (
          <motion.section
            key={tile.key}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="rounded-xl border bg-card"
          >
            <header className="flex items-center gap-2 border-b px-4 py-2.5">
              <span className="text-muted-foreground [&_svg]:size-4">{tile.icon}</span>
              <h2 className="text-sm font-medium">{tile.label}</h2>
              <span className="ml-auto flex items-center gap-2">
                {tile.action}
                <button type="button" onClick={() => toggle(null)} aria-label="Close panel" className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <X className="size-4" />
                </button>
              </span>
            </header>
            <div className="p-4">{tile.content}</div>
          </motion.section>
        ) : null}
      </AnimatePresence>
      {children}
    </div>
  );
}

/** The right-hand column: the document checklist or the timeline, one at a time. */
export function ChecklistTimelineTabs({ checklist, timeline, checklistLabel, timelineLabel }: { checklist: ReactNode; timeline: ReactNode; checklistLabel: string; timelineLabel: string }) {
  return (
    <Tabs defaultValue="checklist" className="gap-3">
      <TabsList className="w-full">
        <TabsTrigger value="checklist" className="flex-1">
          {checklistLabel}
        </TabsTrigger>
        <TabsTrigger value="timeline" className="flex-1">
          {timelineLabel}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="checklist">{checklist}</TabsContent>
      <TabsContent value="timeline">{timeline}</TabsContent>
    </Tabs>
  );
}
