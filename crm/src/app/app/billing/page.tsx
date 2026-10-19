import { connection } from "next/server";
import { CircleDollarSign, HandCoins, Landmark, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { invoiceTone, label, Pill } from "@/components/app/badges";
import { FadeIn, Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { StatCard } from "@/components/app/stat-card";
import { WithPickers } from "@/components/app/with-pickers";
import { NewInvoiceDialog, RecordPaymentDialog } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getBilling } from "@/lib/data";
import { and, desc, eq, gte, or } from "drizzle-orm";
import { db, schema as sch } from "@/db";
import { fileUrl } from "@/components/mail/file-icon";
import { Reconcile, RecheckPayment, ReviewPayment, TransferToOffice, ZellerLink } from "@/components/billing/payments";
import { methodLabel, trustByClient } from "@/lib/payments";
import { getCtx } from "@/lib/session";
import { ago, aud, dmy, initials, todayIso } from "@/lib/format";

export const metadata = { title: "Billing & trust" };

const weekAgo = () => new Date(Date.now() - 7 * 864e5);

async function Billing({ tab }: { tab: string }) {
  await connection();
  const ctx = await getCtx();
  const [{ invoices, ledger, trustBalance }, attempts, providers, balances, recs] = await Promise.all([
    getBilling(),
    db
      .select({ a: sch.paymentAttempts, number: sch.invoices.number, first: sch.clients.firstName, last: sch.clients.lastName })
      .from(sch.paymentAttempts)
      .innerJoin(sch.invoices, eq(sch.invoices.id, sch.paymentAttempts.invoiceId))
      .innerJoin(sch.clients, eq(sch.clients.id, sch.paymentAttempts.clientId))
      .where(and(eq(sch.paymentAttempts.agencyId, ctx.agencyId), or(eq(sch.paymentAttempts.status, "review"), and(eq(sch.paymentAttempts.status, "pending"), gte(sch.paymentAttempts.createdAt, weekAgo())))))
      .orderBy(desc(sch.paymentAttempts.createdAt)),
    db.select({ provider: sch.paymentProviders.provider, enabled: sch.paymentProviders.enabled }).from(sch.paymentProviders).where(eq(sch.paymentProviders.agencyId, ctx.agencyId)),
    trustByClient(ctx.agencyId),
    db.select().from(sch.trustReconciliations).where(eq(sch.trustReconciliations.agencyId, ctx.agencyId)).orderBy(desc(sch.trustReconciliations.periodEnd), desc(sch.trustReconciliations.createdAt)).limit(12),
  ]);
  const zellerOn = providers.some((x) => x.provider === "zeller" && x.enabled);
  const review = attempts.filter((x) => x.a.status === "review");
  const pendingCards = attempts.filter((x) => x.a.status === "pending");
  const held = balances.filter((b) => Math.abs(b.balance) > 0.004);
  const clientTotal = balances.reduce((t, b) => t + b.balance, 0);
  const total = invoices.reduce((a, r) => a + Number(r.invoice.total), 0);
  const paid = invoices.reduce((a, r) => a + Number(r.invoice.paid), 0);
  const overdue = invoices.filter((r) => r.invoice.status !== "paid" && r.invoice.status !== "void" && r.invoice.dueAt && r.invoice.dueAt < todayIso());
  return (
    <div className="grid gap-6">
      <Stagger className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StaggerItem>
          <StatCard icon={Receipt} label="Billed" value={Math.round(total)} prefix="$" hint={`${invoices.length} invoices`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={HandCoins} label="Collected" value={Math.round(paid)} prefix="$" tone="emerald" hint={total ? `${Math.round((paid / total) * 100)}% of billed` : undefined} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={CircleDollarSign} label="Outstanding" value={Math.round(total - paid)} prefix="$" tone="rose" hint={`${overdue.length} overdue`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Landmark} label="Held in trust" value={Math.round(trustBalance)} prefix="$" tone="sky" hint="Client money, not yet earned" />
        </StaggerItem>
      </Stagger>
      <FadeIn delay={0.08}>
        <Tabs defaultValue={["invoices", "review", "trust", "reconcile", "ledger"].includes(tab) ? tab : "invoices"} className="gap-4">
          <TabsList>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="review">
              Payments to check
              {review.length ? <span className="ml-1.5 rounded-full bg-sky-500/15 px-1.5 text-[10px] text-sky-500">{review.length}</span> : null}
            </TabsTrigger>
            <TabsTrigger value="trust">Trust</TabsTrigger>
            <TabsTrigger value="reconcile">Reconciliation</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>
          <TabsContent value="review" className="grid gap-4">
            <Section title={`Waiting for you to check (${review.length})`} bodyClassName="p-0 sm:p-0">
              <ul>
                {review.map(({ a, number, first, last }) => (
                  <li key={a.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {first} {last} · <span className="font-mono">{number}</span>
                      </p>
                      <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {methodLabel(a.provider)} · uploaded {ago(a.createdAt)}
                        {a.clientNote ? ` · "${a.clientNote}"` : ""}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular-nums">{aud(a.amount, 2)}</span>
                    <ReviewPayment id={a.id} amount={Number(a.amount)} proofUrl={a.proofKey ? fileUrl(a.proofKey, a.proofName ?? "receipt") : null} isImage={/\.(png|jpe?g|gif|webp|heic)$/i.test(a.proofName ?? "")} />
                  </li>
                ))}
                {!review.length ? <li className="p-8 text-center text-sm text-muted-foreground">Nothing to check. When a client pays by bank transfer or Zeller and uploads a receipt, it shows here.</li> : null}
              </ul>
            </Section>
            {pendingCards.length ? (
              <Section title="Card checkouts not finished" bodyClassName="p-0 sm:p-0">
                <ul>
                  {pendingCards.map(({ a, number, first, last }) => (
                    <li key={a.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">
                          {first} {last} · <span className="font-mono">{number}</span>
                        </p>
                        <p className="text-xs text-muted-foreground" suppressHydrationWarning>
                          {methodLabel(a.provider)} · started {ago(a.createdAt)}
                        </p>
                      </div>
                      <span className="text-sm tabular-nums text-muted-foreground">{aud(a.amount, 2)}</span>
                      <RecheckPayment id={a.id} />
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
          </TabsContent>
          <TabsContent value="trust">
            <Section title="Money held in trust, by client" bodyClassName="p-0 sm:p-0">
              <ul>
                {held.map((b) => (
                  <li key={b.clientId ?? "none"} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                    <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                    <span className={`text-sm font-medium tabular-nums ${b.balance < 0 ? "text-rose-500" : ""}`}>{aud(b.balance, 2)}</span>
                    {b.clientId ? (
                      <>
                        <Button asChild size="xs" variant="ghost" className="rounded-full">
                          <Link href={`/app/billing/trust/${b.clientId}`}>Statement</Link>
                        </Button>
                        <TransferToOffice clientId={b.clientId} name={b.name} balance={b.balance} invoices={invoices.filter((r) => r.invoice.clientId === b.clientId).map((r) => ({ id: r.invoice.id, number: r.invoice.number }))} />
                      </>
                    ) : null}
                  </li>
                ))}
                {!held.length ? <li className="p-8 text-center text-sm text-muted-foreground">No client money held in trust.</li> : null}
              </ul>
            </Section>
          </TabsContent>
          <TabsContent value="reconcile" className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Reconcile cashbook={trustBalance} clientTotal={clientTotal} defaultDate={todayIso()} />
            <Section title="Past reconciliations" bodyClassName="p-0 sm:p-0">
              <ul>
                {recs.map((r) => (
                  <li key={r.id} className="grid gap-0.5 border-b px-4 py-3 text-[13px] last:border-0">
                    <p className="flex justify-between">
                      <span className="font-medium">{dmy(r.periodEnd)}</span>
                      <span className={Math.abs(Number(r.difference)) < 0.005 ? "text-emerald-500" : "text-amber-500"}>{Math.abs(Number(r.difference)) < 0.005 ? "Balanced" : `Difference ${aud(r.difference, 2)}`}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Bank {aud(r.bankBalance, 2)} · cashbook {aud(r.cashbookBalance, 2)} · clients {aud(r.clientTotal, 2)} · {r.reconciledByName}
                    </p>
                    {r.notes ? <p className="text-xs">{r.notes}</p> : null}
                  </li>
                ))}
                {!recs.length ? <li className="p-8 text-center text-sm text-muted-foreground">No reconciliations yet. Do one each month when the trust bank statement arrives.</li> : null}
              </ul>
            </Section>
          </TabsContent>
          <TabsContent value="invoices">
            <div className="overflow-x-auto rounded-xl border bg-card">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    {["Invoice #", "Client", "Issued", "Amount", "Status", "Due date", "Actions"].map((h) => (
                      <th key={h} className="border-r px-4 py-2.5 font-medium last:border-r-0 last:text-right">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.map(({ invoice: i, clientFirst, clientLast }) => {
                    const owing = Number(i.total) - Number(i.paid);
                    return (
                      <tr key={i.id} className="border-t transition hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 font-mono">
                            <Receipt className="size-3.5 text-muted-foreground" />
                            {i.number}
                            {i.xeroError ? (
                              <span title={`Xero: ${i.xeroError}`} className="rounded bg-rose-500/12 px-1 py-px font-sans text-[10px] text-rose-500">
                                Xero error
                              </span>
                            ) : i.xeroId ? (
                              <span title="Synced to Xero" className="rounded bg-sky-500/12 px-1 py-px font-sans text-[10px] text-sky-500">
                                Xero
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/app/clients/${i.clientId}`} className="flex items-center gap-2 hover:underline">
                            <span className="grid size-6 place-items-center rounded-full bg-muted text-[10px] font-semibold">{initials(`${clientFirst} ${clientLast}`)}</span>
                            {clientFirst} {clientLast}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{dmy(i.issuedAt)}</td>
                        <td className="px-4 py-3 tabular-nums">{aud(i.total, 2)}</td>
                        <td className="px-4 py-3">
                          <Pill t={invoiceTone[owing <= 0.005 ? "paid" : i.status]}>{label(owing <= 0.005 ? "paid" : i.status)}</Pill>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{dmy(i.dueAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {owing > 0.005 && i.status !== "void" && zellerOn ? <ZellerLink invoiceId={i.id} value={i.zellerLink} /> : null}
                          {owing > 0.005 && i.status !== "void" ? (
                            <RecordPaymentDialog invoiceId={i.id} outstanding={owing} trigger={<Button size="xs" variant="outline">Record payment</Button>} />
                          ) : (
                            <span className="text-xs text-muted-foreground">Paid in full</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!invoices.length ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-muted-foreground">
                        No invoices yet.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </TabsContent>
          <TabsContent value="ledger">
            <Section bodyClassName="p-0 sm:p-0">
              <ul>
                {ledger.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
                    <Pill t={l.account === "trust" ? "blue" : "violet"}>{label(l.account)}</Pill>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{l.memo ?? label(l.kind)}</p>
                      <p className="text-xs text-muted-foreground">
                        {dmy(l.occurredAt)} · {l.method ?? "—"}
                        {l.reference ? ` · ${l.reference}` : ""}
                      </p>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${l.kind === "receipt" ? "text-emerald-600" : "text-rose-600"}`}>
                      {l.kind === "receipt" ? "+" : "−"}
                      {aud(l.amount, 2)}
                    </span>
                  </li>
                ))}
                {!ledger.length ? <li className="p-8 text-center text-sm text-muted-foreground">No transactions yet.</li> : null}
              </ul>
            </Section>
          </TabsContent>
        </Tabs>
      </FadeIn>
    </div>
  );
}

async function BillingTab({ searchParams }: { searchParams: PageProps<"/app/billing">["searchParams"] }) {
  const sp = await searchParams;
  return <Billing tab={typeof sp.tab === "string" ? sp.tab : "invoices"} />;
}

export default function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  return (
    <>
      <PageHeader
        title="Billing & trust"
        description="Invoices with GST, and client money held in trust kept apart from office money."
        actions={<WithPickers render={(p) => <NewInvoiceDialog pickers={p} />} />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="billing">
          <BillingTab searchParams={searchParams} />
        </Guard>
      </Suspense>
    </>
  );
}
