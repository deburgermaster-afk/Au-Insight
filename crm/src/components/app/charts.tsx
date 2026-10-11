"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";

const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const money = (v: number) => (v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${v}`);

/** Bars in quiet grey; the hovered (or largest) bar lights up in the brand gradient. */
export function ColumnChart({ data, x, y, label, money: isMoney, height = 220 }: { data: Record<string, string | number>[]; x: string; y: string; label: string; money?: boolean; height?: number }) {
  const config = { [y]: { label, color: "var(--chart-2)" } } satisfies ChartConfig;
  const max = data.reduce((m, d, i) => (Number(d[y]) > Number(data[m]?.[y] ?? -1) ? i : m), 0);
  const [active, setActive] = useState<number | null>(null);
  const lit = active ?? max;
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
      <BarChart data={data} margin={{ left: -8, right: 4, top: 8 }} onMouseLeave={() => setActive(null)}>
        <defs>
          <linearGradient id="bar-lit" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="oklch(0.74 0.17 45)" />
            <stop offset="55%" stopColor="oklch(0.78 0.13 70)" />
            <stop offset="100%" stopColor="oklch(0.72 0.12 250)" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 4" strokeOpacity={0.5} />
        <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} fontSize={10.5} interval={0} />
        <YAxis tickLine={false} axisLine={false} width={isMoney ? 46 : 26} fontSize={10.5} tickFormatter={(v) => (isMoney ? money(v) : String(v))} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
        <Bar dataKey={y} radius={8} animationDuration={700} onMouseEnter={(_, i) => setActive(i)}>
          {data.map((_, i) => (
            <Cell key={i} fill={i === lit ? "url(#bar-lit)" : "var(--muted)"} className="transition-[fill] duration-300" />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** A filled line over a dotted plot, for money over time. */
export function TrendChart({ data, x, y, label, height = 260 }: { data: Record<string, string | number>[]; x: string; y: string; label: string; height?: number }) {
  const config = { [y]: { label, color: "var(--chart-1)" } } satisfies ChartConfig;
  return (
    <div className="bg-dots rounded-lg">
      <ChartContainer config={config} className="w-full" style={{ height }}>
        <AreaChart data={data} margin={{ left: -4, right: 8, top: 12 }}>
          <defs>
            <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} fontSize={10.5} />
          <YAxis tickLine={false} axisLine={false} width={46} fontSize={10.5} tickFormatter={money} />
          <ChartTooltip cursor={{ stroke: "var(--chart-1)", strokeWidth: 1 }} content={<ChartTooltipContent />} />
          <Area dataKey={y} type="monotone" stroke="var(--chart-1)" strokeWidth={2} fill="url(#trend-fill)" activeDot={{ r: 5, strokeWidth: 3, stroke: "var(--card)" }} animationDuration={900} />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/** One stacked bar showing the split, with a legend above (like a spending breakdown). */
export function SplitBar({ data }: { data: { name: string; value: number }[] }) {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {data.map((d, i) => (
          <div key={d.name} className="min-w-0">
            <p className="flex items-center gap-1.5 text-[13px] capitalize">
              <span className="size-2 rounded-full" style={{ background: palette[i % palette.length] }} /> {d.name}
            </p>
            <p className="pl-3.5 text-xs tabular-nums text-muted-foreground">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </p>
          </div>
        ))}
      </div>
      <div className="flex h-9 overflow-hidden rounded-md">
        {data.map((d, i) => (
          <div key={d.name} className="h-full transition-all duration-700" style={{ width: `${(d.value / total) * 100}%`, background: palette[i % palette.length] }} title={`${d.name}: ${d.value}`} />
        ))}
      </div>
    </div>
  );
}

export function Donut({ data, height = 200 }: { data: { name: string; value: number }[]; height?: number }) {
  const config = Object.fromEntries(data.map((d, i) => [d.name, { label: d.name, color: palette[i % palette.length] }])) satisfies ChartConfig;
  const total = data.reduce((a, d) => a + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <ChartContainer config={config} className="aspect-square w-full max-w-[190px]" style={{ height }}>
        <PieChart>
          <ChartTooltip content={<ChartTooltipContent hideLabel />} />
          <Pie data={data} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="92%" paddingAngle={3} cornerRadius={4} strokeWidth={0} animationDuration={700}>
            {data.map((d, i) => (
              <Cell key={d.name} fill={palette[i % palette.length]} />
            ))}
          </Pie>
        </PieChart>
      </ChartContainer>
      <ul className="grid w-full gap-2 text-[13px]">
        {data.map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: palette[i % palette.length] }} />
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
