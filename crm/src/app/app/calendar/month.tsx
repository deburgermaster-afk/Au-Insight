"use client";

import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type A = { id: string; title: string; kind: string; startsAt: Date; endsAt: Date; location: string | null; clientName: string | null; staff: string | null };

const kindTone: Record<string, string> = {
  consultation: "bg-primary/15 text-primary",
  "follow-up": "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "document check": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  interview: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  lodgement: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

const noop = () => () => {};

// The grid depends on "today" in the viewer's time zone, so it renders in the browser only.
export function MonthCalendar({ items }: { items: A[] }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <Skeleton className="h-[32rem] rounded-2xl" />;
  return <Month items={items} />;
}

function Month({ items }: { items: A[] }) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [dir, setDir] = useState(0);
  const [picked, setPicked] = useState<Date>(() => new Date());
  const days = useMemo(() => eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) }), [month]);
  const on = (d: Date) => items.filter((a) => isSameDay(new Date(a.startsAt), d));
  const go = (n: number) => {
    setDir(n);
    setMonth((m) => addMonths(m, n));
  };
  const today = new Date();
  const dayItems = on(picked);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h2 className="text-lg font-semibold">{format(month, "MMMM yyyy")}</h2>
          <div className="ml-auto flex gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => go(-1)} aria-label="Previous month">
              <ChevronLeft />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setPicked(new Date());
              }}
            >
              Today
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => go(1)} aria-label="Next month">
              <ChevronRight />
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <div key={d} className="py-2">
              {d}
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={month.toISOString()}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.2 }}
            className="grid grid-cols-7"
          >
            {days.map((d) => {
              const list = on(d);
              return (
                <button
                  key={d.toISOString()}
                  type="button"
                  onClick={() => setPicked(d)}
                  className={cn(
                    "flex min-h-16 flex-col gap-1 border-b border-r p-1.5 text-left transition hover:bg-muted/50 sm:min-h-24",
                    !isSameMonth(d, month) && "bg-muted/20 text-muted-foreground/60",
                    isSameDay(d, picked) && "bg-primary/5 ring-2 ring-inset ring-primary/40",
                  )}
                >
                  <span className={cn("grid size-6 place-items-center rounded-full text-xs tabular-nums", isSameDay(d, today) && "bg-primary font-semibold text-primary-foreground")}>{format(d, "d")}</span>
                  <span className="hidden gap-1 sm:grid">
                    {list.slice(0, 2).map((a) => (
                      <span key={a.id} className={cn("truncate rounded px-1.5 py-0.5 text-[11px] font-medium", kindTone[a.kind] ?? kindTone.consultation)}>
                        {format(new Date(a.startsAt), "h:mmaaa")} {a.clientName ?? a.title}
                      </span>
                    ))}
                    {list.length > 2 ? <span className="text-[10px] text-muted-foreground">+{list.length - 2} more</span> : null}
                  </span>
                  {list.length ? (
                    <span className="flex gap-0.5 sm:hidden">
                      {list.slice(0, 3).map((a) => (
                        <span key={a.id} className="size-1.5 rounded-full bg-primary" />
                      ))}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="rounded-2xl border bg-card p-4 shadow-xs">
        <p className="text-sm font-semibold">{format(picked, "EEEE d MMMM")}</p>
        <div className="mt-3 grid gap-2">
          <AnimatePresence mode="popLayout">
            {dayItems.length ? (
              dayItems.map((a, i) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }} exit={{ opacity: 0 }} className="rounded-xl border p-3">
                  <div className="flex items-center gap-2">
                    <span className={cn("rounded px-1.5 py-0.5 text-[11px] font-medium capitalize", kindTone[a.kind] ?? kindTone.consultation)}>{a.kind}</span>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                      {format(new Date(a.startsAt), "h:mm a")} – {format(new Date(a.endsAt), "h:mm a")}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {[a.clientName, a.staff ? `with ${a.staff}` : null].filter(Boolean).join(" · ")}
                  </p>
                  {a.location ? (
                    <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="size-3" /> {a.location}
                    </p>
                  ) : null}
                </motion.div>
              ))
            ) : (
              <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center text-sm text-muted-foreground">
                Nothing booked.
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
