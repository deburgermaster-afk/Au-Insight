"use client";

import { ArrowUpRight, Search, SearchX } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { OccupationSummary } from "@/lib/occupations";
import { ListBadge } from "./badges";

const lists = ["MLTSSL", "STSOL", "ROL", "CSOL"];

export function OccupationSearch({ rows }: { rows: OccupationSummary[] }) {
  const [q, setQ] = useState("");
  const [list, setList] = useState<string[]>([]);
  const dq = useDeferredValue(q.trim().toLowerCase());
  const shown = useMemo(
    () =>
      rows
        .filter((r) => (!dq || r.anzsco.startsWith(dq) || r.title.toLowerCase().includes(dq)) && list.every((l) => r.lists?.includes(l)))
        .slice(0, 200),
    [rows, dq, list],
  );
  return (
    <div className="grid gap-4">
      <div className="rounded-xl border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type an ANZSCO code or occupation, e.g. 271311 or solicitor"
            className="h-11 rounded-lg pl-10 text-[15px]"
          />
          <Kbd className="absolute right-3 top-1/2 hidden -translate-y-1/2 sm:inline-flex">{shown.length}</Kbd>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">On list</span>
          <ToggleGroup type="multiple" value={list} onValueChange={setList} variant="outline" size="sm">
            {lists.map((l) => (
              <ToggleGroupItem key={l} value={l} className="px-3 text-xs">
                {l}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {shown.length ? (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead className="w-24">ANZSCO</TableHead>
                <TableHead>Occupation</TableHead>
                <TableHead className="hidden md:table-cell">Lists</TableHead>
                <TableHead className="hidden lg:table-cell">Visas</TableHead>
                <TableHead className="hidden xl:table-cell">Assessing authority</TableHead>
                <TableHead className="w-8" />
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence initial={false}>
                {shown.map((r, i) => (
                  <motion.tr
                    key={r.anzsco}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { delay: Math.min(i, 15) * 0.012 } }}
                    exit={{ opacity: 0 }}
                    className="group relative border-b transition-colors last:border-0 hover:bg-muted/40"
                  >
                    <TableCell className="font-mono text-[13px]">
                      <Link href={`/app/occupations/${r.anzsco}`} className="after:absolute after:inset-0">
                        {r.anzsco}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-[18rem] truncate font-medium">{r.title}</TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex gap-1">{r.lists?.map((l) => <ListBadge key={l} list={l} />)}</div>
                    </TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate text-[13px] text-muted-foreground lg:table-cell">{r.visa_subclasses?.join(" · ")}</TableCell>
                    <TableCell className="hidden max-w-[16rem] truncate text-[13px] text-muted-foreground xl:table-cell">{r.authorities?.join(", ")}</TableCell>
                    <TableCell>
                      <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
                    </TableCell>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>
      ) : (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX />
            </EmptyMedia>
            <EmptyTitle>No occupation matches</EmptyTitle>
            <EmptyDescription>Try part of the title, or the 6-digit ANZSCO code.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
