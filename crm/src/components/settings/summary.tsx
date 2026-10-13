import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type SummaryRow = { label: string; value: ReactNode; missing?: boolean };

/** What's set right now, at a glance, with the action that changes it. */
export function Summary({ title, description, rows, action, status, children, className }: { title: string; description?: string; rows?: SummaryRow[]; action?: ReactNode; status?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card", className)}>
      <header className="flex flex-wrap items-start gap-3 border-b px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {title} {status}
          </p>
          {description ? <p className="text-[12px] text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </header>
      {rows?.length ? (
        <dl className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
          {rows.map((r) => (
            <div key={r.label} className="grid gap-0.5 px-4 py-2.5 sm:border-b">
              <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className={cn("min-w-0 truncate text-[13px]", r.missing && "text-amber-500")}>{r.value ?? "—"}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {children ? <div className="p-4">{children}</div> : null}
    </section>
  );
}

export const Pill = ({ tone = "muted", children }: { tone?: "ok" | "warn" | "bad" | "muted" | "info"; children: ReactNode }) => (
  <span
    className={cn(
      "rounded-full px-2 py-0.5 text-[11px] font-normal",
      tone === "ok" && "bg-emerald-500/12 text-emerald-500",
      tone === "warn" && "bg-amber-500/12 text-amber-500",
      tone === "bad" && "bg-rose-500/12 text-rose-500",
      tone === "info" && "bg-sky-500/12 text-sky-500",
      tone === "muted" && "bg-muted text-muted-foreground",
    )}
  >
    {children}
  </span>
);
