// Turns on the client portal for the demo client and fills the agency's trust account details.
// Usage: npx tsx --env-file=.env.local scripts/seed-portal.mts <agency-slug>
import { neon } from "@neondatabase/serverless";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import * as schemaModule from "../src/db/schema";
const s = ((schemaModule as unknown as { default?: typeof schemaModule }).default ?? schemaModule) as typeof schemaModule;

const db = drizzle(neon(process.env.DATABASE_URL!), { schema: s });
const [org] = await db.select().from(s.organization).where(eq(s.organization.slug, process.argv[2]));
await db.update(s.agencyProfile).set({ bankName: "Commonwealth Bank", bankAccountName: `${org.name} Pty Ltd Client Trust Account`, bankBsb: "062-019", bankAccount: "1048 2291" }).where(eq(s.agencyProfile.agencyId, org.id));
await db.update(s.clients).set({ portalEnabled: true }).where(eq(s.clients.agencyId, org.id));
const [lucas] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, org.id), eq(s.clients.firstName, "Lucas")));
const matters = await db.select().from(s.matters).where(eq(s.matters.clientId, lucas.id));
const invoices = await db.select().from(s.invoices).where(eq(s.invoices.clientId, lucas.id));
const docs = await db.select({ id: s.documents.id }).from(s.documents).where(eq(s.documents.clientId, lucas.id));
console.log({ client: lucas.id, email: lucas.email, matters: matters.map((m) => [m.reference, m.stage, m.visaCode]), invoices: invoices.map((i) => [i.number, i.status, i.total, i.paid]), docs: docs.length });

// A fuller story for one client: a granted 485, a 190 with an RFI, files, mail and a booking.
const [priya] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, org.id), eq(s.clients.email, "priya.nair@example.com")));
if (priya) {
  const day = (n: number) => new Date(Date.now() + n * 864e5);
  const iso = (n: number) => day(n).toISOString().slice(0, 10);
  const [m190] = await db.select().from(s.matters).where(eq(s.matters.clientId, priya.id));
  const [owner] = await db.select().from(s.member).where(and(eq(s.member.organizationId, org.id), eq(s.member.role, "owner")));
  const [agent] = await db.select().from(s.user).where(eq(s.user.id, (await db.select().from(s.member).where(and(eq(s.member.organizationId, org.id), eq(s.member.role, "owner"))))[0].userId));
  await db.update(s.matters).set({ assignedTo: agent?.id ?? owner.userId, lodgedAt: iso(-48), trn: "EGOX4H7K2PQ", rfiDueAt: iso(9), feeProfessional: "4400", feeGovernment: "4910" }).where(eq(s.matters.id, m190.id));
  await db.update(s.clients).set({ portalEnabled: true, phone: "0412 555 019", passportNumber: "Z4381927", nationality: "India", currentVisa: "485", visaExpiry: iso(140) }).where(eq(s.clients.id, priya.id));
  await db.delete(s.activities).where(eq(s.activities.clientId, priya.id));
  await db.delete(s.messages).where(eq(s.messages.clientId, priya.id));
  await db.delete(s.documents).where(eq(s.documents.clientId, priya.id));
  let [m485] = await db.select().from(s.matters).where(and(eq(s.matters.clientId, priya.id), eq(s.matters.visaCode, "485")));
  if (!m485) [m485] = await db.insert(s.matters).values({ agencyId: org.id, clientId: priya.id, reference: "LDG-2025-0031", visaCode: "485", title: "Temporary Graduate (485)", stage: "closed", outcome: "granted", lodgedAt: iso(-420), decisionAt: iso(-330), assignedTo: agent?.id }).returning();
  const acts: [number, string, string, string | null, string | null][] = [
    [-120, "stage", `${m190.reference} moved to engaged`, null, m190.id],
    [-95, "stage", `${m190.reference} moved to documents`, null, m190.id],
    [-80, "document", "Client uploaded Passport bio page", "passport.pdf", m190.id],
    [-78, "document", "Client uploaded Skills assessment outcome", "acs-outcome.pdf", m190.id],
    [-60, "invoice", "Invoice INV-1002 issued", "$4,840.00 incl. GST", m190.id],
    [-52, "stage", `${m190.reference} moved to ready`, null, m190.id],
    [-48, "stage", `${m190.reference} moved to lodged`, null, m190.id],
    [-6, "stage", `${m190.reference} moved to rfi`, null, m190.id],
    [-6, "email", "Home Affairs asked for more information", "Updated police certificate (India) within 28 days", m190.id],
    [-330, "stage", `${m485.reference} moved to decision`, "Granted", m485.id],
  ];
  await db.insert(s.activities).values(acts.map(([d, kind, title, body, matterId]) => ({ agencyId: org.id, clientId: priya.id, matterId, kind, title, body, actorName: "Ayesha Karim", createdAt: day(d), updatedAt: day(d) })));
  await db.insert(s.documents).values([
    { agencyId: org.id, clientId: priya.id, matterId: m190.id, name: "passport.pdf", category: "Identity", mimeType: "application/pdf", sizeBytes: 812_000, uploadedBy: "Priya Nair", source: "portal", createdAt: day(-80) },
    { agencyId: org.id, clientId: priya.id, matterId: m190.id, name: "acs-outcome.pdf", category: "Skills", mimeType: "application/pdf", sizeBytes: 240_000, uploadedBy: "Priya Nair", source: "portal", createdAt: day(-78) },
    { agencyId: org.id, clientId: priya.id, matterId: m190.id, name: "PTE-score-report.pdf", category: "English", mimeType: "application/pdf", sizeBytes: 190_000, uploadedBy: "Priya Nair", source: "portal", createdAt: day(-75) },
    { agencyId: org.id, clientId: priya.id, matterId: m190.id, name: "NSW-nomination-approval.pdf", category: "Nomination", mimeType: "application/pdf", sizeBytes: 156_000, uploadedBy: "Ayesha Karim", source: "upload", createdAt: day(-55) },
    { agencyId: org.id, clientId: priya.id, matterId: m190.id, name: "Lodgement-receipt-190.pdf", category: "Lodgement", mimeType: "application/pdf", sizeBytes: 98_000, uploadedBy: "Ayesha Karim", source: "upload", createdAt: day(-48) },
    { agencyId: org.id, clientId: priya.id, matterId: m485.id, name: "485-grant-letter.pdf", category: "Decision", mimeType: "application/pdf", sizeBytes: 120_000, uploadedBy: "Ayesha Karim", source: "upload", createdAt: day(-330) },
  ]);
  const box = `${org.slug}@reevake.com`;
  await db.insert(s.messages).values([
    { agencyId: org.id, threadKey: crypto.randomUUID(), folder: "sent", mailbox: box, fromAddress: box, fromName: "Ayesha Karim", toAddresses: [priya.email!], subject: "Your 190 application has been lodged", bodyText: "Hi Priya,\n\nGreat news: your Skilled Nominated (190) application was lodged today. TRN EGOX4H7K2PQ.\n\nCurrent processing is around 6–9 months. We'll let you know as soon as we hear anything.\n\nAyesha", clientId: priya.id, matterId: m190.id, read: true, sentAt: day(-48) },
    { agencyId: org.id, threadKey: crypto.randomUUID(), folder: "sent", mailbox: box, fromAddress: box, fromName: "Ayesha Karim", toAddresses: [priya.email!], subject: "Home Affairs needs an updated police certificate", bodyText: "Hi Priya,\n\nThe Department has asked for an updated Indian police clearance certificate. We need to respond within 28 days.\n\nPlease apply through the Passport Seva portal and upload the certificate in your portal as soon as you have it.\n\nAyesha", clientId: priya.id, matterId: m190.id, read: true, sentAt: day(-6) },
    { agencyId: org.id, threadKey: crypto.randomUUID(), folder: "inbox", mailbox: box, fromAddress: priya.email!, fromName: "Priya Nair", toAddresses: [box], subject: "Re: police certificate", bodyText: "Thanks Ayesha, I've booked my appointment at the consulate for next week.", clientId: priya.id, matterId: m190.id, read: true, sentAt: day(-4), status: "portal" },
  ]);
  const items = await db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, m190.id));
  for (const [n, it] of items.entries()) await db.update(s.checklistItems).set({ status: /police/i.test(it.label) ? "requested" : n % 5 === 4 ? "needed" : n % 3 === 0 ? "received" : "approved", note: /police/i.test(it.label) ? "Updated certificate requested by Home Affairs" : null }).where(eq(s.checklistItems.id, it.id));
  await db.delete(s.appointments).where(eq(s.appointments.clientId, priya.id));
  const start = day(3);
  start.setUTCHours(0, 30, 0, 0);
  await db.insert(s.appointments).values({ agencyId: org.id, clientId: priya.id, matterId: m190.id, title: "RFI response check-in", kind: "follow-up", startsAt: start, endsAt: new Date(start.getTime() + 30 * 60_000), location: "Video call", staffId: agent?.id });
  console.log("Priya enriched", m190.reference, items.length, "checklist items");
}
