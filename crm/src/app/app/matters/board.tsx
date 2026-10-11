"use client";

import { Kanban, List, MoreHorizontal } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { label, matterStageTone, Pill, priorityTone } from "@/components/app/badges";
import { ProgressBar } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { moveMatter } from "@/lib/actions";
import { dmy } from "@/lib/format";
import { cn } from "@/lib/utils";
import { stages } from "@/lib/visas";

type M = {
  id: string;
  reference: string;
  title: string;
  visaCode: string;
  stream: string | null;
  stage: string;
  priority: string;
  clientName: string;
  assigneeName: string | null;
  checklistTotal: number;
  checklistDone: number;
  dueAt: string | null;
  lodgedAt: string | null;
};

const dot: Record<string, string> = {
  enquiry: "bg-zinc-400",
  consultation: "bg-sky-500",
  engaged: "bg-primary",
  documents: "bg-amber-500",
  ready: "bg-fuchsia-500",
  lodged: "bg-sky-600",
  rfi: "bg-rose-500",
  decision: "bg-violet-500",
  closed: "bg-emerald-500",
};

export function MattersBoard({ matters }: { matters: M[] }) {
  const [view, setView] = useState("board");
  const [q, setQ] = useState("");
  const [items, move] = useOptimistic(matters, (state, { id, stage }: { id: string; stage: string }) => state.map((m) => (m.id === id ? { ...m, stage } : m)));
  const [, start] = useTransition();
  const [over, setOver] = useState<string | null>(null);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? items.filter((m) => [m.title, m.clientName, m.reference, m.visaCode].some((v) => v.toLowerCase().includes(t))) : items;
  }, [items, q]);

  const moveTo = (id: string, stage: string) =>
    start(async () => {
      move({ id, stage });
      const r = await moveMatter(id, stage);
      if (!r.ok) toast.error(r.error);
      else toast.success(`Moved to ${stages.find((s) => s.key === stage)?.label}`);
    });

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by client, visa, reference…" className="max-w-xs" />
        <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v)} variant="outline" size="sm" className="ml-auto">
          <ToggleGroupItem value="board" aria-label="Board">
            <Kanban />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List">
            <List />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {view === "board" ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex w-max gap-3">
            {stages.map((s) => {
              const col = shown.filter((m) => m.stage === s.key);
              return (
                <div
                  key={s.key}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setOver(s.key);
                  }}
                  onDragLeave={() => setOver((o) => (o === s.key ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setOver(null);
                    const id = e.dataTransfer.getData("text/matter");
                    const m = items.find((x) => x.id === id);
                    if (m && m.stage !== s.key) moveTo(id, s.key);
                  }}
                  className={cn("flex w-[17rem] shrink-0 flex-col rounded-2xl bg-muted/50 p-2 transition", over === s.key && "bg-primary/10 ring-2 ring-primary/40")}
                >
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <span className={`size-2 rounded-full ${dot[s.key]}`} />
                    <span className="text-sm font-medium">{s.label}</span>
                    <span className="ml-auto rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{col.length}</span>
                  </div>
                  <div className="grid min-h-24 content-start gap-2">
                    {col.map((m) => (
                      <motion.div
                        key={m.id}
                        layoutId={m.id}
                        transition={{ type: "spring", stiffness: 500, damping: 40 }}
                        draggable
                        onDragStartCapture={(e: React.DragEvent) => e.dataTransfer.setData("text/matter", m.id)}
                        className="group cursor-grab rounded-xl border bg-card p-3 shadow-xs transition hover:shadow-md active:cursor-grabbing"
                      >
                        <div className="flex items-start gap-2">
                          <Link href={`/app/matters/${m.id}`} className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{m.clientName}</p>
                            <p className="truncate text-xs text-muted-foreground">{m.title}</p>
                          </Link>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-xs" className="opacity-60 group-hover:opacity-100" aria-label="Move">
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Move to</DropdownMenuLabel>
                              {stages
                                .filter((x) => x.key !== m.stage)
                                .map((x) => (
                                  <DropdownMenuItem key={x.key} onSelect={() => moveTo(m.id, x.key)}>
                                    <span className={`size-2 rounded-full ${dot[x.key]}`} /> {x.label}
                                  </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                        {m.checklistTotal ? (
                          <div className="mt-3 flex items-center gap-2">
                            <ProgressBar value={m.checklistDone / m.checklistTotal} />
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {m.checklistDone}/{m.checklistTotal}
                            </span>
                          </div>
                        ) : null}
                        <div className="mt-2.5 flex items-center gap-1.5">
                          <span className="font-mono text-[10px] text-muted-foreground">{m.reference}</span>
                          {m.priority !== "normal" ? (
                            <Pill t={priorityTone[m.priority]} className="ml-auto h-5 px-1.5 text-[10px]">
                              {label(m.priority)}
                            </Pill>
                          ) : null}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <ul>
            {shown.map((m, i) => (
              <motion.li key={m.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 15) * 0.015 } }} className="border-b last:border-0">
                <Link href={`/app/matters/${m.id}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 transition hover:bg-muted/50 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_8rem_10rem_8rem]">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{m.clientName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{m.reference}</span> · {m.title}
                    </p>
                  </div>
                  <Pill t={matterStageTone[m.stage]} className="justify-self-end md:justify-self-start">
                    {stages.find((s) => s.key === m.stage)?.label}
                  </Pill>
                  <span className="hidden text-sm text-muted-foreground md:block">{m.assigneeName ?? "—"}</span>
                  <div className="hidden items-center gap-2 md:flex">
                    <ProgressBar value={m.checklistTotal ? m.checklistDone / m.checklistTotal : 0} />
                    <span className="text-xs tabular-nums text-muted-foreground">{m.checklistTotal ? Math.round((m.checklistDone / m.checklistTotal) * 100) : 0}%</span>
                  </div>
                  <span className="hidden text-right text-xs text-muted-foreground md:block">{m.lodgedAt ? `Lodged ${dmy(m.lodgedAt)}` : m.dueAt ? `Due ${dmy(m.dueAt)}` : ""}</span>
                </Link>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
