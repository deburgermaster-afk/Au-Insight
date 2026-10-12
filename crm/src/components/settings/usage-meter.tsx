import type { MailUsage } from "@/db/crm-schema";
import { cn } from "@/lib/utils";

const pct = (p: { used: number; limit: number | null }) => (p.limit ? Math.min(100, Math.round((p.used / p.limit) * 100)) : 0);
const tone = (n: number) => (n >= 100 ? "bg-rose-500" : n >= 80 ? "bg-amber-500" : "bg-emerald-500");

export function usageTone(u: MailUsage) {
  const worst = Math.max(pct(u.daily), pct(u.monthly));
  return worst >= 100 ? "text-rose-500" : worst >= 80 ? "text-amber-500" : "text-muted-foreground";
}

/** One line per period: "34 of 100 today", with a coloured bar. */
export function UsageBars({ usage, compact }: { usage: MailUsage; compact?: boolean }) {
  return (
    <div className={cn("grid gap-3", compact ? "gap-2" : "sm:grid-cols-2")}>
      {(["daily", "monthly"] as const).map((k) => {
        const p = usage[k];
        const n = pct(p);
        return (
          <div key={k} className={cn("grid gap-1.5", !compact && "rounded-xl border bg-card p-4")}>
            <div className="flex items-baseline justify-between gap-2">
              <span className={cn("text-muted-foreground", compact ? "text-[11px]" : "text-[13px]")}>{k === "daily" ? "Today" : "This month"}</span>
              <span className={cn("tabular-nums", compact ? "text-[11px]" : "text-sm font-medium")}>
                {p.used.toLocaleString()} <span className="text-muted-foreground">/ {p.limit ? p.limit.toLocaleString() : "no cap"}</span>
              </span>
            </div>
            <div className={cn("overflow-hidden rounded-full bg-muted", compact ? "h-1" : "h-2")}>
              <div className={cn("h-full rounded-full transition-all", p.limit ? tone(n) : "bg-emerald-500/40")} style={{ width: `${p.limit ? Math.max(n, p.used ? 2 : 0) : 100}%` }} />
            </div>
            {!compact && p.resetsAt ? (
              <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                {n >= 100 ? "Limit reached. " : n >= 80 ? "Getting close. " : ""}Resets {new Date(p.resetsAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short", timeZone: "Australia/Sydney" })} Sydney time
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
