import { ArrowLeft } from "lucide-react";
import { and, desc, eq, inArray } from "drizzle-orm";
import { Suspense } from "react";
import { PayOptions } from "@/components/portal/pay-options";
import { db, schema as s } from "@/db";
import { PROVIDERS, type ProviderKey } from "@/lib/payments/providers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/portal/copy";
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
  const left = Math.round((Number(i.total) - Number(i.paid)) * 100) / 100;
  const p = c.profile;
  const [providers, attempts] = await Promise.all([
    db.select({ provider: s.paymentProviders.provider, mode: s.paymentProviders.mode, enabled: s.paymentProviders.enabled, status: s.paymentProviders.status }).from(s.paymentProviders).where(eq(s.paymentProviders.agencyId, c.client.agencyId)),
    db.select({ id: s.paymentAttempts.id, provider: s.paymentAttempts.provider, status: s.paymentAttempts.status, amount: s.paymentAttempts.amount, createdAt: s.paymentAttempts.createdAt, reviewNote: s.paymentAttempts.reviewNote }).from(s.paymentAttempts).where(and(eq(s.paymentAttempts.invoiceId, i.id), eq(s.paymentAttempts.clientId, c.client.id), inArray(s.paymentAttempts.status, ["review", "rejected"]))).orderBy(desc(s.paymentAttempts.createdAt)),
  ]);
  const live = providers.filter((x) => x.enabled && x.status === "active");
  const cards = live.filter((x) => x.provider !== "zeller").map((x) => ({ key: x.provider, name: PROVIDERS[x.provider as ProviderKey]?.name ?? x.provider, test: x.mode === "test" }));
  const zellerOn = live.some((x) => x.provider === "zeller");
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

      {left > 0 || attempts.some((a) => a.status === "review") ? (
        <Suspense>
          <PayOptions
            invoiceId={i.id}
            number={i.number}
            left={Math.max(0, left)}
            agencyId={c.client.agencyId}
            clientId={c.client.id}
            cards={left > 0 ? cards : []}
            zeller={left > 0 && zellerOn ? i.zellerLink : null}
            bank={p?.bankBsb && p.bankAccount ? { name: p.bankAccountName ?? p.legalName ?? c.agency.name, bsb: p.bankBsb, account: p.bankAccount } : null}
            bankOn={left > 0 && (p?.bankTransferEnabled ?? true)}
            attempts={attempts}
          />
        </Suspense>
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
              Ask a question
            </Button>
          }
        />
      ) : null}
    </div>
  );
}
