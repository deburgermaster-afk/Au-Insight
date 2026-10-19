"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { syncAgencyToXero, syncInvoiceToXero } from "@/lib/accounting";
import { agencyTag } from "@/lib/data";
import { requireCap } from "@/lib/session";

const code = z.string().trim().min(1, "Enter an account code.").max(20).regex(/^[A-Za-z0-9.-]+$/, "Account codes are letters, digits, dots or dashes.");

export async function saveAccountingSettings(input: { salesAccount: string; disbursementAccount: string; bankAccount: string; autoSync: boolean }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can change accounting settings.");
    const v = z.object({ salesAccount: code, disbursementAccount: code, bankAccount: code, autoSync: z.boolean() }).parse(input);
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, accounting: v }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { accounting: v, updatedAt: new Date() } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "accounting_settings", detail: v });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the settings." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Sync now: everything new or changed since the last sync, up to a batch. */
export async function syncXeroNow(): Promise<ActionResult & { summary?: string }> {
  try {
    const ctx = await requireCap("billing");
    const r = await syncAgencyToXero(ctx.agencyId, 40);
    if (!r.connected) return { ok: false, error: "Connect Xero first." };
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "export", entity: "xero_sync", detail: r });
    updateTag(agencyTag(ctx.agencyId));
    if (r.failed && !r.synced) return { ok: false, error: r.errors[0] ?? "Xero didn't accept the invoices." };
    const parts = [`${r.synced} invoice${r.synced === 1 ? "" : "s"}`, r.payments ? `${r.payments} payment${r.payments === 1 ? "" : "s"}` : null, r.failed ? `${r.failed} need attention` : null].filter(Boolean);
    return { ok: true, summary: r.synced || r.payments || r.failed ? `Synced ${parts.join(", ")}` : "Everything is already in Xero" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function syncInvoiceNow(invoiceId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing");
    const [i] = await db.select({ agencyId: s.invoices.agencyId }).from(s.invoices).where(eq(s.invoices.id, invoiceId));
    if (!i || i.agencyId !== ctx.agencyId) return { ok: false, error: "Invoice not found." };
    const r = await syncInvoiceToXero(ctx.agencyId, invoiceId);
    updateTag(agencyTag(ctx.agencyId));
    if (!r.ok) return { ok: false, error: r.error ?? "Xero didn't accept the invoice." };
    if (r.skipped) return { ok: false, error: r.skipped };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
