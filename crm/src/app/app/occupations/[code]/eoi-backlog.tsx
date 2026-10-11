"use client";

import { Info, Users } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from "recharts";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { Eoi, EoiValue } from "@/lib/occupations";
import { cn } from "@/lib/utils";

const statuses = [
  { key: "SUBMITTED", label: "Submitted", hint: "Complete EOIs waiting for an invitation" },
  { key: "INVITED", label: "Invited", hint: "Holding an invitation that hasn't been used yet" },
  { key: "LODGED", label: "Lodged", hint: "A visa application was lodged from the invitation" },
  { key: "HOLD", label: "On hold", hint: "Suspended by the applicant or SkillSelect" },
  { key: "CLOSED", label: "Closed", hint: "Expired, withdrawn or otherwise closed" },
];

export const subclassName: Record<string, [string, string]> = {
  "189PTS": ["189", "Skilled Independent"],
  "190SAS": ["190", "State/Territory Nominated"],
  "491SNR": ["491", "State/Territory Nominated"],
  "491FSR": ["491", "Family Sponsored"],
};

const asNum = (v: EoiValue | undefined) => (typeof v === "number" ? v : null);
const show = (v: EoiValue | undefined) => (v == null ? "—" : typeof v === "number" ? v.toLocaleString("en-AU") : v);

export function EoiBacklog({ eoi }: { eoi: Eoi }) {
  const [status, setStatus] = useState("SUBMITTED");
  const [mine, setMine] = useState("85");
  const subs = useMemo(() => [...eoi.subclasses].sort((a, b) => Object.keys(subclassName).indexOf(a.subclass) - Object.keys(subclassName).indexOf(b.subclass)), [eoi]);
  const pts = Number(mine) || 0;

  if (!subs.length)
    return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">SkillSelect has no EOI data for this occupation.</p>;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md border px-2 py-1 font-mono text-[11px] text-muted-foreground">EOI data current to {eoi.data_current_to}</span>
        <ToggleGroup type="single" value={status} onValueChange={(v) => v && setStatus(v)} variant="outline" size="sm" className="flex-wrap">
          {statuses.map((s) => (
            <ToggleGroupItem key={s.key} value={s.key} title={s.hint} className="px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
              {s.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <Users className="size-3.5" /> Client's points
          <Input value={mine} onChange={(e) => setMine(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" className="h-8 w-16 text-center tabular-nums" />
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {subs.map((s) => {
          const [code, name] = subclassName[s.subclass] ?? [s.subclass, s.visa_type];
          const rows = s.by_points.filter((r) => Number(r.points) >= 65 && r[status] != null).sort((a, b) => Number(a.points) - Number(b.points));
          const total = s.by_status[status];
          const ahead = s.by_points.filter((r) => Number(r.points) >= pts).reduce(
            (a, r) => {
              const v = r.SUBMITTED;
              if (typeof v === "number") a.n += v;
              else if (v) a.small += 1;
              return a;
            },
            { n: 0, small: 0 },
          );
          const trend = s.by_month.map((m) => ({ month: m.month.slice(0, 2) + "/" + m.month.slice(5), v: asNum(m[status]) }));
          return (
            <div key={s.subclass} className="flex flex-col overflow-hidden rounded-xl border bg-card">
              <div className="border-b bg-muted/30 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Visa subclass {code}</p>
                <p className="text-sm font-medium">{name}</p>
              </div>
              <div className="flex items-end justify-between gap-2 px-4 pt-3">
                <div>
                  <p className="text-[11px] text-muted-foreground">Total {statuses.find((x) => x.key === status)?.label.toLowerCase()}</p>
                  <AnimatePresence mode="wait">
                    <motion.p key={status + String(total)} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="text-2xl font-semibold tabular-nums tracking-tight">
                      {show(total)}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className="h-10 w-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend}>
                      <defs>
                        <linearGradient id={`g-${s.subclass}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="month" hide />
                      <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} labelStyle={{ color: "var(--muted-foreground)" }} formatter={(v) => [v ?? "<20", "EOIs"]} />
                      <Area dataKey="v" type="monotone" stroke="var(--chart-1)" strokeWidth={1.5} fill={`url(#g-${s.subclass})`} connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {status === "SUBMITTED" && pts ? (
                <p className="mx-4 mt-3 rounded-md bg-muted/50 px-2.5 py-1.5 text-[12px]">
                  <span className="font-semibold tabular-nums">{ahead.n.toLocaleString("en-AU")}</span>
                  {ahead.small ? <span className="text-muted-foreground"> + {ahead.small} band{ahead.small > 1 ? "s" : ""} of &lt;20</span> : null}
                  <span className="text-muted-foreground"> submitted at {pts}+ points</span>
                </p>
              ) : null}
              <div className="p-3">
                {rows.length ? (
                  <Table className="text-[13px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="h-8">Points</TableHead>
                        <TableHead className="h-8 text-right">EOI count</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.points} className={cn(pts && Number(r.points) >= pts && status === "SUBMITTED" && "bg-[color-mix(in_oklch,var(--chart-2)_10%,transparent)]")}>
                          <TableCell className="py-1.5 tabular-nums">{r.points}</TableCell>
                          <TableCell className="py-1.5 text-right tabular-nums">{show(r[status])}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="flex items-center gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-300">
                    <Info className="size-3.5" /> No EOI data at 65+ points for this status
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border bg-muted/20 p-4 text-[12.5px] text-muted-foreground">
        <p className="mb-2 font-medium text-foreground">Notes</p>
        <ul className="grid list-disc gap-1 pl-4">
          {eoi.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p className="mt-2">
          Source:{" "}
          <a href={eoi.source_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
            SkillSelect EOI dashboard
          </a>
          , imported monthly into Immi Insight.
        </p>
      </div>
    </div>
  );
}
