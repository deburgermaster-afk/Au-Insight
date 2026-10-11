import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { NumberTicker } from "./motion";

const ticks = {
  primary: "var(--chart-1)",
  emerald: "var(--success)",
  amber: "var(--chart-3)",
  sky: "var(--chart-4)",
  rose: "var(--chart-2)",
  violet: "var(--chart-5)",
} as const;

/** A metric tile: icon, small label, large value, and a coloured hint line. */
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
  tone?: keyof typeof ticks;
}) {
  const body = (
    <div className="group relative h-full overflow-hidden rounded-xl border bg-card p-4 transition hover:border-foreground/15">
      <div
        className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full opacity-[0.07] blur-2xl transition group-hover:opacity-20"
        style={{ background: ticks[tone] }}
      />
      <span className="grid size-8 place-items-center rounded-lg border bg-muted/40 text-foreground/80">
        <Icon className="size-4" />
      </span>
      <p className="mt-3 text-[13px] text-muted-foreground">{label}</p>
      <NumberTicker value={value} prefix={prefix} className="mt-0.5 block text-2xl font-semibold tabular-nums tracking-tight sm:text-[1.7rem]" />
      {hint ? (
        <p className="mt-1 truncate text-xs text-muted-foreground">
          <span className="mr-1.5 inline-block size-1.5 rounded-full align-middle" style={{ background: ticks[tone] }} />
          {hint}
        </p>
      ) : null}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

/** A strip of labelled facts with coloured ticks, as on a record's header. */
export function FactStrip({ items }: { items: { label: string; value: React.ReactNode; tone?: keyof typeof ticks }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground/80">{i.label}</dt>
          <dd className="tick mt-1.5 truncate text-sm font-medium" style={{ "--tick": ticks[i.tone ?? "primary"] } as React.CSSProperties}>
            {i.value ?? "—"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
