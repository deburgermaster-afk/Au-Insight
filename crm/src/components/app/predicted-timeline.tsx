import { AlertTriangle, CheckCircle2, CircleDot, Circle } from "lucide-react";
import { dmy, daysUntil } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Milestone } from "@/lib/visa-timeline";

const tone = {
  done: { icon: CheckCircle2, cls: "text-[var(--success)]", line: "bg-[var(--success)]/50" },
  current: { icon: CircleDot, cls: "text-[var(--chart-2)]", line: "bg-border" },
  overdue: { icon: AlertTriangle, cls: "text-rose-500", line: "bg-border" },
  upcoming: { icon: Circle, cls: "text-muted-foreground/60", line: "bg-border" },
} as const;

/** The pre-scheduled milestones for a case: actual dates where known, predicted ones otherwise. */
export function PredictedTimeline({ items, processing, source, audience = "agent" }: { items: Milestone[]; processing: string; source?: { asAt: string | null; url: string | null } | null; audience?: "agent" | "client" }) {
  return (
    <div className="grid gap-3">
      <ol className="grid">
        {items.map((m, i) => {
          // Clients see late steps as "current", not as a warning.
          const t = tone[audience === "client" && m.status === "overdue" ? "current" : m.status];
          const d = daysUntil(m.date);
          return (
            <li key={m.key} className="relative flex gap-3 pb-4 last:pb-0">
              {i < items.length - 1 ? <span className={cn("absolute bottom-0 left-[9px] top-5 w-0.5 rounded", t.line)} /> : null}
              <t.icon className={cn("relative z-10 mt-0.5 size-[18px] shrink-0 bg-card", t.cls)} />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-2 text-sm">
                  <span className={cn("font-medium", m.status === "upcoming" && "text-foreground/80")}>{m.label}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                    {m.actual || m.status === "done" ? "" : "≈ "}
                    {dmy(m.date)}
                    {m.until ? ` – ${dmy(m.until)}` : ""}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.detail}
                  {m.status === "current" && !m.actual ? <span className="ml-1 font-medium text-[var(--chart-2)]">{d > 0 ? `In ${d} days.` : d === 0 ? "Due today." : ""}</span> : null}
                  {m.status === "overdue" && audience === "agent" ? <span className="ml-1 font-medium text-rose-500">Behind schedule by {-d} days.</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {audience === "client" ? (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">Estimated dates based on your case and {source ? "the Department of Home Affairs' published processing times" : "typical processing times"} ({processing}). Your agent will keep you updated; the Department decides when.</p>
      ) : source ? (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">
          Predicted from this matter&apos;s dates and Home Affairs&apos; published processing times ({processing}){source.asAt ? `, updated ${dmy(source.asAt)}` : ""}.{" "}
          {source.url ? (
            <a href={source.url} target="_blank" rel="noreferrer" className="underline">
              Source
            </a>
          ) : null}
        </p>
      ) : (
        <p className="border-t pt-2 text-[11px] text-muted-foreground">Predicted from this matter&apos;s dates and indicative processing times ({processing}). Check Home Affairs&apos; global processing times before quoting a date to the client.</p>
      )}
    </div>
  );
}
