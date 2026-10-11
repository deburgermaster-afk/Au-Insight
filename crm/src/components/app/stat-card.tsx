import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { NumberTicker } from "./motion";

export function StatCard({
  icon: Icon,
  label,
  value,
  prefix,
  hint,
  href,
  tone = "primary",
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  prefix?: string;
  hint?: string;
  href?: string;
  tone?: "primary" | "emerald" | "amber" | "sky" | "rose";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    sky: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
    rose: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  };
  const body = (
    <div className="group relative h-full overflow-hidden rounded-2xl border bg-card p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
        <span className={`grid size-8 place-items-center rounded-lg transition group-hover:scale-110 ${tones[tone]}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <NumberTicker value={value} prefix={prefix} className="mt-2 block text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl" />
      {hint ? <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
