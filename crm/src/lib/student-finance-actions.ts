"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { requireCap } from "@/lib/session";
import { createSignDraft, sendSignRequest } from "@/lib/sign-actions";

// Student finance: partner institutions (the agency's agreements), scholarships offered under them,
// and tuition the agency collects from students on an institution's behalf (billed as an invoice,
// held in the client account, then remitted), with receipts.

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dateOrNull = (v?: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

const partnerSchema = z.object({
  partner: z.boolean(),
  commissionRate: z.string().trim().max(10).optional(),
  agreementStart: z.string().optional().nullable(),
  agreementExpiry: z.string().optional().nullable(),
  agreementRef: z.string().trim().max(80).optional().nullable(),
  collectsTuition: z.boolean(),
  remitDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  bankDetails: z.string().trim().max(400).optional().nullable(),
  contactName: z.string().trim().max(120).optional().nullable(),
  contactEmail: z.string().trim().max(200).optional().nullable(),
  website: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

/** Staff: the agency's agreement with an institution (partner, commission, fee collection, remittance). */
export async function savePartnership(institutionId: string, input: z.input<typeof partnerSchema>): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const v = partnerSchema.parse(input);
    const rate = v.commissionRate ? Number(v.commissionRate) : null;
    if (rate != null && (Number.isNaN(rate) || rate < 0 || rate > 60)) return { ok: false, error: "Commission should be a percentage between 0 and 60." };
    await db
      .update(s.institutions)
      .set({ partner: v.partner, commissionRate: rate == null ? null : String(rate), agreementStart: dateOrNull(v.agreementStart), agreementExpiry: dateOrNull(v.agreementExpiry), agreementRef: v.agreementRef || null, collectsTuition: v.collectsTuition, remitDays: v.remitDays ?? null, bankDetails: v.bankDetails || null, contactName: v.contactName || null, contactEmail: v.contactEmail || null, website: v.website || null, notes: v.notes || null })
      .where(and(eq(s.institutions.agencyId, ctx.agencyId), eq(s.institutions.id, institutionId)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const scholarshipSchema = z.object({
  institutionId: z.string().nullable(),
  name: z.string().trim().min(3, "Name the scholarship.").max(120),
  kind: z.enum(["percent", "amount"]),
  value: z.coerce.number().positive("Enter the scholarship's value."),
  appliesTo: z.enum(["first_year", "full_course", "first_semester", "one_off"]),
  funding: z.enum(["institution", "agency", "shared"]),
  eligibility: z.string().trim().max(1000).optional().nullable(),
  conditions: z.string().trim().max(2000).optional().nullable(),
  maxAwards: z.coerce.number().int().min(1).max(10000).optional().nullable(),
  closesAt: z.string().optional().nullable(),
  active: z.boolean(),
});
export type ScholarshipInput = z.input<typeof scholarshipSchema>;

/** Staff: create or edit a scholarship ("new" creates). */
export async function saveScholarship(id: string, input: ScholarshipInput): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const v = scholarshipSchema.parse(input);
    if (v.kind === "percent" && v.value > 100) return { ok: false, error: "A percentage can't be over 100." };
    if (v.institutionId) {
      const [i] = await db.select({ id: s.institutions.id }).from(s.institutions).where(and(eq(s.institutions.agencyId, ctx.agencyId), eq(s.institutions.id, v.institutionId)));
      if (!i) return { ok: false, error: "Institution not found." };
    }
    const values = { institutionId: v.institutionId, name: v.name, kind: v.kind, value: String(v.value), appliesTo: v.appliesTo, funding: v.funding, eligibility: v.eligibility || null, conditions: v.conditions || null, maxAwards: v.maxAwards ?? null, closesAt: dateOrNull(v.closesAt), active: v.active };
    if (id === "new") {
      const [row] = await db.insert(s.scholarships).values({ agencyId: ctx.agencyId, ...values }).returning({ id: s.scholarships.id });
      updateTag(agencyTag(ctx.agencyId));
      return { ok: true, id: row.id };
    }
    await db.update(s.scholarships).set(values).where(and(eq(s.scholarships.agencyId, ctx.agencyId), eq(s.scholarships.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

const APPLIES = { first_year: "first year's tuition", full_course: "whole course", first_semester: "first semester's tuition", one_off: "one-off" } as const;

/** What a scholarship is worth on an application, in dollars. */
function awardValue(sc: typeof s.scholarships.$inferSelect, a: typeof s.studentApplications.$inferSelect) {
  if (sc.kind === "amount") return Number(sc.value);
  const annual = Number(a.tuitionFee ?? 0);
  const years = a.courseStart && a.courseEnd ? Math.max(0.5, Math.round(((new Date(a.courseEnd).getTime() - new Date(a.courseStart).getTime()) / (365.25 * 864e5)) * 2) / 2) : 2;
  const base = sc.appliesTo === "full_course" ? annual * years : sc.appliesTo === "first_semester" ? annual / 2 : annual;
  return Math.round(base * Number(sc.value)) / 100;
}

/** Staff: offer a scholarship on an application and send the offer letter to the student to sign. */
export async function awardScholarship(applicationId: string, scholarshipId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const [[a], [sc]] = await Promise.all([
      db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, applicationId))),
      db.select().from(s.scholarships).where(and(eq(s.scholarships.agencyId, ctx.agencyId), eq(s.scholarships.id, scholarshipId))),
    ]);
    if (!a || !sc) return { ok: false, error: "Application or scholarship not found." };
    if (!sc.active) return { ok: false, error: "This scholarship is closed." };
    if (sc.institutionId && sc.institutionId !== a.institutionId) return { ok: false, error: "This scholarship is for a different institution." };
    if (sc.kind === "percent" && !Number(a.tuitionFee)) return { ok: false, error: "Add the tuition fee to the application first, so the scholarship can be valued." };
    if (sc.maxAwards) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.scholarshipAwards).where(and(eq(s.scholarshipAwards.scholarshipId, sc.id), inArray(s.scholarshipAwards.status, ["offered", "accepted"])));
      if (n >= sc.maxAwards) return { ok: false, error: `All ${sc.maxAwards} places for this scholarship are taken.` };
    }
    const [inst] = a.institutionId ? await db.select({ name: s.institutions.name }).from(s.institutions).where(eq(s.institutions.id, a.institutionId)) : [];
    const amount = awardValue(sc, a);
    const valueText = sc.kind === "percent" ? `${Number(sc.value)}% (about ${money(amount)})` : money(amount);
    const instName = inst?.name ?? "the institution";
    const draft = await createSignDraft({
      clientId: a.clientId,
      origin: "template",
      templateKey: "scholarship-offer",
      title: `Scholarship offer: ${sc.name}`,
      signers: { others: [], agentCountersign: true },
      extraVars: {
        scholarshipName: sc.name,
        scholarshipValue: valueText,
        appliesToText: APPLIES[sc.appliesTo as keyof typeof APPLIES] ?? sc.appliesTo,
        institution: instName,
        course: a.course,
        intakeText: a.intake ? `, ${a.intake} intake` : "",
        fundingText: sc.funding === "agency" ? `The scholarship is funded by ${ctx.agencyName}.` : sc.funding === "shared" ? `The scholarship is funded jointly by ${instName} and ${ctx.agencyName} under their agreement.` : `The scholarship is funded by ${instName} under its agreement with ${ctx.agencyName}.`,
        conditions: sc.conditions || "Maintain satisfactory course progress and attendance, and stay enrolled full-time with the institution.",
      },
    });
    if (!draft.ok || !draft.draft) return { ok: false, error: draft.ok ? "Couldn't prepare the letter." : draft.error };
    const sent = await sendSignRequest(draft.draft.id, { title: draft.draft.title, fields: draft.draft.fields, message: `Congratulations! You've been offered the ${sc.name} for ${a.course} at ${instName}. Please read the offer and sign to accept.` });
    const [award] = await db
      .insert(s.scholarshipAwards)
      .values({ agencyId: ctx.agencyId, scholarshipId: sc.id, applicationId: a.id, clientId: a.clientId, amount: amount.toFixed(2), status: "offered", signRequestId: draft.draft.id, awardedBy: ctx.userId, awardedByName: ctx.name })
      .returning({ id: s.scholarshipAwards.id });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: a.clientId, kind: "document", title: `Scholarship offered: ${sc.name}`, body: `${valueText} for ${a.course} at ${instName}.${sent.ok ? " Offer letter sent to sign." : ` Offer letter saved as a draft (${sent.error}).`}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return sent.ok ? { ok: true, id: award.id } : { ok: false, error: `Scholarship recorded, but the letter couldn't be sent: ${sent.error}` };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: revoke or mark declined. */
export async function setAwardStatus(id: string, status: "declined" | "revoked"): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    await db.update(s.scholarshipAwards).set({ status }).where(and(eq(s.scholarshipAwards.agencyId, ctx.agencyId), eq(s.scholarshipAwards.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const billSchema = z.object({
  period: z.string().trim().min(2, "Name the period, e.g. Semester 1, 2027.").max(60),
  kind: z.enum(["tuition", "enrolment", "materials", "oshc", "other"]),
  gross: z.coerce.number().positive("Enter the fee."),
  applyScholarship: z.boolean(),
  dueAt: z.string().optional().nullable(),
});

const KIND = { tuition: "Tuition fee", enrolment: "Enrolment fee", materials: "Materials fee", oshc: "Overseas Student Health Cover", other: "Fee" } as const;

/**
 * Staff: bill a student for tuition collected on the institution's behalf. Accepted scholarships on
 * the application are applied (up to what's left of them). Creates an invoice the student can pay
 * in the portal; the money goes to the client account until it's remitted.
 */
export async function billTuition(applicationId: string, input: z.input<typeof billSchema>): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can bill tuition.");
    const v = billSchema.parse(input);
    const [a] = await db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, applicationId)));
    if (!a) return { ok: false, error: "Application not found." };
    const [inst] = a.institutionId ? await db.select().from(s.institutions).where(eq(s.institutions.id, a.institutionId)) : [];
    if (inst && !inst.collectsTuition) return { ok: false, error: `Your agreement with ${inst.name} isn't set to collect tuition. Turn on "Collect tuition" on the institution first.` };
    let discount = 0;
    if (v.applyScholarship && v.kind === "tuition") {
      const [{ awarded }] = await db.select({ awarded: sql<string>`coalesce(sum(${s.scholarshipAwards.amount}), 0)` }).from(s.scholarshipAwards).where(and(eq(s.scholarshipAwards.applicationId, a.id), eq(s.scholarshipAwards.status, "accepted")));
      const [{ used }] = await db.select({ used: sql<string>`coalesce(sum(${s.tuitionPayments.scholarship}), 0)` }).from(s.tuitionPayments).where(and(eq(s.tuitionPayments.applicationId, a.id), sql`${s.tuitionPayments.status} <> 'refunded'`));
      discount = Math.max(0, Math.min(v.gross, Number(awarded) - Number(used)));
    }
    const amount = Math.round((v.gross - discount) * 100) / 100;
    if (amount <= 0) return { ok: false, error: "The scholarship covers this fee in full: nothing to bill." };
    const instName = inst?.name ?? "the institution";
    const [profile] = await db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    const prefix = profile?.invoicePrefix ?? "INV";
    const next = profile?.nextInvoiceNumber ?? 1001;
    await db.update(s.agencyProfile).set({ nextInvoiceNumber: next + 1 }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    const issued = new Date().toISOString().slice(0, 10);
    const due = dateOrNull(v.dueAt) ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const label = `${KIND[v.kind]}: ${a.course}, ${v.period}, paid to ${instName} on your behalf`;
    const [inv] = await db
      .insert(s.invoices)
      .values({
        agencyId: ctx.agencyId,
        number: `${prefix}-${next}`,
        clientId: a.clientId,
        status: "sent",
        issuedAt: issued,
        dueAt: due,
        items: [{ description: discount ? `${label} (${money(v.gross)} less scholarship ${money(discount)})` : label, quantity: 1, unitPrice: amount, gst: false, disbursement: true }],
        subtotal: amount.toFixed(2),
        gst: "0",
        total: amount.toFixed(2),
        notes: `Collected for ${instName}${inst?.agreementRef ? ` under agreement ${inst.agreementRef}` : ""}. Held in our client account and remitted to the institution.`,
      })
      .returning({ id: s.invoices.id, number: s.invoices.number });
    const [row] = await db
      .insert(s.tuitionPayments)
      .values({ agencyId: ctx.agencyId, clientId: a.clientId, applicationId: a.id, institutionId: a.institutionId, invoiceId: inv.id, period: v.period, kind: v.kind, gross: v.gross.toFixed(2), scholarship: discount.toFixed(2), amount: amount.toFixed(2), status: "billed", createdBy: ctx.userId })
      .returning({ id: s.tuitionPayments.id });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: a.clientId, kind: "invoice", title: `${KIND[v.kind]} billed: ${v.period}`, body: `${money(amount)} (invoice ${inv.number})${discount ? ` after ${money(discount)} scholarship` : ""}, for ${instName}.`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: the collected tuition was paid to the institution (records the trust payment out). */
export async function remitTuition(id: string, input: { reference: string; date: string }): Promise<ActionResult> {
  try {
    const ctx = await requireCap("billing", "Only accounts staff or agents can record remittances.");
    const [t] = await db.select().from(s.tuitionPayments).where(and(eq(s.tuitionPayments.agencyId, ctx.agencyId), eq(s.tuitionPayments.id, id)));
    if (!t) return { ok: false, error: "Payment not found." };
    if (t.status === "remitted") return { ok: true };
    const [inv] = t.invoiceId ? await db.select({ paid: s.invoices.paid, total: s.invoices.total, number: s.invoices.number }).from(s.invoices).where(eq(s.invoices.id, t.invoiceId)) : [];
    if (!inv || Number(inv.paid) + 0.005 < Number(inv.total)) return { ok: false, error: "The student hasn't paid this invoice in full yet." };
    const date = dateOrNull(input.date) ?? new Date().toISOString().slice(0, 10);
    const [inst] = t.institutionId ? await db.select({ name: s.institutions.name }).from(s.institutions).where(eq(s.institutions.id, t.institutionId)) : [];
    await db.insert(s.ledger).values({ agencyId: ctx.agencyId, clientId: t.clientId, invoiceId: t.invoiceId, account: "trust", kind: "payment", amount: t.amount, method: "bank transfer", reference: input.reference.trim().slice(0, 80) || inv.number, occurredAt: date, memo: `Tuition remitted to ${inst?.name ?? "institution"} (${t.period})` });
    await db.update(s.tuitionPayments).set({ status: "remitted", remittedAt: date, remittedRef: input.reference.trim().slice(0, 80) || null }).where(eq(s.tuitionPayments.id, id));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: t.clientId, kind: "invoice", title: `Tuition remitted to ${inst?.name ?? "the institution"}`, body: `${money(Number(t.amount))} for ${t.period}${input.reference ? `, ref ${input.reference}` : ""}.`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
