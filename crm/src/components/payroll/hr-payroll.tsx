"use client";

import { AlertTriangle, Check, Download, FileJson, Landmark, Loader2, Play, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { PayLine } from "@/db/crm-schema";
import { ActionDialog } from "@/components/forms/action-dialog";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { ActionResult } from "@/lib/actions";
import { ALLOWANCE_CODES, DEDUCTION_CODES, LEAVE_CODES } from "@/lib/payroll";
import { createPayRun, createStpEvent, deletePayRun, finalisePayRun, markSuper, rebuildStpEvent, recalculatePayRun, recordStpLodgement, setPayslipExtras } from "@/lib/payroll-actions";
import { sendJournalToXero, syncEmploymentHero } from "@/lib/payroll-integration-actions";
import { cn } from "@/lib/utils";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

export function NewPayRun({ suggested, frequency }: { suggested: { periodStart: string; periodEnd: string; payDate: string } | null; frequency: string }) {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" className="rounded-full">
          <Play /> New pay run
        </Button>
      }
      title="New pay run"
      description="Drafts a payslip for everyone on this pay frequency: salary or timesheet hours, ATO 2026–27 tax, 12% super, leave. You can add overtime, allowances and bonuses before finalising."
      action={createPayRun}
      submitLabel="Draft pay run"
      success="Pay run drafted"
    >
      <Row cols={3}>
        <TextField label="Period start" name="periodStart" type="date" defaultValue={suggested?.periodStart} required />
        <TextField label="Period end" name="periodEnd" type="date" defaultValue={suggested?.periodEnd} required />
        <TextField label="Pay date" name="payDate" type="date" defaultValue={suggested?.payDate} required />
      </Row>
      <SelectField
        label="Frequency"
        name="frequency"
        defaultValue={frequency}
        options={[
          { value: "weekly", label: "Weekly" },
          { value: "fortnightly", label: "Fortnightly" },
          { value: "monthly", label: "Monthly" },
        ]}
      />
    </ActionDialog>
  );
}

export function RunActions({ id, warnings }: { id: string; warnings: number }) {
  const { pending, run } = useRun();
  return (
    <div className="flex items-center gap-1">
      {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => recalculatePayRun(id), "Recalculated")} title="Recalculate after changing someone's details">
        <RefreshCw />
      </Button>
      <Button size="xs" variant="ghost" className="text-muted-foreground" disabled={pending} onClick={() => confirm("Delete this draft pay run?") && run(() => deletePayRun(id), "Draft deleted")}>
        <Trash2 />
      </Button>
      <Button size="xs" disabled={pending} onClick={() => (!warnings || confirm(`${warnings} payslip warning(s). Finalise anyway?`)) && run(() => finalisePayRun(id), "Finalised: payslips sent, super booked, STP report ready")}>
        <Check /> Finalise
      </Button>
    </div>
  );
}

export function RunDownloads({ id, xero }: { id: string; xero: boolean }) {
  const { pending, run } = useRun();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="xs" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Download />} Files
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem asChild>
          <a href={`/api/payroll/aba?run=${id}`}>
            <Landmark /> Bank file (ABA) for net pay
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/api/payroll/super?run=${id}`}>
            <Download /> Super contribution file
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href={`/api/payroll/journal?run=${id}`}>
            <Download /> Accounting journal (CSV)
          </a>
        </DropdownMenuItem>
        {xero ? (
          <DropdownMenuItem onSelect={() => run(() => sendJournalToXero(id), "Draft journal created in Xero")}>
            <Send /> Send journal to Xero
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type Draft = PayLine & { key: number };
const withoutKey = (d: Draft): PayLine => {
  const { label, kind, hours, rate, amount, code, ote } = d;
  return { label, kind, hours, rate, amount, code, ote };
};
const KINDS: { value: PayLine["kind"]; label: string }[] = [
  { value: "overtime", label: "Overtime" },
  { value: "allowance", label: "Allowance" },
  { value: "bonus", label: "Bonus or commission" },
  { value: "leave", label: "Paid leave" },
  { value: "sacrifice_super", label: "Salary sacrifice to super" },
  { value: "sacrifice_other", label: "Salary sacrifice (other)" },
  { value: "deduction", label: "Deduction after tax" },
  { value: "lump_sum", label: "Lump sum" },
];
const codesFor = (k: PayLine["kind"]) => (k === "allowance" ? ALLOWANCE_CODES.map((c) => ({ code: c.code, label: c.label })) : k === "leave" ? LEAVE_CODES : k === "deduction" ? DEDUCTION_CODES : k === "lump_sum" ? [{ code: "W", label: "Back payment" }, { code: "E", label: "Prior year back pay" }, { code: "A", label: "Unused leave on termination (A)" }, { code: "B", label: "Unused leave pre-1983 (B)" }, { code: "D", label: "Genuine redundancy tax free (D)" }] : []);

/** Adds lines to a draft payslip; tax, super and net are recalculated on save. */
export function PayslipEditor({ id, name, extras, rate }: { id: string; name: string; extras: PayLine[]; rate: number | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Draft[]>(extras.map((e, i) => ({ ...e, key: i })));
  const { pending, run } = useRun();
  const set = (key: number, patch: Partial<PayLine>) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost">
          <Plus /> Lines
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Add to {name}&apos;s pay</DialogTitle>
          <DialogDescription>Each line is reported to the ATO under its STP category. Overtime and expense allowances don&apos;t attract super; salary sacrifice reduces taxable pay.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map((r) => {
            const codes = codesFor(r.kind);
            const hourly = r.kind === "overtime" || r.kind === "leave";
            return (
              <div key={r.key} className="grid items-end gap-2 rounded-xl border p-2.5 sm:grid-cols-[150px_1fr_110px_80px_90px_100px_auto]">
                <select value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value as PayLine["kind"], code: codesFor(e.target.value as PayLine["kind"])[0]?.code })} className="h-8 rounded-md border bg-transparent px-1.5 text-[12px]">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
                <input value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} placeholder="Description" className="h-8 rounded-md border bg-transparent px-2 text-[12px]" />
                {codes.length ? (
                  <select value={r.code ?? codes[0].code} onChange={(e) => set(r.key, { code: e.target.value, ote: r.kind === "allowance" ? ALLOWANCE_CODES.find((c) => c.code === e.target.value)?.ote : r.ote })} className="h-8 rounded-md border bg-transparent px-1.5 text-[12px]">
                    {codes.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span />
                )}
                {hourly ? <input value={r.hours ?? ""} onChange={(e) => set(r.key, { hours: e.target.value ? Number(e.target.value) : undefined })} placeholder="Hours" inputMode="decimal" className="h-8 rounded-md border bg-transparent px-2 text-[12px]" /> : <span />}
                {hourly ? <input value={r.rate ?? ""} onChange={(e) => set(r.key, { rate: e.target.value ? Number(e.target.value) : undefined })} placeholder={rate ? `Rate ${(r.kind === "overtime" ? rate * 1.5 : rate).toFixed(2)}` : "Rate"} inputMode="decimal" className="h-8 rounded-md border bg-transparent px-2 text-[12px]" /> : <span />}
                <input value={hourly && r.hours != null && r.rate != null ? (r.hours * r.rate).toFixed(2) : Math.abs(r.amount) || ""} disabled={hourly && r.hours != null && r.rate != null} onChange={(e) => set(r.key, { amount: Number(e.target.value) || 0 })} placeholder="Amount" inputMode="decimal" className="h-8 rounded-md border bg-transparent px-2 text-[12px]" />
                <Button size="icon-xs" variant="ghost" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))}>
                  <X />
                </Button>
              </div>
            );
          })}
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setRows((r) => [...r, { key: Date.now(), kind: "overtime", label: "Overtime (time and a half)", amount: 0, hours: undefined, rate: rate ? Math.round(rate * 1.5 * 100) / 100 : undefined }])}>
            <Plus /> Add line
          </Button>
        </div>
        <Button
          className="justify-self-end rounded-full"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                setPayslipExtras(
                  id,
                  rows.map((r) => ({ ...withoutKey(r), label: r.label || KINDS.find((k) => k.value === r.kind)!.label, amount: r.hours != null && r.rate != null ? r.hours * r.rate : Math.abs(r.amount) })),
                ),
              "Payslip recalculated",
              () => setOpen(false),
            )
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Save and recalculate
        </Button>
      </DialogContent>
    </Dialog>
  );
}

type Contribution = { id: string; name: string; fund: { name: string | null; usi: string | null; type: string }; sg: string; sacrifice: string; extra: string; payDate: string; dueDate: string; status: string; reference: string | null };

/** Payday Super: what's due at each fund, and when. */
export function SuperTable({ rows, today }: { rows: Contribution[]; today: string }) {
  const [picked, setPicked] = useState<string[]>([]);
  const { pending, run } = useRun();
  const open = rows.filter((r) => r.status !== "paid");
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">Super must reach each fund within 7 days of payday. Download the file for your clearing house, then mark contributions sent and paid.</p>
        <Button size="xs" variant="outline" asChild disabled={!picked.length}>
          <a href={picked.length ? `/api/payroll/super?ids=${picked.join(",")}` : "/api/payroll/super"}>
            <Download /> {picked.length ? `File for ${picked.length}` : "File for all due"}
          </a>
        </Button>
        <Button size="xs" variant="outline" disabled={!picked.length || pending} onClick={() => run(() => markSuper(picked, "sent"), "Marked sent", () => setPicked([]))}>
          <Send /> Mark sent
        </Button>
        <Button size="xs" disabled={!picked.length || pending} onClick={() => run(() => markSuper(picked, "paid"), "Marked paid", () => setPicked([]))}>
          <Check /> Mark paid
        </Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        <table className="w-full text-[13px]">
          <thead className="bg-muted/40 text-left text-[12px] text-muted-foreground">
            <tr>
              <th className="w-8 py-2 pl-3">
                <input type="checkbox" checked={open.length > 0 && picked.length === open.length} onChange={(e) => setPicked(e.target.checked ? open.map((r) => r.id) : [])} />
              </th>
              <th className="py-2">Employee</th>
              <th>Fund</th>
              <th className="text-right">SG</th>
              <th className="text-right">Sacrifice</th>
              <th className="text-right">Total</th>
              <th className="pr-3 text-right">Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const late = r.status !== "paid" && r.dueDate < today;
              return (
                <tr key={r.id} className="border-t">
                  <td className="py-2 pl-3">{r.status !== "paid" ? <input type="checkbox" checked={picked.includes(r.id)} onChange={() => toggle(r.id)} /> : null}</td>
                  <td className="py-2">{r.name}</td>
                  <td className="max-w-48 truncate text-muted-foreground">{r.fund.name ?? (r.fund.type === "default" ? "Default fund (not set)" : "—")}{r.fund.usi ? ` · ${r.fund.usi}` : ""}</td>
                  <td className="text-right tabular-nums">${Number(r.sg).toFixed(2)}</td>
                  <td className="text-right tabular-nums text-muted-foreground">${(Number(r.sacrifice) + Number(r.extra)).toFixed(2)}</td>
                  <td className="text-right font-medium tabular-nums">${(Number(r.sg) + Number(r.sacrifice) + Number(r.extra)).toFixed(2)}</td>
                  <td className={cn("pr-3 text-right text-[12px]", late ? "text-rose-500" : r.status === "paid" ? "text-emerald-500" : "text-muted-foreground")}>{r.status === "paid" ? "Paid" : r.status === "sent" ? `Sent · due ${r.dueDate}` : late ? `Late: was due ${r.dueDate}` : `Due ${r.dueDate}`}</td>
                </tr>
              );
            })}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  Nothing yet. Contributions are booked when a pay run is finalised.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type StpRow = { id: string; kind: string; financialYear: string; submissionId: string; status: string; via: string | null; problems: { who: string; text: string }[]; payees: number; gross: string; tax: string; receipt: string | null; lodgedAt: Date | null; lodgedBy: string | null; createdAt: Date };

const STATUS: Record<string, [string, string]> = {
  ready: ["Ready to lodge", "bg-sky-500/12 text-sky-500"],
  needs_fixing: ["Fix before lodging", "bg-amber-500/12 text-amber-500"],
  lodged: ["Lodged", "bg-emerald-500/12 text-emerald-500"],
  accepted: ["Accepted by ATO", "bg-emerald-500/12 text-emerald-500"],
  rejected: ["Rejected", "bg-rose-500/12 text-rose-500"],
};

/** Single Touch Payroll reports and what to do with each. */
export function StpList({ rows, via, ehConnected }: { rows: StpRow[]; via: string; ehConnected: boolean }) {
  const { pending, run } = useRun();
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">
          A pay event is prepared each time you finalise a pay run, with year-to-date figures for each person. {via === "file" ? "Lodge it through your registered STP solution, then record the ATO receipt here." : via === "employment_hero" ? "Employment Hero lodges STP: keep staff synced, finalise the pay run there and record the receipt here." : "Xero lodges STP from its payroll: record the receipt here."}
        </p>
        {ehConnected ? (
          <Button size="xs" variant="outline" disabled={pending} onClick={() => run(async () => {
            const r = await syncEmploymentHero();
            if (r.ok && r.errors?.length) toast.warning(`${r.synced} synced. ${r.errors.slice(0, 2).join(" · ")}`);
            return r;
          }, "Staff synced to Employment Hero")}>
            <RefreshCw /> Sync staff to Employment Hero
          </Button>
        ) : null}
        <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => createStpEvent("update"), "Update event prepared")}>
          <RefreshCw /> Update event
        </Button>
        <Button size="xs" variant="outline" disabled={pending} onClick={() => confirm("Prepare the end-of-year finalisation for everyone paid this financial year? Lodge it by 14 July.") && run(() => createStpEvent("finalisation"), "Finalisation prepared")}>
          <Check /> EOFY finalisation
        </Button>
      </div>
      {rows.map((r) => (
        <div key={r.id} className="grid gap-2 rounded-2xl border bg-card p-3.5">
          <div className="flex flex-wrap items-center gap-2">
            <FileJson className="size-4 text-muted-foreground" />
            <p className="text-sm font-medium capitalize">
              {r.kind === "pay" ? "Pay event" : r.kind === "update" ? "Update event" : "Finalisation"} · {r.financialYear}
            </p>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px]", STATUS[r.status]?.[1])}>{STATUS[r.status]?.[0] ?? r.status}</span>
            <span className="text-[12px] text-muted-foreground">
              {r.payees} payee{r.payees === 1 ? "" : "s"} · gross ${Number(r.gross).toLocaleString("en-AU", { minimumFractionDigits: 2 })} · PAYGW ${Number(r.tax).toLocaleString("en-AU", { minimumFractionDigits: 2 })}
            </span>
            <span className="ml-auto flex gap-1">
              <Button size="xs" variant="ghost" asChild>
                <a href={`/api/payroll/stp?id=${r.id}`}>JSON</a>
              </Button>
              <Button size="xs" variant="ghost" asChild>
                <a href={`/api/payroll/stp?id=${r.id}&format=csv`}>CSV</a>
              </Button>
              {r.status === "needs_fixing" ? (
                <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => rebuildStpEvent(r.id), "Rebuilt")}>
                  <RefreshCw /> Rebuild
                </Button>
              ) : null}
              {r.status === "ready" ? <RecordLodgement id={r.id} via={via} /> : null}
            </span>
          </div>
          {r.problems.length ? (
            <ul className="grid gap-1 text-[12px]">
              {r.problems.map((p, i) => (
                <li key={i} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                  <span>
                    <span className="font-medium">{p.who}:</span> {p.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {r.lodgedAt ? (
            <p className="text-[12px] text-muted-foreground">
              Lodged by {r.lodgedBy} {new Date(r.lodgedAt).toLocaleDateString("en-AU")}
              {r.receipt ? ` · ATO receipt ${r.receipt}` : ""} · submission {r.submissionId.slice(0, 8)}
            </p>
          ) : null}
        </div>
      ))}
      {!rows.length ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No STP reports yet. They&apos;re prepared when you finalise a pay run.</p> : null}
    </div>
  );
}

function RecordLodgement({ id, via }: { id: string; via: string }) {
  return (
    <ActionDialog
      trigger={
        <Button size="xs">
          <Send /> Record lodgement
        </Button>
      }
      title="Record STP lodgement"
      description="After lodging through a registered STP solution, add the ATO receipt number so this report is marked accepted."
      action={(f) => recordStpLodgement(id, f)}
      submitLabel="Save"
      success="Lodgement recorded"
    >
      <TextField label="ATO receipt number" name="receipt" placeholder="e.g. 1234567890" />
      <SelectField
        label="Lodged through"
        name="via"
        defaultValue={via}
        options={[
          { value: "file", label: "Another registered STP solution" },
          { value: "employment_hero", label: "Employment Hero" },
          { value: "xero", label: "Xero" },
        ]}
      />
    </ActionDialog>
  );
}
