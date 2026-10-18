import { requireClient } from "@/lib/client-auth";
import { portalPayments } from "@/lib/client-data";
import { aud, dmy } from "@/lib/format";
import { type Folder, FolderView } from "@/components/portal/folders";
import { db, schema as s } from "@/db";
import { eq as eqOp, inArray } from "drizzle-orm";

export const metadata = { title: "Payments" };

export default async function Payments() {
  const c = await requireClient();
  const { invoices, receipts } = await portalPayments(c);
  const total = invoices.reduce((t, r) => t + Number(r.i.total), 0);
  const paid = invoices.reduce((t, r) => t + Number(r.i.paid), 0);
  const owing = total - paid;
  // Folders: the agency's own fees, and tuition paid to each institution through the agency.
  const tuition = invoices.length ? await db.select({ invoiceId: s.tuitionPayments.invoiceId, inst: s.institutions.name }).from(s.tuitionPayments).leftJoin(s.institutions, eqOp(s.institutions.id, s.tuitionPayments.institutionId)).where(inArray(s.tuitionPayments.invoiceId, invoices.map((r) => r.i.id))) : [];
  const instOf = new Map(tuition.map((t) => [t.invoiceId, t.inst ?? "Institution"]));
  const today = new Date().toISOString().slice(0, 10);
  const palette = ["#7c3aed", "#0ea5e9", "#f97316", "#10b981", "#e11d48", "#14b8a6"];
  const mark = (n: string) => n.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "•";
  const groups = new Map<string, Folder>();
  for (const { i, matter } of invoices) {
    const name = instOf.get(i.id) ?? `${c.agency.name} fees`;
    const left = Number(i.total) - Number(i.paid);
    const state = left <= 0.005 ? "paid" : i.dueAt && i.dueAt < today ? "overdue" : "due";
    if (!groups.has(name)) groups.set(name, { key: name, name: instOf.has(i.id) ? name : "Agency fees", mark: mark(instOf.has(i.id) ? name : c.agency.name), color: palette[groups.size % palette.length], items: [] });
    groups.get(name)!.items.push({ id: i.id, title: i.number, sub: `${instOf.has(i.id) ? "Tuition" : (matter ?? "General")} · ${state === "paid" ? "paid" : `due ${dmy(i.dueAt)}`}`, right: aud(left > 0 ? left : i.total, 2), rightSub: left > 0 ? `of ${aud(i.total, 2)}` : "paid", state, href: `/client/payments/${i.id}` });
  }
  const folders = [...groups.values()];
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

      <FolderView folders={folders} filters={[{ key: "all", label: "All", states: ["paid", "due", "overdue"] }, { key: "paid", label: "Paid", states: ["paid"] }, { key: "unpaid", label: "Unpaid", states: ["due", "overdue"] }]} empty="Nothing here." />


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
