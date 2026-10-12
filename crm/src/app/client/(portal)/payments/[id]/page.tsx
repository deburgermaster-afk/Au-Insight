import { ArrowLeft, Landmark } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyValue, PrintButton } from "@/components/portal/copy";
import { MessageSheet } from "@/components/portal/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireClient } from "@/lib/client-auth";
import { portalInvoice } from "@/lib/client-data";
import { aud, dmy } from "@/lib/format";

export const metadata = { title: "Invoice" };

export default async function Invoice({ params }: PageProps<"/client/payments/[id]">) {
  const { id } = await params;
  const c = await requireClient();
  const d = await portalInvoice(c, id);
  if (!d) notFound();
  const { i } = d;
  const left = Number(i.total) - Number(i.paid);
  const p = c.profile;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/client/payments" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Payments
        </Link>
        <PrintButton />
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-start justify-between gap-2 border-b p-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Tax invoice</p>
            <h1 className="text-base font-semibold">{i.number}</h1>
            <p className="text-[11px] text-muted-foreground">
              Issued {dmy(i.issuedAt)} · due {dmy(i.dueAt)}
            </p>
          </div>
          <Badge variant={left <= 0 ? "secondary" : "outline"} className={left <= 0 ? "text-emerald-500" : "text-amber-500"}>
            {left <= 0 ? "Paid" : `${aud(left, 2)} to pay`}
          </Badge>
        </div>
        <div className="grid grid-cols-2 gap-3 border-b p-3 text-[11px]">
          <div>
            <p className="text-muted-foreground">From</p>
            <p className="font-medium">{p?.legalName ?? c.agency.name}</p>
            {p?.abn ? <p className="text-muted-foreground">ABN {p.abn}</p> : null}
            {p?.marn ? <p className="text-muted-foreground">MARN {p.marn}</p> : null}
          </div>
          <div>
            <p className="text-muted-foreground">To</p>
            <p className="font-medium">
              {c.client.firstName} {c.client.lastName}
            </p>
            {d.matter ? <p className="text-muted-foreground">{d.ref} · {d.matter}</p> : null}
          </div>
        </div>
        <ul className="divide-y">
          {i.items.map((l, n) => (
            <li key={n} className="flex items-start gap-2 px-3 py-2 text-[13px]">
              <span className="min-w-0 flex-1">
                {l.description}
                {l.disbursement ? <span className="block text-[11px] text-muted-foreground">Disbursement · no GST</span> : null}
              </span>
              <span className="tabular-nums">{aud(l.unitPrice * l.quantity, 2)}</span>
            </li>
          ))}
        </ul>
        <dl className="grid gap-1 border-t bg-muted/20 p-3 text-[13px]">
          <div className="flex justify-between text-muted-foreground">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{aud(i.subtotal, 2)}</dd>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <dt>GST</dt>
            <dd className="tabular-nums">{aud(i.gst, 2)}</dd>
          </div>
          <div className="flex justify-between font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{aud(i.total, 2)}</dd>
          </div>
          {Number(i.paid) > 0 ? (
            <div className="flex justify-between text-emerald-500">
              <dt>Paid</dt>
              <dd className="tabular-nums">−{aud(i.paid, 2)}</dd>
            </div>
          ) : null}
        </dl>
      </section>

      {left > 0 ? (
        <section className="overflow-hidden rounded-xl border bg-card">
          <p className="flex items-center gap-2 border-b px-3 py-2 text-xs font-medium">
            <Landmark className="size-3.5" /> Pay by bank transfer
          </p>
          {p?.bankBsb && p.bankAccount ? (
            <div className="divide-y">
              <CopyValue label="Account name" value={p.bankAccountName ?? p.legalName ?? c.agency.name} />
              <CopyValue label="BSB" value={p.bankBsb} />
              <CopyValue label="Account" value={p.bankAccount} />
              <CopyValue label="Reference" value={i.number} />
              <CopyValue label="Amount" value={left.toFixed(2)} />
            </div>
          ) : (
            <p className="p-3 text-xs text-muted-foreground">Your agent will send payment details. Use {i.number} as the reference.</p>
          )}
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Payments in advance are held in our client trust account until the work is done, as the Code of Conduct requires.</p>
        </section>
      ) : null}

      {d.receipts.length ? (
        <section className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b px-3 py-2 text-xs font-medium">Payments received</p>
          <ul className="divide-y">
            {d.receipts.map((r) => (
              <li key={r.id} className="flex justify-between px-3 py-2 text-[13px]">
                <span>
                  {dmy(r.occurredAt)} <span className="text-[11px] text-muted-foreground">{r.method}</span>
                </span>
                <span className="text-emerald-500 tabular-nums">{aud(r.amount, 2)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {left > 0 ? (
        <MessageSheet
          to={c.agency.name}
          subject={`Payment for ${i.number}`}
          trigger={
            <Button variant="outline" className="h-10 rounded-full print:hidden">
              I've paid / ask a question
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
