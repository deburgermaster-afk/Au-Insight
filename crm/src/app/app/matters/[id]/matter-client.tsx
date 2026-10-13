"use client";

import { ArrowDown, ArrowUp, Check, ChevronDown, FileSignature, Loader2, Paperclip, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { sendAgreement, voidAgreement } from "@/lib/agreement-actions";
import { ago } from "@/lib/format";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { checklistTone, label, Pill } from "@/components/app/badges";
import { ProgressBar } from "@/components/app/motion";
import { AreaField, Row, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditRecord } from "@/components/edit/edit-record";
import type { EditOptions } from "@/lib/edit-data";
import { moveChecklistItem } from "@/lib/record-actions";
import { Input } from "@/components/ui/input";
import { addChecklistItem, moveMatter, setChecklistStatus, setCompliance, updateMatter } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { fileUrl } from "@/components/mail/file-icon";
import { type CheckView, DocCheckBadge } from "@/components/ai/doc-check-badge";
import { UploadButton } from "@/components/mail/upload-button";
import { stages } from "@/lib/visas";
import { MailAiConsent } from "@/components/mail-ai/consent";

export function StageStepper({ matterId, stage, askAi, clientName }: { matterId: string; stage: string; askAi?: boolean; clientName?: string }) {
  const [current, set] = useOptimistic(stage);
  const [pending, start] = useTransition();
  const [consent, setConsent] = useState(false);
  const idx = stages.findIndex((s) => s.key === current);
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      {askAi ? <MailAiConsent scope="matter" matterId={matterId} clientName={clientName} open={consent} onOpenChange={setConsent} /> : null}
      <ol className="flex w-max min-w-full items-center gap-1">
        {stages.map((s, i) => {
          const done = i < idx;
          const active = i === idx;
          return (
            <li key={s.key} className="flex items-center gap-1">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    set(s.key);
                    const r = await moveMatter(matterId, s.key);
                    if (!r.ok) toast.error(r.error);
                    // First time a case moves forward, ask whether AI should track its emails.
                    else if (askAi && i > idx) setConsent(true);
                  })
                }
                className={cn(
                  "relative flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active ? "border-primary text-primary-foreground" : done ? "border-primary/30 bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted",
                )}
              >
                {active ? <motion.span layoutId="stage-pill" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 400, damping: 32 }} /> : null}
                <span className="relative flex items-center gap-1.5">
                  {done ? <Check className="size-3" /> : <span className="tabular-nums opacity-70">{i + 1}</span>}
                  {s.label}
                </span>
              </button>
              {i < stages.length - 1 ? <span className={cn("h-px w-3", i < idx ? "bg-primary/50" : "bg-border")} /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

type Item = { id: string; category: string; label: string; required: boolean; status: string; note: string | null };
type Doc = { id: string; name: string; storageKey: string | null; checklistItemId: string | null; source: string | null; check?: CheckView };
const statuses = ["needed", "requested", "received", "approved", "rejected", "waived"];
const doneish = (s: string) => s === "approved" || s === "received" || s === "waived";

export function Checklist({ matterId, items, docs, agencyId, clientId, aiDocs = false, editOptions, caps = [] }: { matterId: string; items: Item[]; docs: Doc[]; agencyId: string; clientId: string; aiDocs?: boolean; editOptions?: EditOptions; caps?: string[] }) {
  const [list, update] = useOptimistic(items, (state, { id, status }: { id: string; status: string }) => state.map((i) => (i.id === id ? { ...i, status } : i)));
  const [, start] = useTransition();
  const [adding, startAdd] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of list) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [list]);
  const required = list.filter((i) => i.required);
  const done = required.filter((i) => doneish(i.status)).length;
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const setStatus = (id: string, status: string) =>
    start(async () => {
      update({ id, status });
      const r = await setChecklistStatus(id, status);
      if (!r.ok) toast.error(r.error);
    });

  return (
    <div className="grid gap-4">
      <div className="flex items-center gap-3">
        <ProgressBar value={required.length ? done / required.length : 0} className="h-2" />
        <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
          {done}/{required.length} required
        </span>
      </div>
      {groups.map(([cat, rows]) => {
        const collapsed = open[cat] === false;
        const gDone = rows.filter((r) => doneish(r.status)).length;
        return (
          <div key={cat} className="overflow-hidden rounded-xl border">
            <button type="button" onClick={() => setOpen((o) => ({ ...o, [cat]: collapsed }))} className="flex w-full items-center gap-2 bg-muted/40 px-3 py-2 text-left text-sm font-medium">
              <ChevronDown className={cn("size-4 transition", collapsed && "-rotate-90")} />
              {cat}
              <span className="ml-auto text-xs tabular-nums text-muted-foreground">
                {gDone}/{rows.length}
              </span>
            </button>
            <AnimatePresence initial={false}>
              {!collapsed ? (
                <motion.ul initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="overflow-hidden">
                  {rows.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 border-t px-3 py-2.5">
                      <button
                        type="button"
                        aria-label="Toggle approved"
                        onClick={() => setStatus(i.id, doneish(i.status) ? "needed" : "approved")}
                        className={cn(
                          "grid size-5 shrink-0 place-items-center rounded-md border transition",
                          doneish(i.status) ? "border-emerald-500 bg-emerald-500 text-white" : "hover:border-primary",
                        )}
                      >
                        {doneish(i.status) ? (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <Check className="size-3.5" />
                          </motion.span>
                        ) : null}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-sm", doneish(i.status) && "text-muted-foreground")}>
                          {i.label}
                          {!i.required ? <span className="ml-1.5 text-xs text-muted-foreground">(if applicable)</span> : null}
                        </p>
                        {docs
                          .filter((d) => d.checklistItemId === i.id && d.storageKey)
                          .map((d) => (
                            <span key={d.id} className="mt-1 mr-1 inline-flex max-w-full items-center gap-1">
                              <a href={fileUrl(d.storageKey!, d.name)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] hover:underline">
                                <Paperclip className="size-3 shrink-0" /> <span className="truncate">{d.name}</span>
                                {d.source === "portal" ? <span className="shrink-0 text-[var(--chart-1)]">· from client</span> : null}
                              </a>
                              <DocCheckBadge documentId={d.id} check={d.check ?? null} aiOn={aiDocs} />
                            </span>
                          ))}
                      </div>
                      <UploadButton agencyId={agencyId} clientId={clientId} matterId={matterId} checklistItemId={i.id} category={i.category} size="icon-xs" variant="ghost" label="Upload for this item" />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button type="button" className="shrink-0">
                            <Pill t={checklistTone[i.status]} className="cursor-pointer">
                              {label(i.status)} <ChevronDown className="size-3" />
                            </Pill>
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {statuses.map((s) => (
                            <DropdownMenuItem key={s} onSelect={() => setStatus(i.id, s)}>
                              {label(s)}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onSelect={() => start(async () => void (await moveChecklistItem(i.id, "up")))}>
                            <ArrowUp /> Move up
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => start(async () => void (await moveChecklistItem(i.id, "down")))}>
                            <ArrowDown /> Move down
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {editOptions ? <EditRecord entity="checklist" id={i.id} values={{ label: i.label, category: i.category, required: i.required, note: i.note ?? null }} options={editOptions} caps={caps} canDelete /> : null}
                    </li>
                  ))}
                </motion.ul>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
      <form
        ref={form}
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          startAdd(async () => {
            const r = await addChecklistItem(matterId, f);
            if (!r.ok) return void toast.error(r.error);
            form.current?.reset();
          });
        }}
      >
        <Input name="label" placeholder="Add a document, e.g. Form 1221" />
        <input type="hidden" name="category" value="Other" />
        <Button type="submit" variant="outline" disabled={adding}>
          {adding ? <Loader2 className="animate-spin" /> : <Plus />} Add
        </Button>
      </form>
    </div>
  );
}

export function MatterDetailsForm({
  matterId,
  m,
}: {
  matterId: string;
  m: { trn: string | null; lodgedAt: string | null; decisionAt: string | null; outcome: string | null; dueAt: string | null; rfiDueAt: string | null; notes: string | null };
}) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await updateMatter(matterId, f);
          if (r.ok) toast.success("Matter updated");
          else toast.error(r.error);
        });
      }}
    >
      <TextField label="TRN (ImmiAccount)" name="trn" defaultValue={m.trn ?? ""} placeholder="EGO1234ABCD" />
      <Row>
        <TextField label="Target lodgement" name="dueAt" type="date" defaultValue={m.dueAt ?? ""} />
        <TextField label="Lodged" name="lodgedAt" type="date" defaultValue={m.lodgedAt ?? ""} />
      </Row>
      <Row>
        <TextField label="Decision" name="decisionAt" type="date" defaultValue={m.decisionAt ?? ""} />
        <div className="grid gap-1.5">
          <label htmlFor="outcome" className="text-sm font-medium">
            Outcome
          </label>
          <select id="outcome" name="outcome" defaultValue={m.outcome ?? ""} className="h-9 rounded-lg border bg-transparent px-3 text-sm">
            <option value="">Pending</option>
            <option value="granted">Granted</option>
            <option value="refused">Refused</option>
            <option value="withdrawn">Withdrawn</option>
            <option value="invalid">Invalid</option>
          </select>
        </div>
      </Row>
      <TextField label="RFI / s56 response due" name="rfiDueAt" type="date" defaultValue={m.rfiDueAt ?? ""} hint="From the Department's request letter. Shows on the dashboard until it's met." />
      <AreaField label="Notes" name="notes" defaultValue={m.notes ?? ""} />
      <Button type="submit" disabled={pending} className="justify-self-end">
        {pending ? <Loader2 className="animate-spin" /> : null} Save details
      </Button>
    </form>
  );
}

type Esign = { id: string; status: string; createdAt: Date; viewedAt: Date | null; signedAt: Date | null; signerName: string | null; pdf: string | null } | null;

export function ComplianceChecks({ matterId, guide, agreement, esign, hasEmail }: { matterId: string; guide: string | null; agreement: string | null; esign?: Esign; hasEmail?: boolean }) {
  const [pending, start] = useTransition();
  const rows = [
    { key: "consumerGuideAt" as const, value: guide, title: "Consumer Guide given", code: "Code s38", hint: "Before giving immigration assistance" },
    { key: "agreementSignedAt" as const, value: agreement, title: "Service agreement signed", code: "Code s42 · s51", hint: "With fee estimate; needed before invoicing" },
  ];
  return (
    <ul className="grid gap-2">
      {rows.map((r) => (
        <li key={r.key}>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await setCompliance(matterId, r.key, !r.value);
                if (!res.ok) toast.error(res.error);
              })
            }
            className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:border-foreground/20 ${r.value ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}
          >
            <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border ${r.value ? "border-emerald-500 bg-emerald-500 text-white" : "border-amber-500/60"}`}>{r.value ? <Check className="size-3.5" /> : null}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{r.title}</span>
              <span className="block text-xs text-muted-foreground">{r.value ? `Recorded ${r.value}` : r.hint}</span>
            </span>
            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">{r.code}</span>
          </button>
        </li>
      ))}
      <EsignRow matterId={matterId} esign={esign ?? null} signed={Boolean(agreement)} hasEmail={hasEmail ?? true} />
    </ul>
  );
}

function EsignRow({ matterId, esign, signed, hasEmail }: { matterId: string; esign: Esign; signed: boolean; hasEmail: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, msg: (id?: string) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg(r.id));
      router.refresh();
    });
  const open = esign && (esign.status === "sent" || esign.status === "viewed");
  if (esign?.status === "signed")
    return (
      <li className="flex items-center gap-2 rounded-xl border border-emerald-500/30 px-3 py-2 text-xs">
        <FileSignature className="size-4 shrink-0 text-emerald-500" />
        <span className="min-w-0 flex-1" suppressHydrationWarning>
          E-signed by {esign.signerName} {esign.signedAt ? ago(esign.signedAt) : ""}
        </span>
        {esign.pdf ? (
          <a href={esign.pdf} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-foreground underline-offset-2 hover:underline">
            Signed PDF
          </a>
        ) : null}
      </li>
    );
  if (signed) return null;
  return (
    <li className="grid gap-2 rounded-xl border border-dashed px-3 py-2.5 text-xs">
      <span className="flex items-center gap-2" suppressHydrationWarning>
        <FileSignature className="size-4 shrink-0 text-sky-500" />
        {open ? `Sent to sign ${ago(esign!.createdAt)}${esign!.viewedAt ? ` · opened ${ago(esign!.viewedAt)}` : " · not opened yet"}` : "Let the client read and sign the agreement in their portal."}
      </span>
      <span className="flex flex-wrap gap-2">
        <Button size="sm" variant={open ? "outline" : "default"} className="h-7 rounded-full text-xs" disabled={pending || !hasEmail} title={hasEmail ? undefined : "Add the client's email first"} onClick={() => run(() => sendAgreement(matterId), (id) => (id === "emailed" ? "Sent. The client got an email with a link to sign." : "Ready to sign in the client's portal."))}>
          {pending ? <Loader2 className="animate-spin" /> : <FileSignature />} {open ? "Send again" : "Send to sign"}
        </Button>
        {open ? (
          <Button size="sm" variant="ghost" className="h-7 rounded-full text-xs text-muted-foreground" disabled={pending} onClick={() => confirm("Withdraw this agreement? The client won't be able to sign it.") && run(() => voidAgreement(esign!.id), () => "Withdrawn")}>
            Withdraw
          </Button>
        ) : null}
      </span>
    </li>
  );
}
