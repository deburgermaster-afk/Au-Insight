import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decrypt } from "@/lib/secure";
import { confirmCheckout, PROVIDERS, type ProviderKey, type Secrets } from "./providers";

export type Attempt = typeof s.paymentAttempts.$inferSelect;
export const methodLabel = (p: string) => (p === "bank" ? "Bank transfer" : (PROVIDERS[p as ProviderKey]?.name ?? p));

/** The agency's connected providers (with decrypted secrets; server use only). */
export async function providersFor(agencyId: string) {
  const rows = await db.select().from(s.paymentProviders).where(eq(s.paymentProviders.agencyId, agencyId));
  return rows.map((r) => ({ ...r, key: r.provider as ProviderKey, secretValues: (r.secrets ? JSON.parse(decrypt(r.secrets)) : {}) as Secrets }));
}

/**
 * Records money received for an attempt: ledger receipt (trust or office, as the agency chose),
 * invoice paid amount and status, timeline. Safe to call twice: only the first call records.
 */
export async function recordReceipt(a: Attempt, opts: { amount: number; reference: string | null; by: { id: string | null; name: string }; note?: string | null }) {
  const [claimed] = await db
    .update(s.paymentAttempts)
    .set({ status: "paid", reviewedBy: opts.by.id, reviewedByName: opts.by.name, reviewedAt: new Date(), reviewNote: opts.note ?? null, updatedAt: new Date() })
    .where(and(eq(s.paymentAttempts.id, a.id), inArray(s.paymentAttempts.status, ["pending", "review"])))
    .returning();
  if (!claimed) return false;
  const [[inv], [profile]] = await Promise.all([
    db.select().from(s.invoices).where(eq(s.invoices.id, a.invoiceId)),
    db.select({ account: s.agencyProfile.paymentsAccount }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, a.agencyId)),
  ]);
  const account = profile?.account === "office" ? "office" : "trust";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const [led] = await db
    .insert(s.ledger)
    .values({ agencyId: a.agencyId, clientId: a.clientId, invoiceId: a.invoiceId, account, kind: "receipt", amount: opts.amount.toFixed(2), method: methodLabel(a.provider), reference: [inv?.number, opts.reference].filter(Boolean).join(" · ").slice(0, 200), occurredAt: today, memo: opts.note && opts.note !== opts.reference ? opts.note : null })
    .returning({ id: s.ledger.id });
  await db.update(s.paymentAttempts).set({ ledgerId: led.id }).where(eq(s.paymentAttempts.id, a.id));
  if (inv) {
    const paid = Number(inv.paid) + opts.amount;
    await db.update(s.invoices).set({ paid: paid.toFixed(2), status: paid + 0.004 >= Number(inv.total) ? "paid" : "partial" }).where(eq(s.invoices.id, inv.id));
    await db.insert(s.activities).values({ agencyId: a.agencyId, clientId: a.clientId, matterId: inv.matterId, kind: "invoice", title: `Payment received for ${inv.number}`, body: `$${opts.amount.toFixed(2)} by ${methodLabel(a.provider)} into the ${account} account`, actorId: opts.by.id, actorName: opts.by.name });
  }
  return true;
}

/** Asks the provider about a card checkout and records it if paid. */
export async function confirmAttempt(a: Attempt) {
  if (a.status !== "pending" || !a.externalId || a.provider === "bank" || a.provider === "zeller") return a.status;
  const [p] = (await providersFor(a.agencyId)).filter((x) => x.key === a.provider);
  if (!p) return "pending";
  const r = await confirmCheckout(p.key, p.mode as "live" | "test", p.secretValues, a.externalId);
  if (!r.paid) return "pending";
  await recordReceipt(a, { amount: r.amount ?? Number(a.amount), reference: r.reference ?? null, by: { id: null, name: methodLabel(a.provider) } });
  return "paid";
}

/** Trust balances per client (receipts in, everything else out), from the whole trust ledger. */
export async function trustByClient(agencyId: string) {
  const rows = await db
    .select({ clientId: s.ledger.clientId, kind: s.ledger.kind, amount: s.ledger.amount, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.ledger)
    .leftJoin(s.clients, eq(s.clients.id, s.ledger.clientId))
    .where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.account, "trust")));
  const map = new Map<string, { clientId: string | null; name: string; balance: number }>();
  for (const r of rows) {
    const k = r.clientId ?? "none";
    const cur = map.get(k) ?? { clientId: r.clientId, name: r.first ? `${r.first} ${r.last}` : "No client", balance: 0 };
    cur.balance += (r.kind === "receipt" ? 1 : -1) * Number(r.amount);
    map.set(k, cur);
  }
  return [...map.values()].map((x) => ({ ...x, balance: Math.round(x.balance * 100) / 100 })).sort((a, b) => a.name.localeCompare(b.name));
}
