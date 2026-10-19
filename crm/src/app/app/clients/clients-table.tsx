"use client";

import { Bookmark, Download, Filter, Loader2, Mail, Search, Tag, Trash2, UsersRound, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { clientStageTone, ExpiryPill, label, Pill } from "@/components/app/badges";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { daysUntil, dmy, initials, todayIso } from "@/lib/format";
import { myMailboxes } from "@/lib/mail-actions";
import { bulkTag, deleteSegment, emailClients, saveSegment } from "@/lib/segment-actions";
import { cleanFilters, describeFilters, filterCount, matchesSegment, type SegmentFilters, toCsv } from "@/lib/segments";
import { cn } from "@/lib/utils";

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
  assignedTo: string | null;
  tags: string[];
  source: string | null;
};
type Segment = { id: string; name: string; filters: SegmentFilters };

const stageKeys = ["all", "lead", "prospect", "active", "on_hold", "past", "lost"];
const expiryChoices = [30, 60, 90, 180];

const toggle = (list: string[] | undefined, v: string) => {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
};
const countBy = (vals: (string | null)[]) => {
  const m = new Map<string, number>();
  for (const v of vals) if (v) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

function Chip({ on, onClick, children, count }: { on: boolean; onClick: () => void; children: React.ReactNode; count?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition", on ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
    >
      {children}
      {count != null ? <span className="tabular-nums opacity-60">{count}</span> : null}
    </button>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export function ClientsTable({ rows, segments, tagOptions, staff, initialSegment }: { rows: Row[]; segments: Segment[]; tagOptions: string[]; staff: { id: string; name: string }[]; initialSegment: string | null }) {
  const router = useRouter();
  const start = segments.find((x) => x.id === initialSegment) ?? null;
  const [active, setActive] = useState<Segment | null>(start);
  const [q, setQ] = useState(start?.filters.q ?? "");
  const [stage, setStage] = useState(start?.filters.stages?.length === 1 ? start.filters.stages[0] : "all");
  const [f, setF] = useState<SegmentFilters>(start ? { ...start.filters, q: undefined, stages: undefined } : {});
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<null | "save" | "tag-add" | "tag-remove" | "email">(null);
  const dq = useDeferredValue(q);

  const filters: SegmentFilters = useMemo(() => cleanFilters({ ...f, q: dq, stages: stage === "all" ? undefined : [stage] }), [f, dq, stage]);
  const shown = useMemo(() => rows.filter((r) => matchesSegment(r, filters)), [rows, filters]);
  const counts = useMemo(() => {
    const base = cleanFilters({ ...f, q: dq });
    const pool = rows.filter((r) => matchesSegment(r, base));
    return Object.fromEntries(stageKeys.map((k) => [k, k === "all" ? pool.length : pool.filter((r) => r.stage === k).length]));
  }, [rows, f, dq]);
  const segCount = useMemo(() => Object.fromEntries(segments.map((sg) => [sg.id, rows.filter((r) => matchesSegment(r, sg.filters)).length])), [rows, segments]);

  const allTags = useMemo(() => {
    const used = countBy(rows.flatMap((r) => r.tags));
    const names = [...new Set([...used.map(([t]) => t), ...tagOptions])];
    return names.map((t) => [t, used.find(([u]) => u === t)?.[1] ?? 0] as const);
  }, [rows, tagOptions]);
  const visas = useMemo(() => countBy(rows.map((r) => r.currentVisa)), [rows]);
  const sources = useMemo(() => countBy(rows.map((r) => r.source)), [rows]);
  const nations = useMemo(() => countBy(rows.map((r) => r.nationality)).slice(0, 14), [rows]);
  const staffNames = useMemo(() => Object.fromEntries(staff.map((x) => [x.id, x.name])), [staff]);
  const nFilters = filterCount(f);
  const dirty = active ? JSON.stringify(cleanFilters({ ...active.filters })) !== JSON.stringify(filters) : nFilters > 0 || stage !== "all" || Boolean(dq.trim());

  const pickedRows = shown.filter((r) => picked.has(r.id));
  const target = pickedRows.length ? pickedRows : shown;
  const allPicked = shown.length > 0 && shown.every((r) => picked.has(r.id));

  function applySegment(sg: Segment | null) {
    setActive(sg);
    setPicked(new Set());
    const fl = sg?.filters ?? {};
    setQ(fl.q ?? "");
    setStage(fl.stages?.length === 1 ? fl.stages[0] : "all");
    setF({ ...fl, q: undefined, stages: fl.stages && fl.stages.length > 1 ? fl.stages : undefined });
    const url = new URL(window.location.href);
    if (sg) url.searchParams.set("segment", sg.id);
    else url.searchParams.delete("segment");
    window.history.replaceState(window.history.state, "", url);
  }

  function exportCsv() {
    const csv = toCsv(
      target.map((r) => ({ ...r, name: `${r.firstName} ${r.lastName}`, tags: r.tags.join("; "), location: r.onshore ? "Onshore" : "Offshore", stage: label(r.stage) })),
      [
        { key: "firstName", label: "First name" },
        { key: "lastName", label: "Last name" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "stage", label: "Stage" },
        { key: "currentVisa", label: "Current visa" },
        { key: "visaExpiry", label: "Visa expiry" },
        { key: "nationality", label: "Nationality" },
        { key: "occupation", label: "Occupation" },
        { key: "location", label: "Location" },
        { key: "source", label: "Source" },
        { key: "tags", label: "Tags" },
        { key: "assigneeName", label: "Case officer" },
        { key: "matterCount", label: "Matters" },
      ],
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `${(active?.name ?? "clients").replace(/[^\w-]+/g, "-").toLowerCase()}-${todayIso()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success(`Exported ${target.length} client${target.length === 1 ? "" : "s"}`);
  }

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
        <div className="flex gap-2 lg:ml-auto">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className={cn(nFilters && "border-primary text-primary")}>
                <Filter /> Filters
                {nFilters ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground tabular-nums">{nFilters}</span> : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="grid max-h-[70vh] w-[min(92vw,26rem)] gap-4 overflow-y-auto">
              <Group title="Tags">
                {allTags.length ? allTags.map(([t, n]) => <Chip key={t} on={Boolean(f.tags?.includes(t))} count={n} onClick={() => setF({ ...f, tags: toggle(f.tags, t) })}>{t}</Chip>) : <span className="text-xs text-muted-foreground">No tags yet. Select clients and add one.</span>}
              </Group>
              {(f.tags?.length ?? 0) > 1 ? (
                <div className="-mt-2 flex gap-1.5 text-xs">
                  <Chip on={f.tagMode !== "all"} onClick={() => setF({ ...f, tagMode: "any" })}>Any of these</Chip>
                  <Chip on={f.tagMode === "all"} onClick={() => setF({ ...f, tagMode: "all" })}>All of these</Chip>
                </div>
              ) : null}
              <Group title="Current visa">
                {visas.map(([v, n]) => <Chip key={v} on={Boolean(f.visas?.includes(v))} count={n} onClick={() => setF({ ...f, visas: toggle(f.visas, v) })}>{v}</Chip>)}
              </Group>
              <Group title="Visa expires within">
                {expiryChoices.map((d) => <Chip key={d} on={f.expiryDays === d} onClick={() => setF({ ...f, expiryDays: f.expiryDays === d ? undefined : d })}>{d} days</Chip>)}
              </Group>
              <Group title="Location">
                {(["onshore", "offshore"] as const).map((l) => <Chip key={l} on={f.location === l} onClick={() => setF({ ...f, location: f.location === l ? undefined : l })}>{l === "onshore" ? "Onshore" : "Offshore"}</Chip>)}
              </Group>
              <Group title="Source">
                {sources.map(([v, n]) => <Chip key={v} on={Boolean(f.sources?.includes(v))} count={n} onClick={() => setF({ ...f, sources: toggle(f.sources, v) })}>{v}</Chip>)}
              </Group>
              <Group title="Nationality">
                {nations.map(([v, n]) => <Chip key={v} on={Boolean(f.nationalities?.includes(v))} count={n} onClick={() => setF({ ...f, nationalities: toggle(f.nationalities, v) })}>{v}</Chip>)}
              </Group>
              <Group title="Case officer">
                {staff.map((x) => <Chip key={x.id} on={Boolean(f.assignedTo?.includes(x.id))} onClick={() => setF({ ...f, assignedTo: toggle(f.assignedTo, x.id) })}>{x.name}</Chip>)}
              </Group>
              {nFilters ? (
                <Button variant="ghost" size="sm" className="justify-self-start" onClick={() => setF({})}>
                  <X /> Clear filters
                </Button>
              ) : null}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!target.length} title="Download as CSV">
            <Download /> CSV
          </Button>
        </div>
      </div>

      {segments.length || dirty ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <Bookmark className="size-3.5 text-muted-foreground" />
          <Chip on={!active} onClick={() => applySegment(null)}>
            All clients
          </Chip>
          {segments.map((sg) => (
            <Chip key={sg.id} on={active?.id === sg.id} count={segCount[sg.id]} onClick={() => applySegment(sg)}>
              {sg.name}
            </Chip>
          ))}
          {dirty ? (
            <Button variant="ghost" size="xs" onClick={() => setDialog("save")}>
              <Bookmark /> {active ? "Save changes" : "Save as segment"}
            </Button>
          ) : null}
          {active ? <DeleteSegment segment={active} onDone={() => { applySegment(null); router.refresh(); }} /> : null}
        </div>
      ) : null}
      {nFilters || active ? <p className="-mt-2 text-xs text-muted-foreground">{describeFilters(filters, staffNames)}</p> : null}

      {shown.length === 0 ? (
        <Empty className="rounded-2xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>No clients match</EmptyTitle>
            <EmptyDescription>Try another search, stage or filter.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
          <div className="hidden grid-cols-[1.5rem_minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] items-center gap-4 border-b bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
            <Checkbox checked={allPicked} onCheckedChange={(v) => setPicked(v ? new Set(shown.map((r) => r.id)) : new Set())} aria-label="Select all shown" />
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
                  className={cn("relative border-b last:border-0", picked.has(r.id) && "bg-primary/5")}
                >
                  <div className="absolute left-4 top-1/2 z-10 -translate-y-1/2 max-md:top-6">
                    <Checkbox checked={picked.has(r.id)} onCheckedChange={() => setPicked((p) => new Set(toggle([...p], r.id)))} aria-label={`Select ${r.firstName} ${r.lastName}`} />
                  </div>
                  <Link
                    href={`/app/clients/${r.id}`}
                    className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 py-3 pl-12 pr-4 transition hover:bg-muted/50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)_4rem] md:pl-14"
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
                          {r.tags.length ? <span className="ml-1.5">{r.tags.map((t) => <span key={t} className="mr-1 rounded bg-muted px-1 py-px text-[10px] text-foreground/80">{t}</span>)}</span> : null}
                        </p>
                      </div>
                    </div>
                    <div className="justify-self-end md:justify-self-start">
                      <Pill t={clientStageTone[r.stage]}>{label(r.stage)}</Pill>
                    </div>
                    <span className="hidden truncate text-sm md:block">{r.currentVisa ? `Subclass ${r.currentVisa}` : "—"}</span>
                    <div className="col-span-2 flex items-center gap-2 md:col-span-1">
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

      <AnimatePresence>
        {pickedRows.length ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="sticky bottom-4 z-20 mx-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl border bg-popover p-2 shadow-lg"
          >
            <span className="px-2 text-sm font-medium tabular-nums">{pickedRows.length} selected</span>
            <Button size="sm" variant="ghost" onClick={() => setDialog("tag-add")}>
              <Tag /> Add tag
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog("tag-remove")}>
              <Tag /> Remove tag
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDialog("email")}>
              <Mail /> Email
            </Button>
            <Button size="sm" variant="ghost" onClick={exportCsv}>
              <Download /> CSV
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => setPicked(new Set())} aria-label="Clear selection">
              <X />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <SaveDialog open={dialog === "save"} onClose={() => setDialog(null)} active={active} filters={filters} summary={describeFilters(filters, staffNames)} onSaved={(id, name) => { setActive({ id, name, filters }); router.refresh(); const url = new URL(window.location.href); url.searchParams.set("segment", id); window.history.replaceState(window.history.state, "", url); }} />
      <TagDialog open={dialog === "tag-add" || dialog === "tag-remove"} mode={dialog === "tag-remove" ? "remove" : "add"} onClose={() => setDialog(null)} rows={pickedRows} tags={allTags.map(([t]) => t)} onDone={() => router.refresh()} />
      <EmailDialog open={dialog === "email"} onClose={() => setDialog(null)} rows={pickedRows} onDone={() => setPicked(new Set())} />
    </div>
  );
}

function DeleteSegment({ segment, onDone }: { segment: Segment; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={pending}
      className="text-muted-foreground"
      onClick={() => {
        if (!confirm(`Delete the "${segment.name}" segment? Clients aren't affected.`)) return;
        start(async () => {
          const r = await deleteSegment(segment.id);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Segment deleted");
          onDone();
        });
      }}
    >
      {pending ? <Loader2 className="animate-spin" /> : <Trash2 />} Delete
    </Button>
  );
}

function SaveDialog({ open, onClose, active, filters, summary, onSaved }: { open: boolean; onClose: () => void; active: Segment | null; filters: SegmentFilters; summary: string; onSaved: (id: string, name: string) => void }) {
  const [name, setName] = useState("");
  const [asNew, setAsNew] = useState(false);
  const [pending, start] = useTransition();
  const updating = Boolean(active) && !asNew;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else { setName(active?.name ?? ""); setAsNew(false); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{updating ? `Update "${active!.name}"` : "Save as segment"}</DialogTitle>
          <DialogDescription>{summary}. The list updates on its own as clients change.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="segName">Name</Label>
          <Input id="segName" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 485 holders expiring soon" autoFocus />
        </div>
        {active ? (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={asNew} onCheckedChange={(v) => setAsNew(Boolean(v))} /> Save as a new segment instead
          </label>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !name.trim()}
            onClick={() =>
              start(async () => {
                const r = await saveSegment({ id: updating ? active!.id : null, name, filters });
                if (!r.ok) return void toast.error(r.error);
                toast.success(updating ? "Segment updated" : "Segment saved");
                onSaved(r.id!, name.trim());
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Bookmark />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TagDialog({ open, mode, onClose, rows, tags, onDone }: { open: boolean; mode: "add" | "remove"; onClose: () => void; rows: Row[]; tags: string[]; onDone: () => void }) {
  const [tag, setTag] = useState("");
  const [pending, start] = useTransition();
  const present = mode === "remove" ? [...new Set(rows.flatMap((r) => r.tags))] : tags;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else setTag(""); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add a tag" : "Remove a tag"}</DialogTitle>
          <DialogDescription>
            {mode === "add" ? "Tag" : "Untag"} {rows.length} client{rows.length === 1 ? "" : "s"}.
          </DialogDescription>
        </DialogHeader>
        {mode === "add" ? <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="New or existing tag" autoFocus /> : null}
        <div className="flex flex-wrap gap-1.5">
          {present.length ? present.map((t) => <Chip key={t} on={tag === t} onClick={() => setTag(t)}>{t}</Chip>) : <span className="text-xs text-muted-foreground">These clients have no tags.</span>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !tag.trim()}
            onClick={() =>
              start(async () => {
                const r = await bulkTag(rows.map((x) => x.id), tag, mode);
                if (!r.ok) return void toast.error(r.error);
                toast.success(`${mode === "add" ? "Tagged" : "Untagged"} ${r.id} client${r.id === "1" ? "" : "s"}`);
                onDone();
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Tag />} {mode === "add" ? "Add tag" : "Remove tag"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Box = { id: string; address: string; name: string; kind: string; mine: boolean };

function EmailDialog({ open, onClose, rows, onDone }: { open: boolean; onClose: () => void; rows: Row[]; onDone: () => void }) {
  const [boxes, setBoxes] = useState<Box[] | null>(null);
  const [fromId, setFromId] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("Hi {firstName},\n\n");
  const [pending, start] = useTransition();
  const reachable = rows.filter((r) => r.email).length;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) return onClose();
        if (!boxes)
          myMailboxes().then((m) => {
            setBoxes(m.boxes);
            setFromId(m.boxes[0]?.id ?? "");
          });
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Email {rows.length} client{rows.length === 1 ? "" : "s"}</DialogTitle>
          <DialogDescription>
            Each client gets their own email, so nobody sees anyone else&apos;s address. {reachable < rows.length ? `${rows.length - reachable} without an email address will be skipped.` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="bulkFrom">From</Label>
            <select id="bulkFrom" value={fromId} onChange={(e) => setFromId(e.target.value)} className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm shadow-xs">
              {boxes === null ? <option>Loading…</option> : boxes.map((b) => <option key={b.id} value={b.id}>{b.name} · {b.address}</option>)}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bulkSubject">Subject</Label>
            <Input id="bulkSubject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Important update about your visa" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bulkMessage">Message</Label>
            <Textarea id="bulkMessage" value={message} onChange={(e) => setMessage(e.target.value)} rows={8} />
            <p className="text-[11px] text-muted-foreground">{"{firstName}"}, {"{lastName}"} and {"{name}"} are filled in for each client.</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={pending || !fromId || !subject.trim() || !reachable}
            onClick={() =>
              start(async () => {
                const r = await emailClients({ clientIds: rows.map((x) => x.id), fromId, subject, message });
                if (!r.ok) return void toast.error(r.error);
                toast.success(`Sent to ${r.sent} client${r.sent === 1 ? "" : "s"}${r.skipped ? ` · ${r.skipped} skipped` : ""}`);
                onDone();
                onClose();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Mail />} Send {reachable}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
