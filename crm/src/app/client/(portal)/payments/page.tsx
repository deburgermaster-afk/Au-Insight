import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { requireClient } from "@/lib/client-auth";
import { portalPayments } from "@/lib/client-data";
import { aud, dmy } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Payments" };

export default async function Payments() {
  const c = await requireClient();
  const { invoices, receipts } = await portalPayments(c);
  const total = invoices.reduce((t, r) => t + Number(r.i.total), 0);
  const paid = invoices.reduce((t, r) => t + Number(r.i.paid), 0);
  const owing = total - paid;
  return (
    <div className="grid gap-3">
      <h1 className="px-0.5 pt-1 text-lg font-semibold tracking-tight">Payments</h1>
      <section className="rounded-xl border bg-card p-3">
        <p className="text-[11px] text-muted-foreground">To pay</p>
        <p className="text-2xl font-semibold tabular-nums">{aud(owing, 2)}</p>
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="bg-emerald-500" style={{ width: `${total ? (paid / total) * 100 : 0}%` }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
          <span>Paid {aud(paid, 2)}</span>
          <span>Invoiced {aud(total, 2)}</span>
        </div>
      </section>

      <section className="grid gap-1.5">
        <h2 className="px-0.5 text-xs font-medium text-muted-foreground">Invoices</h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-card">
          {invoices.map(({ i, matter }) => {
            const left = Number(i.total) - Number(i.paid);
            const overdue = left > 0 && i.dueAt && i.dueAt < new Date().toISOString().slice(0, 10);
            return (
              <li key={i.id}>
                <Link href={`/client/payments/${i.id}`} className="flex items-center gap-2.5 px-3 py-2.5 active:bg-muted/50">
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-[13px] font-medium">
                      {i.number}
                      <Badge variant={left <= 0 ? "secondary" : overdue ? "destructive" : "outline"} className={cn("h-4 px-1.5 text-[10px]", left <= 0 && "text-emerald-500")}>
                        {left <= 0 ? "Paid" : overdue ? "Overdue" : Number(i.paid) > 0 ? "Part paid" : "Due"}
                      </Badge>
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {matter ?? "General"} · due {dmy(i.dueAt)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[13px] font-medium tabular-nums">{aud(left > 0 ? left : i.total, 2)}</span>
                    <span className="block text-[10px] text-muted-foreground">{left > 0 ? `of ${aud(i.total, 2)}` : "total"}</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
          {!invoices.length ? <li className="p-6 text-center text-xs text-muted-foreground">No invoices yet.</li> : null}
        </ul>
      </section>

      {receipts.length ? (
        <section className="grid gap-1.5">
          <h2 className="px-0.5 text-xs font-medium text-muted-foreground">Payments received</h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">{r.method ? r.method[0].toUpperCase() + r.method.slice(1) : "Payment"}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {dmy(r.occurredAt)}
                    {r.account === "trust" ? " · held in trust" : ""}
                    {r.reference ? ` · ${r.reference}` : ""}
                  </span>
                </span>
                <span className="text-[13px] font-medium text-emerald-500 tabular-nums">{aud(r.amount, 2)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
