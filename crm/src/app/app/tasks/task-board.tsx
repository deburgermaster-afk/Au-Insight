"use client";

import { EditRecord } from "@/components/edit/edit-record";
import type { EditOptions } from "@/lib/edit-data";

import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { toast } from "sonner";
import { label, Pill, priorityTone } from "@/components/app/badges";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { setTaskStatus } from "@/lib/actions";
import { relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

const halfDayAgo = () => Date.now() - 864e5 / 2;

type T = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueAt: Date | null;
  assignedTo: string | null;
  assignee: string | null;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  matterRef: string | null;
};

const columns = [
  { key: "todo", label: "To do", tone: "bg-zinc-400" },
  { key: "doing", label: "In progress", tone: "bg-primary" },
  { key: "waiting", label: "Waiting on client", tone: "bg-amber-500" },
  { key: "done", label: "Done", tone: "bg-emerald-500" },
];

export function TaskBoard({ tasks, me, options, caps }: { tasks: T[]; me: string; options: EditOptions; caps: string[] }) {
  const [scope, setScope] = useState("all");
  const [list, update] = useOptimistic(tasks, (s, { id, status }: { id: string; status: string }) => s.map((t) => (t.id === id ? { ...t, status } : t)));
  const [, start] = useTransition();
  const shown = useMemo(() => (scope === "mine" ? list.filter((t) => t.assignedTo === me) : list), [list, scope, me]);
  const set = (id: string, status: string) =>
    start(async () => {
      update({ id, status });
      const r = await setTaskStatus(id, status);
      if (!r.ok) toast.error(r.error);
    });
  const overdue = (t: T) => t.status !== "done" && t.dueAt && new Date(t.dueAt).getTime() < halfDayAgo();

  return (
    <div className="grid gap-4">
      <ToggleGroup type="single" value={scope} onValueChange={(v) => v && setScope(v)} variant="outline" size="sm" className="justify-self-start">
        <ToggleGroupItem value="all">Everyone</ToggleGroupItem>
        <ToggleGroupItem value="mine">Mine</ToggleGroupItem>
      </ToggleGroup>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((c) => {
          const col = shown.filter((t) => t.status === c.key);
          return (
            <div key={c.key} className="rounded-2xl bg-muted/50 p-2">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <span className={`size-2 rounded-full ${c.tone}`} />
                <span className="text-sm font-medium">{c.label}</span>
                <span className="ml-auto rounded-full bg-background px-2 text-xs tabular-nums text-muted-foreground">{col.length}</span>
              </div>
              <div className="grid gap-2">
                {col.map((t) => (
                  <motion.div key={t.id} layoutId={`t-${t.id}`} transition={{ type: "spring", stiffness: 500, damping: 40 }} className="rounded-xl border bg-card p-3 shadow-xs">
                    <div className="flex items-start gap-2.5">
                      <Checkbox className="mt-0.5" checked={t.status === "done"} onCheckedChange={(v) => set(t.id, v === true ? "done" : "todo")} />
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm font-medium", t.status === "done" && "text-muted-foreground line-through")}>{t.title}</p>
                        {t.description ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{t.description}</p> : null}
                        {t.clientName ? (
                          <Link href={t.matterId ? `/app/matters/${t.matterId}` : `/app/clients/${t.clientId}`} className="mt-1 block truncate text-xs text-primary hover:underline">
                            {t.clientName}
                            {t.matterRef ? ` · ${t.matterRef}` : ""}
                          </Link>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5 pl-6">
                      <Pill t={overdue(t) ? "red" : priorityTone[t.priority]} className="h-5 px-1.5 text-[10px]">
                        {t.dueAt ? relativeDays(t.dueAt) : label(t.priority)}
                      </Pill>
                      <span className="truncate text-[11px] text-muted-foreground">{t.assignee}</span>
                      <EditRecord entity="task" id={t.id} values={{ title: t.title, description: t.description, dueAt: t.dueAt ? new Date(t.dueAt).toISOString().slice(0, 10) : null, priority: t.priority, status: t.status, assignedTo: t.assignedTo }} options={options} caps={caps} canDelete />
                      <DropdownMenu>
                        <DropdownMenuTrigger className="ml-auto rounded px-1.5 text-[11px] text-muted-foreground hover:bg-muted">Move</DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {columns
                            .filter((x) => x.key !== t.status)
                            .map((x) => (
                              <DropdownMenuItem key={x.key} onSelect={() => set(t.id, x.key)}>
                                <span className={`size-2 rounded-full ${x.tone}`} /> {x.label}
                              </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </motion.div>
                ))}
                {!col.length ? <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here</p> : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
