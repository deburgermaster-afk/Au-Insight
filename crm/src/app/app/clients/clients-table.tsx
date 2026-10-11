"use client";

import { Search, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import { clientStageTone, ExpiryPill, label, Pill } from "@/components/app/badges";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { daysUntil, dmy } from "@/lib/format";

type Row = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  passportNumber: string | null;
  currentVisa: string | null;
  visaExpiry: string | null;
  occupation: string | null;
  stage: string;
  onshore: boolean;
  matterCount: number;
  assigneeName: string | null;
};

const stageKeys = ["all", "lead", "prospect", "active", "on_hold", "past", "lost"];

export function ClientsTable({ rows }: { rows: Row[] }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("all");
  const dq = useDeferredValue(q.trim().toLowerCase());
  const counts = useMemo(() => Object.fromEntries(stageKeys.map((k) => [k, k === "all" ? rows.length : rows.filter((r) => r.stage === k).length])), [rows]);
  const shown = useMemo(
    () =>
      rows.filter(
        (r) =>
          (stage === "all" || r.stage === stage) &&
          (!dq || [r.firstName, r.lastName, r.email, r.passportNumber, r.occupation, r.nationality, r.currentVisa].some((v) => v?.toLowerCase().includes(dq))),
      ),
    [rows, stage, dq],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, passport, occupation…" className="pl-9" />
        </div>
        <Tabs value={stage} onValueChange={setStage} className="min-w-0">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            {stageKeys.map((k) => (
              <TabsTrigger key={k} value={k} className="gap-1.5">
                {k === "all" ? "All" : label(k)}
                <span className="text-[10px] tabular-nums text-muted-foreground">{counts[k]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {shown.length === 0 ? (
        <Empty className="rounded-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>No clients match</EmptyTitle>
            <EmptyDescription>Try another search or stage.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <span>Client</span>
            <span>Stage</span>
            <span>Current visa</span>
            <span>Expiry</span>
            <span>Case officer</span>
            <span className="text-right">Matters</span>
          </div>
          <ul>
            <AnimatePresence initial={false}>
              {shown.map((r, i) => (
                <motion.li
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { delay: Math.min(i, 12) * 0.02 } }}
                  exit={{ opacity: 0 }}
                  className="border-b last:border-0"
                >
                  <Link
                    href={`/app/clients/${r.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 px-4 py-3 transition hover:bg-muted/50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem]"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Avatar className="size-9">
                        <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(`${r.firstName} ${r.lastName}`)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {r.firstName} {r.lastName}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {[r.occupation, r.nationality, r.onshore ? "Onshore" : "Offshore"].filter(Boolean).join(" · ")}
                        </p>
                      </div>
                    </div>
                    <div className="justify-self-end md:justify-self-start">
                      <Pill t={clientStageTone[r.stage]}>{label(r.stage)}</Pill>
                    </div>
                    <span className="hidden truncate text-sm md:block">{r.currentVisa ? `Subclass ${r.currentVisa}` : "—"}</span>
                    <div className="col-span-2 flex items-center gap-2 pl-12 md:col-span-1 md:pl-0">
                      <ExpiryPill days={r.visaExpiry ? daysUntil(r.visaExpiry) : null} />
                      <span className="text-xs text-muted-foreground md:hidden">
                        {r.currentVisa ? `${r.currentVisa} · ` : ""}
                        {dmy(r.visaExpiry)}
                      </span>
                    </div>
                    <span className="hidden truncate text-sm text-muted-foreground md:block">{r.assigneeName ?? "—"}</span>
                    <span className="hidden text-right text-sm tabular-nums md:block">{r.matterCount}</span>
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Showing {shown.length} of {rows.length} clients
      </p>
    </div>
  );
}
