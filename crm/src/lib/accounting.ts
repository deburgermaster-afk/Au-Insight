import "server-only";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { AccountingSettings } from "@/db/crm-schema";
import { connectorFor, xeroAccess } from "@/lib/payroll-integrations";

// Accounting: push the agency's own (office) invoices and receipts to Xero, and export them in
// MYOB AccountRight's import format. Client money held in trust never goes to the books as income:
// it only reaches Xero when it's transferred to office against an invoice.

export const ACCOUNTING_DEFAULTS: Required<Omit<AccountingSettings, "autoSync">> & { autoSync: boolean } = {
  salesAccount: "200", // Xero AU chart: Sales
  disbursementAccount: "260", // Other Revenue
  bankAccount: "090", // Business Bank Account
  autoSync: false,
};

export async function accountingFor(agencyId: string) {
  const [p] = await db.select({ a: s.agencyProfile.accounting, gst: s.agencyProfile.gstRegistered }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  return { ...ACCOUNTING_DEFAULTS, ...(p?.a ?? {}), gstRegistered: p?.gst ?? true };
}

type Item = { description: string; quantity: number; unitPrice: number; gst: boolean; disbursement?: boolean };

/** Xero tax type for a line: GST on income, GST-free income, or outside the GST system (government charges). */
export const xeroTaxType = (i: Item, gstRegistered: boolean) => (i.disbursement ? "BASEXCLUDED" : !gstRegistered ? "BASEXCLUDED" : i.gst ? "OUTPUT" : "EXEMPTOUTPUT");
/** MYOB tax code: GST, FRE (GST-free) or N-T (not reportable). */
export const myobTaxCode = (i: Item, gstRegistered: boolean) => (i.disbursement || !gstRegistered ? "N-T" : i.gst ? "GST" : "FRE");

async function xeroFetch(agencyId: string, path: string, init: { method: string; body?: unknown }) {
  const { token, tenantId } = await xeroAccess(agencyId);
  const r = await fetch(`https://api.xero.com/api.xro/2.0/${path}`, {
    method: init.method,
    headers: { Authorization: `Bearer ${token}`, "xero-tenant-id": tenantId, "Content-Type": "application/json", Accept: "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await r.text();
  if (r.status === 429) throw new Error("Xero's rate limit was reached. The rest will sync on the next run.");
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text) as { Message?: string; Elements?: { ValidationErrors?: { Message: string }[] }[] };
      msg = j.Elements?.[0]?.ValidationErrors?.map((v) => v.Message).join("; ") || j.Message || msg;
    } catch {}
    throw new Error(`Xero: ${msg}`);
  }
  return JSON.parse(text) as Record<string, unknown>;
}

/** The client's contact in Xero: remembered, found by email, or created. */
async function xeroContact(agencyId: string, clientId: string) {
  const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, clientId)));
  if (!c) throw new Error("Client not found.");
  if (c.xeroContactId) return c.xeroContactId;
  const name = `${c.firstName} ${c.lastName}`.trim();
  let id: string | null = null;
  if (c.email) {
    const q = encodeURIComponent(`EmailAddress=="${c.email.replace(/"/g, "")}"`);
    const found = (await xeroFetch(agencyId, `Contacts?where=${q}`, { method: "GET" })) as { Contacts?: { ContactID: string }[] };
    id = found.Contacts?.[0]?.ContactID ?? null;
  }
  if (!id) {
    const body = (n: string) => ({ Contacts: [{ Name: n, FirstName: c.firstName, LastName: c.lastName, EmailAddress: c.email ?? undefined, Phones: c.phone ? [{ PhoneType: "MOBILE", PhoneNumber: c.phone }] : undefined }] });
    let made: { Contacts?: { ContactID: string }[] };
    try {
      made = (await xeroFetch(agencyId, "Contacts", { method: "POST", body: body(name) })) as typeof made;
    } catch (e) {
      // Contact names are unique in Xero: add the email to tell two people with the same name apart.
      if (!String(e).toLowerCase().includes("already")) throw e;
      made = (await xeroFetch(agencyId, "Contacts", { method: "POST", body: body(`${name} (${c.email ?? c.id.slice(0, 6)})`) })) as typeof made;
    }
    id = made.Contacts?.[0]?.ContactID ?? null;
  }
  if (!id) throw new Error("Xero didn't return a contact.");
  await db.update(s.clients).set({ xeroContactId: id }).where(eq(s.clients.id, c.id));
  return id;
}

/** Creates or updates one invoice in Xero (as approved), then its office receipts as payments. */
export async function syncInvoiceToXero(agencyId: string, invoiceId: string): Promise<{ ok: boolean; skipped?: string; error?: string; payments?: number }> {
  const [inv] = await db
    .select({ i: s.invoices, ref: s.matters.reference })
    .from(s.invoices)
    .leftJoin(s.matters, eq(s.matters.id, s.invoices.matterId))
    .where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.id, invoiceId)));
  if (!inv) return { ok: false, error: "Invoice not found." };
  const i = inv.i;
  if (i.status === "draft") return { ok: true, skipped: "Drafts stay in Lodgely until they're sent." };
  if (i.status === "void" && !i.xeroId) return { ok: true, skipped: "Void and never synced." };
  const cfg = await accountingFor(agencyId);
  try {
    const contactId = await xeroContact(agencyId, i.clientId);
    const body = {
      Invoices: [
        {
          ...(i.xeroId ? { InvoiceID: i.xeroId } : {}),
          Type: "ACCREC",
          Contact: { ContactID: contactId },
          InvoiceNumber: i.number,
          Reference: inv.ref ?? undefined,
          Date: i.issuedAt ?? undefined,
          DueDate: i.dueAt ?? i.issuedAt ?? undefined,
          LineAmountTypes: "Exclusive",
          Status: i.status === "void" ? "VOIDED" : "AUTHORISED",
          LineItems: i.items.map((it) => ({
            Description: it.description,
            Quantity: it.quantity,
            UnitAmount: it.unitPrice,
            AccountCode: it.disbursement ? cfg.disbursementAccount : cfg.salesAccount,
            TaxType: xeroTaxType(it, cfg.gstRegistered),
          })),
        },
      ],
    };
    const res = (await xeroFetch(agencyId, "Invoices", { method: "POST", body })) as { Invoices?: { InvoiceID: string }[] };
    const xeroId = res.Invoices?.[0]?.InvoiceID;
    if (!xeroId) throw new Error("Xero didn't return the invoice.");
    await db.update(s.invoices).set({ xeroId, xeroSyncedAt: new Date(), xeroError: null }).where(eq(s.invoices.id, i.id));
    let payments = 0;
    if (i.status !== "void") {
      const due = await db
        .select()
        .from(s.ledger)
        .where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.invoiceId, i.id), eq(s.ledger.account, "office"), eq(s.ledger.kind, "receipt"), isNull(s.ledger.xeroId)))
        .orderBy(asc(s.ledger.occurredAt));
      for (const p of due) {
        const pr = (await xeroFetch(agencyId, "Payments", {
          method: "PUT",
          body: { Payments: [{ Invoice: { InvoiceID: xeroId }, Account: { Code: cfg.bankAccount }, Date: p.occurredAt, Amount: Number(p.amount), Reference: [p.method, p.reference].filter(Boolean).join(" · ").slice(0, 255) || undefined }] },
        })) as { Payments?: { PaymentID: string }[] };
        const pid = pr.Payments?.[0]?.PaymentID;
        if (pid) {
          await db.update(s.ledger).set({ xeroId: pid }).where(eq(s.ledger.id, p.id));
          payments++;
        }
      }
    }
    return { ok: true, payments };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await db.update(s.invoices).set({ xeroError: error.slice(0, 500) }).where(eq(s.invoices.id, i.id));
    return { ok: false, error };
  }
}

/** Everything that's changed since its last sync, oldest first, a batch at a time (Xero allows 60 calls a minute). */
export async function syncAgencyToXero(agencyId: string, limit = 25) {
  const c = await connectorFor(agencyId, "xero");
  if (!c || c.status !== "active") return { connected: false, synced: 0, failed: 0, payments: 0, errors: [] as string[] };
  const pending = await db
    .select({ id: s.invoices.id })
    .from(s.invoices)
    .where(
      and(
        eq(s.invoices.agencyId, agencyId),
        ne(s.invoices.status, "draft"),
        or(
          isNull(s.invoices.xeroSyncedAt),
          sql`${s.invoices.updatedAt} > ${s.invoices.xeroSyncedAt}`,
          sql`exists (select 1 from ${s.ledger} l where l.invoice_id = ${s.invoices.id} and l.account = 'office' and l.kind = 'receipt' and l.xero_id is null)`,
        ),
      ),
    )
    .orderBy(asc(s.invoices.issuedAt))
    .limit(limit);
  let synced = 0;
  let failed = 0;
  let payments = 0;
  const errors: string[] = [];
  for (const p of pending) {
    const r = await syncInvoiceToXero(agencyId, p.id);
    if (r.ok && !r.skipped) synced++;
    if (!r.ok) {
      failed++;
      if (r.error) errors.push(r.error);
      if (r.error?.includes("rate limit")) break;
    }
    payments += r.payments ?? 0;
  }
  return { connected: true, synced, failed, payments, errors: [...new Set(errors)].slice(0, 5), remaining: Math.max(0, pending.length - synced - failed) };
}

// ---------- MYOB AccountRight import files ----------

const tsvCell = (v: unknown) => (v == null ? "" : String(v).replace(/[\t\r\n]+/g, " "));
const ddmmyyyy = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const money = (n: number) => n.toFixed(2);

async function invoicesBetween(agencyId: string, from: string, to: string) {
  return db
    .select({ i: s.invoices, first: s.clients.firstName, last: s.clients.lastName, email: s.clients.email, ref: s.matters.reference })
    .from(s.invoices)
    .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
    .leftJoin(s.matters, eq(s.matters.id, s.invoices.matterId))
    .where(and(eq(s.invoices.agencyId, agencyId), inArray(s.invoices.status, ["sent", "partial", "paid", "overdue"]), gte(s.invoices.issuedAt, from), lte(s.invoices.issuedAt, to)))
    .orderBy(asc(s.invoices.issuedAt), asc(s.invoices.number));
}

/**
 * Service sales in MYOB AccountRight's tab-delimited import layout: one line per invoice line, a
 * blank line between invoices. Import with File → Import Data → Sales → Service Sales; the first
 * row holds the field names, so MYOB matches the columns on its own.
 */
export async function myobSalesFile(agencyId: string, from: string, to: string) {
  const cfg = await accountingFor(agencyId);
  const rows = await invoicesBetween(agencyId, from, to);
  const head = ["Co./Last Name", "First Name", "Invoice No.", "Date", "Customer PO", "Description", "Account No.", "Amount", "Inc-Tax Amount", "Job", "Journal Memo", "Tax Code", "Non-GST Amount", "GST Amount", "Sale Status", "Terms - Payment is Due", "Terms - Balance Due Days"];
  const lines: string[] = [head.join("\t")];
  for (const { i, first, last, ref } of rows) {
    const due = i.issuedAt && i.dueAt ? Math.max(0, Math.round((Date.parse(i.dueAt) - Date.parse(i.issuedAt)) / 864e5)) : 14;
    i.items.forEach((it) => {
      const ex = it.quantity * it.unitPrice;
      const code = myobTaxCode(it, cfg.gstRegistered);
      const gst = code === "GST" ? ex * 0.1 : 0;
      lines.push(
        [last, first, i.number, ddmmyyyy(i.issuedAt), ref ?? "", it.description, it.disbursement ? cfg.disbursementAccount : cfg.salesAccount, money(ex), money(ex + gst), "", `Lodgely ${i.number}`, code, code === "GST" ? "0.00" : money(ex), money(gst), "I", "2", String(due)].map(tsvCell).join("\t"),
      );
    });
    lines.push("");
  }
  return { body: lines.join("\r\n"), count: rows.length };
}

/** Customer payments (Sales → Receive Payments) for office receipts applied to invoices. */
export async function myobReceiptsFile(agencyId: string, from: string, to: string) {
  const cfg = await accountingFor(agencyId);
  const rows = await db
    .select({ l: s.ledger, number: s.invoices.number, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.ledger)
    .innerJoin(s.invoices, eq(s.invoices.id, s.ledger.invoiceId))
    .innerJoin(s.clients, eq(s.clients.id, s.invoices.clientId))
    .where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.account, "office"), eq(s.ledger.kind, "receipt"), gte(s.ledger.occurredAt, from), lte(s.ledger.occurredAt, to)))
    .orderBy(asc(s.ledger.occurredAt));
  const head = ["Co./Last Name", "First Name", "Deposit Account No.", "ID No.", "Receipt Date", "Invoice No.", "Amount Applied", "Memo", "Payment Method"];
  const lines: string[] = [head.join("\t")];
  for (const { l, number, first, last } of rows) {
    lines.push([last, first, cfg.bankAccount, (l.reference ?? "").slice(0, 8), ddmmyyyy(l.occurredAt), number, money(Number(l.amount)), `Lodgely receipt ${number}`, l.method ?? ""].map(tsvCell).join("\t"));
    lines.push("");
  }
  return { body: lines.join("\r\n"), count: rows.length };
}

/** A plain CSV of invoices for any other accounting package or the accountant. */
export async function invoicesCsv(agencyId: string, from: string, to: string) {
  const rows = await invoicesBetween(agencyId, from, to);
  const cell = (v: unknown) => {
    const t = v == null ? "" : String(v);
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const head = ["Invoice", "Issued", "Due", "Client", "Email", "Matter", "Status", "Subtotal", "GST", "Total", "Paid", "Owing"];
  const out = [head.join(",")];
  for (const { i, first, last, email, ref } of rows) out.push([i.number, i.issuedAt, i.dueAt, `${first} ${last}`, email, ref, i.status, i.subtotal, i.gst, i.total, i.paid, (Number(i.total) - Number(i.paid)).toFixed(2)].map(cell).join(","));
  return { body: out.join("\r\n"), count: rows.length };
}
