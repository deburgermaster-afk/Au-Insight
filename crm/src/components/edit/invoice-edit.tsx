"use client";

import { Ban, Loader2, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { updateInvoice, voidInvoice } from "@/lib/record-actions";

type Item = { description: string; quantity: number; unitPrice: number; gst: boolean; disbursement?: boolean };

/** Change an unpaid invoice's lines, due date and notes, or void it. */
export function EditInvoice({ id, number, items, dueAt, notes }: { id: string; number: string; items: Item[]; dueAt: string | null; notes: string | null }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(items.map((i, k) => ({ ...i, k })));
  const [due, setDue] = useState(dueAt ?? "");
  const [note, setNote] = useState(notes ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  const sub = rows.reduce((a, r) => a + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 1), 0);
  const gst = rows.filter((r) => r.gst).reduce((a, r) => a + (Number(r.unitPrice) || 0) * (Number(r.quantity) || 1) * 0.1, 0);
  const set = (k: number, patch: Partial<Item>) => setRows((x) => x.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const done = (ok: string) => {
    toast.success(ok);
    setOpen(false);
    router.refresh();
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="ghost" aria-label={`Edit ${number}`}>
          <Pencil />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {number}</DialogTitle>
          <DialogDescription>Unpaid invoices can be changed. Once money is received, issue a new invoice or credit instead.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          {rows.map((r) => (
            <div key={r.k} className="grid grid-cols-[1fr_70px_110px_auto_auto] items-center gap-2">
              <Input value={r.description} onChange={(e) => set(r.k, { description: e.target.value })} placeholder="Description" />
              <Input value={String(r.quantity)} onChange={(e) => set(r.k, { quantity: Number(e.target.value) || 1 })} inputMode="numeric" aria-label="Quantity" />
              <Input value={String(r.unitPrice)} onChange={(e) => set(r.k, { unitPrice: Number(e.target.value) || 0 })} inputMode="decimal" aria-label="Unit price" />
              <label className="flex items-center gap-1 text-[12px]">
                <input type="checkbox" checked={r.gst} onChange={(e) => set(r.k, { gst: e.target.checked })} /> GST
              </label>
              <Button size="icon-xs" variant="ghost" onClick={() => setRows((x) => x.filter((y) => y.k !== r.k))}>
                <X />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setRows((x) => [...x, { description: "", quantity: 1, unitPrice: 0, gst: true, k: Date.now() }])}>
            <Plus /> Add line
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="grid gap-1 text-[12px]">
              Due
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            </label>
            <label className="grid gap-1 text-[12px]">
              Notes
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          </div>
          <p className="text-right text-[13px] tabular-nums">
            Subtotal ${sub.toFixed(2)} · GST ${gst.toFixed(2)} · <span className="font-semibold">Total ${(sub + gst).toFixed(2)}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-500"
            disabled={pending}
            onClick={() => {
              const reason = prompt(`Why is ${number} being voided?`);
              if (reason) start(async () => {
                const r = await voidInvoice(id, reason);
                if (!r.ok) return void toast.error(r.error);
                done("Invoice voided");
              });
            }}
          >
            <Ban /> Void
          </Button>
          <Button
            className="ml-auto rounded-full"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await updateInvoice(id, { items: rows.map((x) => ({ description: x.description, quantity: x.quantity, unitPrice: x.unitPrice, gst: x.gst })), dueAt: due || null, notes: note || null });
                if (!r.ok) return void toast.error(r.error);
                done("Invoice updated");
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
