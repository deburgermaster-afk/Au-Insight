"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { appUrl, clientSession } from "@/lib/client-auth";
import { agencyTag } from "@/lib/data";
import { notifyStaff } from "@/lib/notify";
import { methodLabel, providersFor } from "@/lib/payments";
import { createCheckout, PROVIDERS, type ProviderKey } from "@/lib/payments/providers";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function invoiceFor(invoiceId: string) {
  const c = await clientSession();
  if (!c) throw new Error("Your session has ended. Sign in again.");
  const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.id, invoiceId), eq(s.invoices.clientId, c.client.id), inArray(s.invoices.status, ["sent", "partial", "overdue"])));
  if (!inv) throw new Error("This invoice isn't open for payment.");
  const left = Math.round((Number(inv.total) - Number(inv.paid)) * 100) / 100;
  if (left <= 0) throw new Error("This invoice is already paid.");
  return { c, inv, left };
}

/** Client: start a card checkout with one of the agency's providers. Returns the checkout URL. */
export async function startCardPayment(invoiceId: string, provider: string): Promise<ActionResult> {
  try {
    const { c, inv, left } = await invoiceFor(invoiceId);
    if (!(provider in PROVIDERS) || !PROVIDERS[provider as ProviderKey].auto) return { ok: false, error: "That payment method isn't available." };
    const p = (await providersFor(c.client.agencyId)).find((x) => x.key === provider && x.enabled && x.status === "active");
    if (!p) return { ok: false, error: "That payment method isn't available." };
    const [a] = await db.insert(s.paymentAttempts).values({ agencyId: c.client.agencyId, invoiceId, clientId: c.client.id, provider, amount: left.toFixed(2) }).returning();
    const title = `${inv.number} · ${c.agency.name}`;
    const out = await createCheckout(p.key, p.mode as "live" | "test", p.secretValues, p.settings ?? {}, {
      amount: left,
      title,
      reference: inv.number,
      email: c.client.email,
      attemptId: a.id,
      returnUrl: `${appUrl()}/client/pay/return?attempt=${a.id}`,
      cancelUrl: `${appUrl()}/client/payments/${invoiceId}?pay=cancelled`,
    }).catch(async (e) => {
      await db.update(s.paymentAttempts).set({ status: "failed", reviewNote: e instanceof Error ? e.message.slice(0, 300) : String(e) }).where(eq(s.paymentAttempts.id, a.id));
      throw new Error(`${PROVIDERS[p.key].name} couldn't start the payment. Try another method or contact your agent.`);
    });
    await db.update(s.paymentAttempts).set({ externalId: out.externalId, checkoutUrl: out.url }).where(eq(s.paymentAttempts.id, a.id));
    return { ok: true, id: out.url };
  } catch (e) {
    return fail(e);
  }
}

const file = z.object({ key: z.string(), name: z.string().max(200), type: z.string().max(100), size: z.number().max(25 * 1024 * 1024) });

/** Client: "I've paid" by bank transfer (or Zeller link) with a screenshot or receipt for staff to check. */
export async function submitPaymentProof(invoiceId: string, method: "bank" | "zeller", proof: z.infer<typeof file>, amount: number, note: string): Promise<ActionResult> {
  try {
    const { c, inv, left } = await invoiceFor(invoiceId);
    const f = file.parse(proof);
    if (!f.key.startsWith(`agency/${c.client.agencyId}/client/${c.client.id}/`)) return { ok: false, error: "Upload not found." };
    if (!(amount > 0) || amount > left + 0.004) return { ok: false, error: `Enter the amount you paid (up to $${left.toFixed(2)}).` };
    if (method === "zeller" && !inv.zellerLink) return { ok: false, error: "Zeller isn't set up for this invoice." };
    const [a] = await db.insert(s.paymentAttempts).values({ agencyId: c.client.agencyId, invoiceId, clientId: c.client.id, provider: method, amount: amount.toFixed(2), status: "review", proofKey: f.key, proofName: f.name, clientNote: note.trim().slice(0, 500) || null }).returning({ id: s.paymentAttempts.id });
    const who = `${c.client.firstName} ${c.client.lastName}`;
    await db.insert(s.documents).values({ agencyId: c.client.agencyId, clientId: c.client.id, matterId: inv.matterId, name: f.name, category: "Payment receipt", mimeType: f.type, sizeBytes: f.size, storageKey: f.key, uploadedBy: who, source: "portal" });
    await db.insert(s.activities).values({ agencyId: c.client.agencyId, clientId: c.client.id, matterId: inv.matterId, kind: "invoice", title: `${methodLabel(method)} receipt uploaded for ${inv.number}`, body: `$${amount.toFixed(2)}${note.trim() ? ` · "${note.trim()}"` : ""}`, actorName: who });
    // Someone in accounts checks it against the bank statement.
    const staff = await db.select({ id: s.user.id, email: s.user.email, role: s.member.role }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(and(eq(s.member.organizationId, c.client.agencyId), inArray(s.member.role, ["owner", "admin"])));
    const [m] = inv.matterId ? await db.select({ assignedTo: s.matters.assignedTo }).from(s.matters).where(eq(s.matters.id, inv.matterId)) : [];
    const owner = m?.assignedTo ?? staff.find((x) => x.role === "owner")?.id ?? staff[0]?.id ?? null;
    await db.insert(s.tasks).values({ agencyId: c.client.agencyId, title: `Check ${methodLabel(method).toLowerCase()}: ${inv.number} $${amount.toFixed(2)}`, description: `${who} uploaded a receipt. Match it to the ${method === "bank" ? "bank statement" : "Zeller dashboard"}, then approve it under Billing → Payments to check.`, priority: "high", dueAt: new Date(Date.now() + 864e5), assignedTo: owner, clientId: c.client.id, matterId: inv.matterId });
    await notifyStaff(staff.map((x) => x.email), `Payment to check: ${inv.number} ($${amount.toFixed(2)})`, { heading: `${who} says they paid ${inv.number}`, lines: [`$${amount.toFixed(2)} by ${methodLabel(method).toLowerCase()}. They uploaded a receipt.`, "Match it to your bank or Zeller account, then approve it so the invoice and trust ledger update."], cta: { label: "Review the payment", path: "/app/billing?tab=review" } });
    updateTag(agencyTag(c.client.agencyId));
    return { ok: true, id: a.id };
  } catch (e) {
    return fail(e);
  }
}
