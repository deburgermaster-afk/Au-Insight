"use client";

import { ArrowRightLeft, CheckCircle2, ExternalLink, Link2, Loader2, RefreshCw, Scale, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recheckPayment, reviewPayment, saveReconciliation, setZellerLink, transferToOffice } from "@/lib/payment-actions";

const useRun = () => {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, msg: (id?: string) => string, done?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg(r.id));
      done?.();
      router.refresh();
    });
  return { pending, run };
};

/** Approve or reject a client's bank transfer / Zeller receipt after checking the bank. */
export function ReviewPayment({ id, amount, proofUrl, isImage }: { id: string; amount: number; proofUrl: string | null; isImage: boolean }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(amount.toFixed(2));
  const [note, setNote] = useState("");
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" className="rounded-full">
          Review
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Check this payment</DialogTitle>
          <DialogDescription>Find it on the bank statement (or Zeller dashboard) before approving. Approving records the receipt and updates the invoice.</DialogDescription>
        </DialogHeader>
        {proofUrl ? (
          isImage ? (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted/30">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={proofUrl} alt="Payment proof" className="max-h-80 w-full object-contain" />
            </a>
          ) : (
            <a href={proofUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm underline-offset-2 hover:underline">
              Open the receipt <ExternalLink className="size-3.5" />
            </a>
          )
        ) : null}
        <div className="grid gap-3 text-[13px]">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Amount received (as on the bank statement)</span>
            <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Note (bank reference when approving; the reason, shown to the client, when rejecting)</span>
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" className="rounded-full" disabled={pending} onClick={() => run(() => reviewPayment(id, "reject", note), () => "Rejected; the client was told why", () => setOpen(false))}>
              <XCircle /> Not received
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={() => run(() => reviewPayment(id, "approve", note, Number(amt)), () => "Payment recorded", () => setOpen(false))}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Received, record it
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function RecheckPayment({ id }: { id: string }) {
  const { pending, run } = useRun();
  return (
    <Button size="xs" variant="outline" className="rounded-full" disabled={pending} onClick={() => run(() => recheckPayment(id), (st) => (st === "paid" ? "Paid: recorded" : "Not paid yet"))}>
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check
    </Button>
  );
}

export function ZellerLink({ invoiceId, value }: { invoiceId: string; value: string | null }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(value ?? "");
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost" className="rounded-full" title="Zeller payment link">
          <Link2 /> {value ? "Zeller ✓" : "Zeller"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Zeller payment link</DialogTitle>
          <DialogDescription>Create a Pay by Link for the amount owing in the Zeller app or dashboard, then paste it here. The client sees a Zeller option on this invoice.</DialogDescription>
        </DialogHeader>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…zeller…" />
        <div className="flex justify-end gap-2">
          {value ? (
            <Button variant="ghost" className="rounded-full" disabled={pending} onClick={() => run(() => setZellerLink(invoiceId, ""), () => "Removed", () => setOpen(false))}>
              Remove
            </Button>
          ) : null}
          <Button className="rounded-full" disabled={pending || !url.trim()} onClick={() => run(() => setZellerLink(invoiceId, url), () => "Zeller link added", () => setOpen(false))}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Move earned fees out of trust into the office account. */
export function TransferToOffice({ clientId, name, balance, invoices }: { clientId: string; name: string; balance: number; invoices: { id: string; number: string }[] }) {
  const [open, setOpen] = useState(false);
  const [amt, setAmt] = useState(balance.toFixed(2));
  const [inv, setInv] = useState(invoices[0]?.id ?? "");
  const [memo, setMemo] = useState("");
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" className="rounded-full" disabled={balance <= 0}>
          <ArrowRightLeft /> To office
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move fees earned to office</DialogTitle>
          <DialogDescription>
            {name} has ${balance.toFixed(2)} in trust. Only move money for work done and invoiced, and transfer the same amount in your bank.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-[13px]">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Amount</span>
            <Input inputMode="decimal" value={amt} onChange={(e) => setAmt(e.target.value)} />
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">For invoice</span>
            <select value={inv} onChange={(e) => setInv(e.target.value)} className="h-9 rounded-lg border bg-background px-3">
              <option value="">No invoice</option>
              {invoices.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.number}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Memo (optional)</span>
            <Input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Stage 1 fees on lodgement" />
          </label>
          <div className="flex justify-end">
            <Button className="rounded-full" disabled={pending} onClick={() => run(() => transferToOffice(clientId, Number(amt), inv || null, memo), () => "Moved to office", () => setOpen(false))}>
              {pending ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />} Move ${Number(amt || 0).toFixed(2)}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Month-end: closing balance from the trust bank statement against the cashbook and client ledgers. */
export function Reconcile({ cashbook, clientTotal, defaultDate }: { cashbook: number; clientTotal: number; defaultDate: string }) {
  const [date, setDate] = useState(defaultDate);
  const [bank, setBank] = useState("");
  const [notes, setNotes] = useState("");
  const { pending, run } = useRun();
  const diff = bank ? Number(bank) - cashbook : null;
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4 text-[13px]">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Scale className="size-4" /> Reconcile the trust account
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="text-muted-foreground">Bank statement date</span>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="grid gap-1.5">
          <span className="text-muted-foreground">Closing balance on the statement</span>
          <Input inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="0.00" />
        </label>
      </div>
      <div className="grid gap-1 rounded-xl bg-muted/40 p-3">
        <p className="flex justify-between">
          <span className="text-muted-foreground">Trust cashbook (all trust entries, today)</span>
          <span className="tabular-nums">${cashbook.toFixed(2)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-muted-foreground">Total of client trust balances</span>
          <span className="tabular-nums">${clientTotal.toFixed(2)}</span>
        </p>
        {diff != null ? (
          <p className={`flex justify-between font-medium ${Math.abs(diff) < 0.005 ? "text-emerald-500" : "text-amber-500"}`}>
            <span>Bank minus cashbook</span>
            <span className="tabular-nums">${diff.toFixed(2)}</span>
          </p>
        ) : null}
      </div>
      <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes: explain any difference (e.g. deposit of $500 on the 31st not yet on the statement)" />
      <div className="flex justify-end">
        <Button className="rounded-full" disabled={pending || !bank} onClick={() => run(() => saveReconciliation(date, Number(bank), notes), () => "Reconciliation saved", () => setBank(""))}>
          {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Save reconciliation
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">The saved reconciliation uses trust entries up to the statement date. All three figures should agree; a negative client balance or an unexplained difference needs fixing.</p>
    </div>
  );
}
