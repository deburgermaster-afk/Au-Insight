"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { mailEnabled, sendMail } from "@/lib/mail";
import { confirmAttempt, recordReceipt, trustByClient } from "@/lib/payments";
import { connectProvider, PROVIDERS, type ProviderKey } from "@/lib/payments/providers";
import { encrypt } from "@/lib/secure";
import { requireCap, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const isProvider = (p: string): p is ProviderKey => p in PROVIDERS;

/** Admin: connect a card provider. The credentials are checked with the provider before saving. */
export async function connectPaymentProvider(provider: string, secrets: Record<string, string>): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    if (!isProvider(provider)) return { ok: false, error: "Unknown provider." };
    const clean = Object.fromEntries(PROVIDERS[provider].fields.map((f) => [f.key, (secrets[f.key] ?? "").trim()]));
    if (Object.values(clean).some((v) => !v)) return { ok: false, error: "Fill in every field." };
    const c = await connectProvider(provider, clean);
    const values = { agencyId: ctx.agencyId, provider, enabled: true, status: "active", mode: c.mode, account: c.account, secrets: Object.keys(clean).length ? encrypt(JSON.stringify(clean)) : null, settings: c.settings, connectedBy: ctx.userId, lastError: null, updatedAt: new Date() };
    await db.insert(s.paymentProviders).values(values).onConflictDoUpdate({ target: [s.paymentProviders.agencyId, s.paymentProviders.provider], set: values });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "payment_provider", entityId: provider, detail: { account: c.account, mode: c.mode } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: c.mode };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectPaymentProvider(provider: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.delete(s.paymentProviders).where(and(eq(s.paymentProviders.agencyId, ctx.agencyId), eq(s.paymentProviders.provider, provider)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "payment_provider", entityId: provider });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function toggleProvider(provider: string, enabled: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.update(s.paymentProviders).set({ enabled }).where(and(eq(s.paymentProviders.agencyId, ctx.agencyId), eq(s.paymentProviders.provider, provider)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setPaymentPrefs(prefs: { bankTransfer?: boolean; account?: "trust" | "office" }): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db
      .update(s.agencyProfile)
      .set({ ...(prefs.bankTransfer === undefined ? {} : { bankTransferEnabled: prefs.bankTransfer }), ...(prefs.account ? { paymentsAccount: prefs.account } : {}) })
      .where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: attach (or clear) the Zeller Pay by Link for an invoice. */
export async function setZellerLink(invoiceId: string, url: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can change invoices.");
    const link = url.trim();
    if (link && !/^https:\/\/[\w.-]*(zeller|myzeller)\.[\w./?=&%#-]+$/i.test(link)) return { ok: false, error: "Paste the https:// payment link from Zeller." };
    await db.update(s.invoices).set({ zellerLink: link || null }).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, invoiceId)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: check a bank transfer or Zeller receipt against the bank, then approve (records it) or reject. */
export async function reviewPayment(attemptId: string, decision: "approve" | "reject", note: string, amount?: number): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can confirm payments.");
    const [a] = await db.select().from(s.paymentAttempts).where(and(eq(s.paymentAttempts.agencyId, ctx.agencyId), eq(s.paymentAttempts.id, attemptId)));
    if (!a || a.status !== "review") return { ok: false, error: "This payment isn't waiting for review." };
    if (decision === "approve") {
      const amt = amount && amount > 0 ? amount : Number(a.amount);
      await recordReceipt(a, { amount: amt, reference: note.trim() || null, by: { id: ctx.userId, name: ctx.name }, note: note.trim() || null });
    } else {
      if (!note.trim()) return { ok: false, error: "Tell the client why (they'll see this)." };
      await db.update(s.paymentAttempts).set({ status: "rejected", reviewedBy: ctx.userId, reviewedByName: ctx.name, reviewedAt: new Date(), reviewNote: note.trim() }).where(eq(s.paymentAttempts.id, a.id));
      const [[c], [inv], [box]] = await Promise.all([
        db.select().from(s.clients).where(eq(s.clients.id, a.clientId)),
        db.select({ number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.id, a.invoiceId)),
        db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared"))),
      ]);
      if (c?.email && box && mailEnabled() && !c.email.endsWith(".test"))
        await sendMail({ agencyId: ctx.agencyId, from: { address: box.address, name: ctx.agencyName }, to: [c.email], subject: `About your payment for ${inv?.number ?? "your invoice"}`, html: `<p>Hi ${c.firstName},</p><p>We couldn't match your payment for ${inv?.number ?? "your invoice"} yet: ${note.trim()}</p><p>You can upload another receipt in your client portal under Payments.</p>`, clientId: c.id, footer: `Sent by ${ctx.agencyName} via Lodgely` });
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "payment_attempt", entityId: a.id, detail: { decision } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: ask the card provider again about a checkout the client may have closed early. */
export async function recheckPayment(attemptId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing");
    const [a] = await db.select().from(s.paymentAttempts).where(and(eq(s.paymentAttempts.agencyId, ctx.agencyId), eq(s.paymentAttempts.id, attemptId)));
    if (!a) return { ok: false, error: "Not found." };
    const st = await confirmAttempt(a);
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: st };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: move earned money from trust to office for an invoice (two ledger lines, same day). */
export async function transferToOffice(clientId: string, amount: number, invoiceId: string | null, memo: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can move trust money.");
    if (!(amount > 0)) return { ok: false, error: "Enter an amount." };
    const bal = (await trustByClient(ctx.agencyId)).find((b) => b.clientId === clientId)?.balance ?? 0;
    if (amount > bal + 0.004) return { ok: false, error: `Only $${bal.toFixed(2)} is held in trust for this client. Trust balances can't go below zero.` };
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    const [inv] = invoiceId ? await db.select({ number: s.invoices.number }).from(s.invoices).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, invoiceId))) : [];
    const ref = inv?.number ?? "Fees earned";
    await db.insert(s.ledger).values([
      { agencyId: ctx.agencyId, clientId, invoiceId, account: "trust", kind: "transfer", amount: amount.toFixed(2), method: "Transfer to office", reference: ref, occurredAt: today, memo: memo.trim() || null },
      { agencyId: ctx.agencyId, clientId, invoiceId, account: "office", kind: "receipt", amount: amount.toFixed(2), method: "Transfer from trust", reference: ref, occurredAt: today, memo: memo.trim() || null },
    ]);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "invoice", title: `$${amount.toFixed(2)} moved from trust to office`, body: ref, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "trust_transfer", entityId: clientId, detail: { amount, invoiceId } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: record a month-end reconciliation of the trust bank account. */
export async function saveReconciliation(periodEnd: string, bankBalance: number, notes: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can reconcile trust.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd) || !Number.isFinite(bankBalance)) return { ok: false, error: "Enter the statement date and closing balance." };
    const rows = await db.select({ kind: s.ledger.kind, amount: s.ledger.amount, occurredAt: s.ledger.occurredAt, clientId: s.ledger.clientId }).from(s.ledger).where(and(eq(s.ledger.agencyId, ctx.agencyId), eq(s.ledger.account, "trust")));
    const upto = rows.filter((r) => r.occurredAt <= periodEnd);
    const cashbook = upto.reduce((t, r) => t + (r.kind === "receipt" ? 1 : -1) * Number(r.amount), 0);
    const perClient = new Map<string, number>();
    for (const r of upto) perClient.set(r.clientId ?? "none", (perClient.get(r.clientId ?? "none") ?? 0) + (r.kind === "receipt" ? 1 : -1) * Number(r.amount));
    const clientTotal = [...perClient.values()].reduce((t, v) => t + v, 0);
    const difference = bankBalance - cashbook;
    if (Math.abs(difference) > 0.004 && !notes.trim()) return { ok: false, error: `The bank balance is $${difference.toFixed(2)} different from the cashbook. Explain the difference in the notes (e.g. deposits not yet cleared).` };
    await db.insert(s.trustReconciliations).values({ agencyId: ctx.agencyId, periodEnd, bankBalance: bankBalance.toFixed(2), cashbookBalance: cashbook.toFixed(2), clientTotal: clientTotal.toFixed(2), difference: difference.toFixed(2), notes: notes.trim() || null, reconciledBy: ctx.userId, reconciledByName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "trust_reconciliation", entityId: periodEnd, detail: { bankBalance, cashbook, clientTotal } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
