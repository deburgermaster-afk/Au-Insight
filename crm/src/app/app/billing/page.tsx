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
import { aud, dmy, initials, todayIso } from "@/lib/format";

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
          <StatCard icon={CircleDollarSign} label="Outstanding" value={Math.round(total - paid)} prefix="$" tone="rose" hint={`${overdue.length} overdue`} />
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
