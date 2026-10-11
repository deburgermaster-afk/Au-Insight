import { connection } from "next/server";
import { CircleDollarSign, HandCoins, Landmark, Receipt } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
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
import { aud, dmy, todayIso } from "@/lib/format";

export const metadata = { title: "Billing & trust" };

async function Billing() {
  await connection();
  const { invoices, ledger, trustBalance } = await getBilling();
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
          <StatCard icon={CircleDollarSign} label="Outstanding" value={Math.round(total - paid)} prefix="$" tone="amber" hint={`${overdue.length} overdue`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard icon={Landmark} label="Held in trust" value={Math.round(trustBalance)} prefix="$" tone="sky" hint="Client money, not yet earned" />
        </StaggerItem>
      </Stagger>
      <FadeIn delay={0.08}>
        <Tabs defaultValue="invoices" className="gap-4">
          <TabsList>
            <TabsTrigger value="invoices">Invoices</TabsTrigger>
            <TabsTrigger value="ledger">Ledger</TabsTrigger>
          </TabsList>
          <TabsContent value="invoices">
            <Section bodyClassName="p-0 sm:p-0">
              <ul>
                {invoices.map(({ invoice: i, clientFirst, clientLast }) => {
                  const owing = Number(i.total) - Number(i.paid);
                  return (
                    <li key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 border-b px-4 py-3 last:border-0 sm:grid-cols-[7rem_minmax(0,1fr)_7rem_7rem_6rem_7rem] sm:px-5">
                      <span className="font-mono text-sm">{i.number}</span>
                      <Pill t={invoiceTone[i.status]} className="justify-self-end sm:order-5 sm:justify-self-start">
                        {label(i.status)}
                      </Pill>
                      <Link href={`/app/clients/${i.clientId}`} className="truncate text-sm hover:text-primary sm:order-2">
                        {clientFirst} {clientLast}
                      </Link>
                      <span className="text-right text-sm tabular-nums sm:order-3">{aud(i.total, 2)}</span>
                      <span className="hidden text-xs text-muted-foreground sm:order-4 sm:block">Due {dmy(i.dueAt)}</span>
                      <div className="col-span-2 justify-self-end sm:order-6 sm:col-span-1">
                        {owing > 0.005 && i.status !== "void" ? (
                          <RecordPaymentDialog
                            invoiceId={i.id}
                            outstanding={owing}
                            trigger={
                              <Button size="xs" variant="outline">
                                Record payment
                              </Button>
                            }
                          />
                        ) : (
                          <span className="text-xs text-emerald-600">Paid in full</span>
                        )}
                      </div>
                    </li>
                  );
                })}
                {!invoices.length ? <li className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</li> : null}
              </ul>
            </Section>
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

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing & trust"
        description="Invoices with GST, and client money held in trust kept apart from office money."
        actions={<WithPickers render={(p) => <NewInvoiceDialog pickers={p} />} />}
      />
      <Suspense fallback={<PageSkeleton />}>
        <Billing />
      </Suspense>
    </>
  );
}
