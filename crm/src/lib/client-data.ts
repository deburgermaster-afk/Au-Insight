import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, or } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ClientCtx } from "@/lib/client-auth";

/** Activity kinds a client may see; internal notes, calls and tasks stay private to the agency. */
export const CLIENT_KINDS = ["stage", "document", "invoice", "email"];

const own = (c: ClientCtx) => ({ agencyId: c.client.agencyId, clientId: c.client.id });

export async function portalHome(c: ClientCtx) {
  const { agencyId, clientId } = own(c);
  const [matters, items, invoices, appts, recent] = await Promise.all([
    db
      .select({ m: s.matters, agent: s.user.name, agentEmail: s.user.email })
      .from(s.matters)
      .leftJoin(s.user, eq(s.user.id, s.matters.assignedTo))
      .where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.clientId, clientId)))
      .orderBy(desc(s.matters.updatedAt)),
    db
      .select({ id: s.checklistItems.id, matterId: s.checklistItems.matterId, status: s.checklistItems.status, required: s.checklistItems.required })
      .from(s.checklistItems)
      .innerJoin(s.matters, eq(s.matters.id, s.checklistItems.matterId))
      .where(and(eq(s.matters.clientId, clientId), eq(s.checklistItems.agencyId, agencyId))),
    db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.clientId, clientId))).orderBy(desc(s.invoices.issuedAt)),
    db
      .select({ a: s.appointments, staff: s.user.name })
      .from(s.appointments)
      .leftJoin(s.user, eq(s.user.id, s.appointments.staffId))
      .where(and(eq(s.appointments.agencyId, agencyId), eq(s.appointments.clientId, clientId), gte(s.appointments.startsAt, new Date())))
      .orderBy(asc(s.appointments.startsAt))
      .limit(3),
    timeline(c, null, 6),
  ]);
  matters.sort((a, b) => Number(a.m.stage === "closed") - Number(b.m.stage === "closed"));
  return { matters, items, invoices: invoices.filter((i) => i.status !== "draft" && i.status !== "void"), appts, recent };
}

export async function timeline(c: ClientCtx, matterId: string | null, limit = 50) {
  const { agencyId, clientId } = own(c);
  return db
    .select({ id: s.activities.id, kind: s.activities.kind, title: s.activities.title, body: s.activities.body, createdAt: s.activities.createdAt, matterId: s.activities.matterId })
    .from(s.activities)
    .where(
      and(
        eq(s.activities.agencyId, agencyId),
        eq(s.activities.clientId, clientId),
        inArray(s.activities.kind, CLIENT_KINDS),
        matterId ? eq(s.activities.matterId, matterId) : or(isNotNull(s.activities.matterId), eq(s.activities.kind, "document"), eq(s.activities.kind, "invoice")),
      ),
    )
    .orderBy(desc(s.activities.createdAt))
    .limit(limit);
}

export async function portalCase(c: ClientCtx, id: string) {
  const { agencyId, clientId } = own(c);
  const [row] = await db
    .select({ m: s.matters, agent: s.user.name, agentEmail: s.user.email })
    .from(s.matters)
    .leftJoin(s.user, eq(s.user.id, s.matters.assignedTo))
    .where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.clientId, clientId), eq(s.matters.id, id)));
  if (!row) return null;
  const [items, docs, events, invoices] = await Promise.all([
    db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, id)).orderBy(asc(s.checklistItems.sort)),
    db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.matterId, id))).orderBy(desc(s.documents.createdAt)),
    timeline(c, id),
    db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.matterId, id))),
  ]);
  return { ...row, items, docs, events, invoices: invoices.filter((i) => i.status !== "draft" && i.status !== "void") };
}

export async function portalDocuments(c: ClientCtx) {
  const { agencyId, clientId } = own(c);
  return db
    .select({ d: s.documents, matter: s.matters.title, ref: s.matters.reference })
    .from(s.documents)
    .leftJoin(s.matters, eq(s.matters.id, s.documents.matterId))
    .where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.clientId, clientId)))
    .orderBy(desc(s.documents.createdAt));
}

export async function portalPayments(c: ClientCtx) {
  const { agencyId, clientId } = own(c);
  const [invoices, ledger] = await Promise.all([
    db
      .select({ i: s.invoices, matter: s.matters.title })
      .from(s.invoices)
      .leftJoin(s.matters, eq(s.matters.id, s.invoices.matterId))
      .where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.clientId, clientId)))
      .orderBy(desc(s.invoices.issuedAt)),
    db.select().from(s.ledger).where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.clientId, clientId), eq(s.ledger.kind, "receipt"))).orderBy(desc(s.ledger.occurredAt)),
  ]);
  return { invoices: invoices.filter((r) => r.i.status !== "draft" && r.i.status !== "void"), receipts: ledger };
}

export async function portalInvoice(c: ClientCtx, id: string) {
  const { agencyId, clientId } = own(c);
  const [row] = await db
    .select({ i: s.invoices, matter: s.matters.title, ref: s.matters.reference })
    .from(s.invoices)
    .leftJoin(s.matters, eq(s.matters.id, s.invoices.matterId))
    .where(and(eq(s.invoices.agencyId, agencyId), eq(s.invoices.clientId, clientId), eq(s.invoices.id, id)));
  if (!row || row.i.status === "draft" || row.i.status === "void") return null;
  const receipts = await db.select().from(s.ledger).where(and(eq(s.ledger.agencyId, agencyId), eq(s.ledger.invoiceId, id), eq(s.ledger.kind, "receipt"))).orderBy(desc(s.ledger.occurredAt));
  return { ...row, receipts };
}

/** Mail between the agency and this client only (not, say, emails to their employer about them). */
export async function portalMessages(c: ClientCtx) {
  const { agencyId, clientId } = own(c);
  const me = (c.client.email ?? "").toLowerCase();
  const rows = await db
    .select({ id: s.messages.id, folder: s.messages.folder, fromName: s.messages.fromName, fromAddress: s.messages.fromAddress, to: s.messages.toAddresses, subject: s.messages.subject, bodyText: s.messages.bodyText, sentAt: s.messages.sentAt, attachments: s.messages.attachments })
    .from(s.messages)
    .where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.clientId, clientId), inArray(s.messages.folder, ["inbox", "sent", "archive"])))
    .orderBy(desc(s.messages.sentAt))
    .limit(80);
  return rows.filter((m) => me && (m.fromAddress.toLowerCase() === me || m.to.some((t) => t.toLowerCase().includes(me))));
}
