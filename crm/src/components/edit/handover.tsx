"use client";

import { AlertTriangle, ArrowLeftRight, CalendarClock, CheckCircle2, ChevronDown, Loader2, RotateCcw, Search, UserRoundCog } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PreviewItem, Scope } from "@/lib/handover";
import { endCover, previewHandover, runHandover } from "@/lib/handover-actions";
import { cn } from "@/lib/utils";

type Person = { id: string; name: string; registered: boolean };
type Mode = "permanent" | "cover" | "swap";

const SCOPES: { key: Scope; label: string }[] = [
  { key: "matters", label: "Cases they run" },
  { key: "supervision", label: "Cases they supervise" },
  { key: "clients", label: "Clients they look after" },
  { key: "tasks", label: "Open tasks" },
  { key: "appointments", label: "Upcoming appointments" },
  { key: "applications", label: "Student applications" },
];

const MODES: { key: Mode; label: string; about: string; icon: typeof UserRoundCog }[] = [
  { key: "permanent", label: "Hand over", about: "Someone's leaving or changing role: their work moves for good.", icon: UserRoundCog },
  { key: "cover", label: "Cover while away", about: "Leave or travel: work moves now and comes back automatically on the return date.", icon: CalendarClock },
  { key: "swap", label: "Swap", about: "Two people exchange their caseloads in one step.", icon: ArrowLeftRight },
];

const sel = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";
const key = (i: { id: string; field: string }) => `${i.id}:${i.field}`;

/** Plan a handover: pick the person, the kind, what moves, and override any item before it happens. */
export function HandoverPlanner({ people, initialFrom }: { people: Person[]; initialFrom: string | null }) {
  const [mode, setMode] = useState<Mode>("cover");
  const [from, setFrom] = useState(initialFrom ?? "");
  const [to, setTo] = useState("");
  const [scopes, setScopes] = useState<Scope[]>(["matters", "supervision", "clients", "tasks", "appointments", "applications"]);
  const [returnOn, setReturnOn] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [items, setItems] = useState<PreviewItem[] | null>(null);
  const [swap, setSwap] = useState<PreviewItem[]>([]);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});
  const [filter, setFilter] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "—";
  const reset = () => (setItems(null), setSwap([]), setOverrides({}));

  const preview = () =>
    start(async () => {
      if (!from) return void toast.error("Choose whose work is moving.");
      const r = await previewHandover(from, scopes, mode === "swap" ? to || null : null);
      if (!r.ok) return void toast.error(r.error);
      setItems(r.items);
      setSwap(r.swap);
      setOverrides({});
    });

  const targetOf = (it: PreviewItem) => (key(it) in overrides ? overrides[key(it)] : to || null);
  const regSup = (matterId: string) => {
    const sup = (items ?? []).find((x) => x.id === matterId && x.field === "supervisorId");
    return Boolean(sup && people.find((p) => p.id === targetOf(sup))?.registered);
  };
  const problem = (it: PreviewItem) => {
    const t = people.find((p) => p.id === targetOf(it));
    if (!t) return null;
    if (it.field === "supervisorId" && !t.registered) return `${t.name} can't supervise without a current MARN`;
    if (it.entity === "matter" && it.field === "assignedTo" && !t.registered && !it.hasRegisteredSupervisor && !regSup(it.id) && it.stage !== "enquiry") return `${t.name} isn't a registered agent and the case has no registered supervisor: pick a registered agent for it`;
    return null;
  };
  const shown = useMemo(() => (items ?? []).filter((i) => !filter || `${i.label} ${i.detail}`.toLowerCase().includes(filter.toLowerCase())), [items, filter]);
  const moving = (items ?? []).filter((i) => targetOf(i) && targetOf(i) !== from && !problem(i)).length;
  const blocked = (items ?? []).filter((i) => problem(i)).length;

  const run = () =>
    start(async () => {
      const r = await runHandover({ mode, from, to: to || null, scopes, overrides, returnOn: mode === "cover" ? returnOn : null, reason, note });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${r.moved} item${r.moved === 1 ? "" : "s"} moved${r.skipped?.length ? `, ${r.skipped.length} left in place` : ""}`);
      reset();
      setNote("");
      setReason("");
      router.refresh();
    });

  return (
    <section className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
      <div className="grid gap-2 sm:grid-cols-3">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => (setMode(m.key), reset())}
            className={cn("grid gap-1 rounded-xl border p-3 text-left transition", mode === m.key ? "border-primary bg-primary/5" : "hover:bg-muted/40")}
          >
            <span className="flex items-center gap-2 text-sm font-medium">
              <m.icon className="size-4" /> {m.label}
            </span>
            <span className="text-[12px] text-muted-foreground">{m.about}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label>{mode === "swap" ? "Person A" : "Whose work"}</Label>
          <select value={from} onChange={(e) => (setFrom(e.target.value), reset())} className={sel}>
            <option value="">Choose…</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label>{mode === "swap" ? "Person B" : mode === "cover" ? "Covered by" : "Goes to"}</Label>
          <select value={to} onChange={(e) => (setTo(e.target.value), mode === "swap" ? reset() : null)} className={sel}>
            <option value="">{mode === "swap" ? "Choose…" : "Choose per item below"}</option>
            {people
              .filter((p) => p.id !== from)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.registered ? " · registered agent" : ""}
                </option>
              ))}
          </select>
        </div>
        {mode === "cover" ? (
          <div className="grid gap-1.5">
            <Label>Back on</Label>
            <Input type="date" value={returnOn} onChange={(e) => setReturnOn(e.target.value)} />
          </div>
        ) : (
          <div className="grid gap-1.5">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={mode === "swap" ? "Balancing caseloads" : "Leaving the agency"} />
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {SCOPES.map((x) => (
          <label key={x.key} className="flex items-center gap-2 text-[13px]">
            <Checkbox checked={scopes.includes(x.key)} onCheckedChange={(c) => (setScopes((s) => (c === true ? [...s, x.key] : s.filter((y) => y !== x.key))), reset())} /> {x.label}
          </label>
        ))}
      </div>
      <div className="flex justify-end">
        <Button variant="outline" className="rounded-full" onClick={preview} disabled={pending || !from || (mode === "swap" && !to)}>
          {pending && !items ? <Loader2 className="animate-spin" /> : <Search />} Show what moves
        </Button>
      </div>

      {items ? (
        <div className="grid gap-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {name(from)} has {items.length} item{items.length === 1 ? "" : "s"}
              {mode === "swap" ? ` · ${name(to)} has ${swap.length}` : ""}
            </p>
            <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter" className="ml-auto h-8 w-48" />
          </div>
          {SCOPES.filter((x) => shown.some((i) => i.scope === x.key)).map((x) => (
            <details key={x.key} open className="rounded-xl border">
              <summary className="flex cursor-pointer items-center gap-2 bg-muted/40 px-3 py-2 text-[13px] font-medium">
                <ChevronDown className="size-4" /> {x.label} <span className="text-muted-foreground">({shown.filter((i) => i.scope === x.key).length})</span>
              </summary>
              <ul>
                {shown
                  .filter((i) => i.scope === x.key)
                  .map((i) => {
                    const p = problem(i);
                    return (
                      <li key={key(i)} className="grid items-center gap-2 border-t px-3 py-2 text-[13px] sm:grid-cols-[1fr_220px]">
                        <div className="min-w-0">
                          <p className="truncate">{i.label}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {i.detail}
                            {i.lodged ? " · lodged" : ""}
                          </p>
                          {p ? (
                            <p className="flex items-center gap-1 text-[11px] text-amber-500">
                              <AlertTriangle className="size-3" /> {p}: stays with {name(from)}
                            </p>
                          ) : null}
                        </div>
                        {mode === "swap" ? (
                          <span className="text-[12px] text-muted-foreground">→ {name(to)}</span>
                        ) : (
                          <select value={targetOf(i) ?? ""} onChange={(e) => setOverrides((o) => ({ ...o, [key(i)]: e.target.value || null }))} className="h-8 rounded-md border bg-transparent px-2 text-[12px]">
                            <option value="">Keep with {name(from)}</option>
                            {people
                              .filter((q) => q.id !== from && (i.field !== "supervisorId" || q.registered))
                              .map((q) => (
                                <option key={q.id} value={q.id}>
                                  {q.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </details>
          ))}
          {mode === "swap" && swap.length ? <p className="text-[12px] text-muted-foreground">And {swap.length} of {name(to)}&apos;s items go to {name(from)}.</p> : null}
          {!items.length && !swap.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing open in those areas.</p> : null}
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Handover note for the people receiving the work (added to each case's timeline and their email)" />
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12px] text-muted-foreground">
              {mode === "swap" ? `${items.length + swap.length} items swap` : `${moving} will move`}
              {blocked ? `, ${blocked} stay because of registration rules` : ""}
              {mode === "cover" && returnOn ? `. Everything comes back on ${returnOn} unless it's been changed in the meantime.` : "."}
            </p>
            <Button className="ml-auto rounded-full" onClick={run} disabled={pending || (mode !== "swap" && !moving) || (mode === "swap" && !items.length && !swap.length)}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {mode === "cover" ? "Start cover" : mode === "swap" ? "Swap now" : "Hand over"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

type Row = { id: string; mode: string; status: string; from: string; to: string; returnOn: string | null; reason: string | null; note: string | null; count: number; by: string | null; at: string; returnedAt: string | null; items: { label: string; field: string; entity: string; to: string }[] };

/** Past and active handovers; active cover can be ended early. */
export function HandoverHistory({ rows }: { rows: Row[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!rows.length) return null;
  return (
    <section className="rounded-2xl border bg-card">
      <p className="border-b px-4 py-3 text-sm font-medium">Handovers</p>
      <ul>
        {rows.map((h) => (
          <li key={h.id} className="border-b px-4 py-3 text-[13px] last:border-0">
            <details>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{h.mode === "cover" ? "Cover" : h.mode === "swap" ? "Swap" : "Handover"}</span>
                <span className="text-muted-foreground">
                  {h.mode === "swap" ? `${h.from} ⇄ ${h.to}` : `${h.from} → ${h.to}`} · {h.count} item{h.count === 1 ? "" : "s"} · {new Date(h.at).toLocaleDateString("en-AU")} by {h.by}
                </span>
                <span className={cn("rounded-full px-2 py-0.5 text-[11px]", h.status === "active" ? "bg-amber-500/12 text-amber-500" : h.status === "returned" ? "bg-sky-500/12 text-sky-500" : "bg-muted text-muted-foreground")}>
                  {h.status === "active" ? `Until ${h.returnOn}` : h.status === "returned" ? `Returned ${h.returnedAt ? new Date(h.returnedAt).toLocaleDateString("en-AU") : ""}` : "Done"}
                </span>
                {h.status === "active" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="ml-auto"
                    disabled={pending}
                    onClick={(e) => {
                      e.preventDefault();
                      if (!confirm(`End this cover now and give the work back to ${h.from}?`)) return;
                      start(async () => {
                        const r = await endCover(h.id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success(`${r.returned} returned${r.kept ? `, ${r.kept} left as changed` : ""}`);
                        router.refresh();
                      });
                    }}
                  >
                    <RotateCcw /> End cover now
                  </Button>
                ) : null}
              </summary>
              <div className="mt-2 grid gap-1 pl-1 text-[12px] text-muted-foreground">
                {h.reason ? <p>Reason: {h.reason}</p> : null}
                {h.note ? <p>Note: {h.note}</p> : null}
                <ul className="grid gap-0.5">
                  {h.items.map((i, n) => (
                    <li key={n}>
                      {i.label}
                      {i.field === "supervisorId" ? " (supervisor)" : ""} → {i.to}
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  );
}
