"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function ColumnChart({ data, x, y, label, money, height = 220 }: { data: Record<string, string | number>[]; x: string; y: string; label: string; money?: boolean; height?: number }) {
  const config = { [y]: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: -8, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} fontSize={10} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={money ? 52 : 28} fontSize={11} tickFormatter={(v) => (money ? `$${Math.round(v / 1000)}k` : String(v))} />
        <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.5 }} content={<ChartTooltipContent />} />
        <Bar dataKey={y} radius={[6, 6, 2, 2]} fill={`var(--color-${y})`} animationDuration={700} />
      </BarChart>
    </ChartContainer>
  );
}

export function Donut({ data, height = 220 }: { data: { name: string; value: number }[]; height?: number }) {
  const config = Object.fromEntries(data.map((d, i) => [d.name, { label: d.name, color: palette[i % palette.length] }])) satisfies ChartConfig;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ChartContainer config={config} className="aspect-square w-full max-w-[200px]" style={{ height }}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="90%" paddingAngle={2} strokeWidth={0} animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={palette[i % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid w-full gap-1.5 text-sm">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: palette[i % palette.length] }} />
            <span className="truncate capitalize">{d.name}</span>
            <span className="ml-auto tabular-nums text-muted-foreground">
              {d.value} · {total ? Math.round((d.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
