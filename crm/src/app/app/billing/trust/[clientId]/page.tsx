import { and, asc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { PrintButton } from "@/components/portal/copy";
import { db, schema as s } from "@/db";
import { aud, dmy } from "@/lib/format";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Trust statement" };

/** A client's trust account statement: every receipt and withdrawal with a running balance. */
async function Statement({ params }: PageProps<"/app/billing/trust/[clientId]">) {
  await connection();
  const [{ clientId }, ctx] = await Promise.all([params, getCtx()]);
  const [[c], [p], rows] = await Promise.all([
    db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId))),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId)),
    db.select().from(s.ledger).where(and(eq(s.ledger.agencyId, ctx.agencyId), eq(s.ledger.clientId, clientId), eq(s.ledger.account, "trust"))).orderBy(asc(s.ledger.occurredAt), asc(s.ledger.createdAt)),
  ]);
  if (!c) notFound();
  const lines = rows.reduce<(typeof rows[number] & { inn: boolean; amt: number; bal: number })[]>((acc, r) => {
    const amt = Number(r.amount);
    const inn = r.kind === "receipt";
    return [...acc, { ...r, inn, amt, bal: (acc.at(-1)?.bal ?? 0) + (inn ? amt : -amt) }];
  }, []);
  const bal = lines.at(-1)?.bal ?? 0;
  const totalIn = lines.filter((l) => l.inn).reduce((t, l) => t + l.amt, 0);
  const totalOut = lines.filter((l) => !l.inn).reduce((t, l) => t + l.amt, 0);
  const today = new Date().toLocaleDateString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "long", year: "numeric" });
  return (
    <div className="mx-auto grid max-w-4xl gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/app/billing?tab=trust" className="flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Trust
        </Link>
        <PrintButton />
      </div>
      <article className="grid gap-5 rounded-2xl border bg-card p-6 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">{p?.legalName ?? ctx.agencyName}</p>
            <p className="text-xs text-muted-foreground">{[p?.abn ? `ABN ${p.abn}` : null, p?.marn ? `MARN ${p.marn}` : null].filter(Boolean).join(" · ")}</p>
            <p className="text-xs text-muted-foreground">{p?.bankAccountName ?? "Client trust account"}{p?.bankBsb ? ` · BSB ${p.bankBsb}` : ""}</p>
          </div>
          <div className="text-right">
            <h1 className="text-lg font-semibold">Trust account statement</h1>
            <p className="text-xs text-muted-foreground">As at {today}</p>
          </div>
        </header>
        <div className="rounded-xl bg-muted/40 p-3 text-sm">
          <p className="font-medium">
            {c.firstName} {c.lastName}
          </p>
          {c.address ? <p className="text-xs text-muted-foreground">{[c.address, c.city, c.state].filter(Boolean).join(", ")}</p> : null}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-[13px]">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Date</th>
                <th className="py-2 pr-3 font-medium">Details</th>
                <th className="py-2 pr-3 text-right font-medium">Received</th>
                <th className="py-2 pr-3 text-right font-medium">Paid out</th>
                <th className="py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{dmy(l.occurredAt)}</td>
                  <td className="py-2 pr-3">
                    {l.kind === "transfer" ? "Fees earned, moved to office" : l.kind === "refund" ? "Refund to you" : l.kind === "receipt" ? `Received by ${l.method ?? "payment"}` : (l.method ?? "Payment")}
                    {l.reference ? <span className="text-muted-foreground"> · {l.reference}</span> : null}
                    {l.memo ? <span className="block text-xs text-muted-foreground">{l.memo}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.inn ? aud(l.amt, 2) : ""}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.inn ? "" : aud(l.amt, 2)}</td>
                  <td className="py-2 text-right font-medium tabular-nums">{aud(l.bal, 2)}</td>
                </tr>
              ))}
              {!lines.length ? (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-muted-foreground">
                    No trust transactions for this client.
                  </td>
                </tr>
              ) : null}
            </tbody>
            <tfoot className="border-t font-semibold">
              <tr>
                <td className="py-2" colSpan={2}>
                  Totals
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{aud(totalIn, 2)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{aud(totalOut, 2)}</td>
                <td className="py-2 text-right tabular-nums">{aud(bal, 2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-muted-foreground">Money you pay in advance is held in our client trust account until it is earned or paid on your behalf. Please tell us within 14 days if anything here looks wrong.</p>
      </article>
    </div>
  );
}

export default function TrustStatementPage(props: PageProps<"/app/billing/trust/[clientId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="billing">
        <Statement {...props} />
      </Guard>
    </Suspense>
  );
}
