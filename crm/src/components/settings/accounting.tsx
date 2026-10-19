"use client";

import { Download, Loader2, RefreshCw, Save } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { saveAccountingSettings, syncXeroNow } from "@/lib/accounting-actions";

type Settings = { salesAccount: string; disbursementAccount: string; bankAccount: string; autoSync: boolean };

export function AccountingForm({ value, canEdit }: { value: Settings; canEdit: boolean }) {
  const [v, setV] = useState(value);
  const [pending, start] = useTransition();
  const field = (key: "salesAccount" | "disbursementAccount" | "bankAccount", label: string, hint: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={v[key]} disabled={!canEdit} onChange={(e) => setV({ ...v, [key]: e.target.value })} className="font-mono" />
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  );
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        {field("salesAccount", "Professional fees", "Xero default 200 Sales")}
        {field("disbursementAccount", "Disbursements", "Government charges passed on. Default 260")}
        {field("bankAccount", "Bank account for receipts", "Office bank account. Default 090")}
      </div>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        <span>
          <span className="block font-medium">Sync automatically</span>
          <span className="block text-xs text-muted-foreground">Sent invoices and office receipts go to Xero every 10 minutes. Drafts and trust money stay in Lodgely.</span>
        </span>
        <Switch checked={v.autoSync} disabled={!canEdit} onCheckedChange={(autoSync) => setV({ ...v, autoSync })} />
      </label>
      {canEdit ? (
        <Button
          className="justify-self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveAccountingSettings(v);
              if (!r.ok) toast.error(r.error);
              else toast.success("Accounting settings saved");
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
        </Button>
      ) : null}
    </div>
  );
}

export function SyncNowButton({ disabled }: { disabled?: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending || disabled}
      onClick={() =>
        start(async () => {
          const r = await syncXeroNow();
          if (!r.ok) toast.error(r.error);
          else toast.success(r.summary ?? "Synced");
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Sync now
    </Button>
  );
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export function ExportForm() {
  const now = new Date();
  // Default to last financial quarter's start through today.
  const [from, setFrom] = useState(iso(new Date(now.getFullYear(), now.getMonth() - 3, 1)));
  const [to, setTo] = useState(iso(now));
  const href = (kind: string) => `/api/accounting/export?kind=${kind}&from=${from}&to=${to}`;
  return (
    <div className="grid gap-4">
      <div className="grid max-w-md grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="exFrom">From</Label>
          <Input id="exFrom" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="exTo">To</Label>
          <Input id="exTo" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <ExportLink href={href("myob-sales")} title="MYOB service sales" body="File → Import Data → Sales → Service Sales" />
        <ExportLink href={href("myob-receipts")} title="MYOB customer payments" body="File → Import Data → Receivables → Receive Payments" />
        <ExportLink href={href("csv")} title="Invoices CSV" body="For your accountant or any other software" />
      </div>
      <p className="text-xs text-muted-foreground">Sent, part-paid, paid and overdue invoices issued in the range. MYOB files are tab-separated with field names in the first row, so MYOB matches the columns itself. Only office receipts are included: trust money stays out of your books until it&apos;s transferred.</p>
    </div>
  );
}

function ExportLink({ href, title, body }: { href: string; title: string; body: string }) {
  return (
    <a href={href} className="flex items-start gap-3 rounded-lg border p-3 transition hover:bg-muted/50">
      <Download className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-[11px] text-muted-foreground">{body}</span>
      </span>
    </a>
  );
}
