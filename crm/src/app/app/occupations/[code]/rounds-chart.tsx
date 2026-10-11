"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import type { RoundRow } from "@/lib/occupations";

const config = { "189": { label: "189", color: "var(--chart-1)" }, "491": { label: "491 Family", color: "var(--chart-2)" } } satisfies ChartConfig;

export function RoundsChart({ rounds }: { rounds: RoundRow[] }) {
  const byDate = new Map<string, Record<string, string | number>>();
  for (const r of [...rounds].reverse()) {
    if (r.min_points == null) continue;
    const d = byDate.get(r.round_date) ?? { date: new Date(r.round_date).toLocaleDateString("en-AU", { month: "short", year: "2-digit" }) };
    d[r.subclass.slice(0, 3)] = r.min_points;
    byDate.set(r.round_date, d);
  }
  const data = [...byDate.values()];
  return (
    <div className="bg-dots rounded-lg">
      <ChartContainer config={config} className="h-[240px] w-full">
        <LineChart data={data} margin={{ left: -12, right: 8, top: 12 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 4" strokeOpacity={0.5} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10.5} tickMargin={8} />
          <YAxis domain={["dataMin - 5", "dataMax + 5"]} tickLine={false} axisLine={false} fontSize={10.5} width={36} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Line dataKey="189" type="monotone" stroke="var(--color-189)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          <Line dataKey="491" type="monotone" stroke="var(--color-491)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ChartContainer>
    </div>
  );
}
