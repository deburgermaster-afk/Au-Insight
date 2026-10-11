import { Check, MinusCircle, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PlanButton } from "./plan-button";
import { compare, plans } from "@/lib/plans";
import { cn } from "@/lib/utils";

const marks = ["bg-amber-300/90", "bg-gradient-to-br from-orange-400 to-violet-500", "bg-gradient-to-br from-slate-300 to-slate-600", "bg-gradient-to-br from-emerald-300 to-emerald-600"];

export function PlanCards({ current = "solo", cta = "Upgrade plan", href }: { current?: string; cta?: string; href?: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {plans.map((p, i) => (
        <div key={p.key} className={cn("flex flex-col rounded-2xl border bg-card p-5", p.highlight && "ring-gradient border-transparent shadow-[0_0_40px_-12px_oklch(0.7_0.2_20/.45)]")}>
          <div className="flex items-start justify-between">
            <span className={cn("size-5 rounded-md", marks[i])} />
            {p.badge ? <span className="rounded-md border bg-muted/50 px-2 py-0.5 text-[11px]">{p.badge}</span> : null}
          </div>
          <p className="mt-3 text-sm font-semibold">{p.name}</p>
          <p className="text-[13px] text-muted-foreground">{p.blurb}</p>
          <p className="mt-6 flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight">{p.price}</span>
            <span className="text-xs text-muted-foreground">{p.unit}</span>
          </p>
          {p.key === current ? (
            <Button variant="secondary" className="mt-5 w-full" disabled>
              Current plan
            </Button>
          ) : href ? (
            <Button className="mt-5 w-full" asChild>
              <Link href={href}>{cta}</Link>
            </Button>
          ) : (
            <PlanButton label={cta} />
          )}
          <ul className="mt-5 grid gap-2.5 text-[13px]">
            {p.perks.map((k) => (
              <li key={k} className="flex items-center gap-2">
                <Check className="size-3.5 text-emerald-500" />
                <span className="underline decoration-muted-foreground/40 decoration-dashed underline-offset-4">{k}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function CompareTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="text-left">
            <th className="py-3 pr-4 font-medium">Feature</th>
            {plans.map((p) => (
              <th key={p.key} className="px-3 py-3 font-medium">
                {p.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {compare.map((row) => (
            <tr key={row.feature} className="border-t">
              <td className="py-3 pr-4 text-muted-foreground">{row.feature}</td>
              {row.values.map((v, i) => (
                <td key={i} className="px-3 py-3">
                  {v === false ? (
                    <MinusCircle className="size-4 text-muted-foreground/60" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-500" />
                      {v === true ? "Yes" : v}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
