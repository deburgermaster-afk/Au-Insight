import { CheckCircle2, CircleDashed } from "lucide-react";
import { FadeIn, NumberTicker } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { featureCount, features, liveCount } from "@/lib/features";

export const metadata = { title: "Features" };

export default function FeaturesPage() {
  return (
    <>
      <PageHeader title="Features" description="Everything in Lodgely, and what's being built next." />
      <FadeIn className="mb-6 grid grid-cols-3 gap-3">
        {[
          ["Total", featureCount],
          ["Live now", liveCount],
          ["Coming next", featureCount - liveCount],
        ].map(([k, v]) => (
          <div key={k} className="rounded-2xl border bg-card p-4 shadow-xs">
            <p className="text-xs text-muted-foreground">{k}</p>
            <NumberTicker value={v as number} className="mt-1 block text-3xl font-semibold tabular-nums" />
          </div>
        ))}
      </FadeIn>
      <div className="columns-1 gap-4 md:columns-2 xl:columns-3">
        {features.map((g, gi) => (
          <FadeIn key={g.group} delay={Math.min(gi, 6) * 0.04} className="mb-4 break-inside-avoid rounded-2xl border bg-card p-4 shadow-xs">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{g.group}</h2>
              <span className="text-xs text-muted-foreground">
                {g.items.filter((i) => i.status === "live").length}/{g.items.length}
              </span>
            </div>
            <ul className="mt-3 grid gap-2">
              {g.items.map((f) => (
                <li key={f.name} className="flex gap-2 text-sm">
                  {f.status === "live" ? <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
                  <span className={f.status === "live" ? "" : "text-muted-foreground"}>{f.name}</span>
                </li>
              ))}
            </ul>
          </FadeIn>
        ))}
      </div>
    </>
  );
}
