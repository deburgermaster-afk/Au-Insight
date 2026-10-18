"use server";

import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { contractText, draftTemplate, importTemplate, reviewTemplate, ruleReview } from "@/lib/contract-ai";
import { contractPdf } from "@/lib/contract-pdf";
import { BUILTIN_TEMPLATES, renderContract, unfilled } from "@/lib/contracts";
import { agencyTag } from "@/lib/data";
import { agencyLogo } from "@/lib/brand";
import { agencyPrefix, putFile } from "@/lib/files";
import { dmy } from "@/lib/format";
import { llmEnabled } from "@/lib/llm";
import { ensureMailboxes, mailEnabled, sendMail } from "@/lib/mail";
import { payrollSettingsFor } from "@/lib/payroll-data";
import { actionCtx, type Ctx, requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const audit = (ctx: Ctx, action: string, entity: string, entityId: string, detail?: Record<string, unknown>) =>
  db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action, entity, entityId, detail });
const EMP = z.enum(["full_time", "part_time", "casual", "contractor"]);

/** Adds one of Lodgely's built-in templates to the agency's library, where it can be edited. */
export async function addBuiltinTemplate(key: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can manage contracts.");
    const t = BUILTIN_TEMPLATES.find((x) => x.key === key);
    if (!t) return { ok: false, error: "Unknown template." };
    const [made] = await db.insert(s.contractTemplates).values({ agencyId: ctx.agencyId, name: t.name, employment: t.employment, body: t.body, source: "builtin", analysis: ruleReview(t.body, t.employment), createdBy: ctx.name }).returning({ id: s.contractTemplates.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

/** "Write it casually": AI drafts a full template from a plain description, then reviews it. */
export async function aiDraftContractTemplate(description: string, employment: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can manage contracts.");
    if (!llmEnabled()) return { ok: false, error: "AI isn't available right now. Start from a built-in template instead." };
    const d = description.trim();
    if (d.length < 20) return { ok: false, error: "Describe the role in a sentence or two: title, hours, pay, award, anything special." };
    const emp = EMP.parse(employment);
    const t = await draftTemplate(d, emp);
    if (!t) return { ok: false, error: "The AI couldn't write the contract this time. Try again in a minute." };
    const analysis = await reviewTemplate(t.body, t.employment);
    const [made] = await db.insert(s.contractTemplates).values({ agencyId: ctx.agencyId, name: t.name, employment: t.employment, body: t.body, source: "ai_description", analysis, createdBy: ctx.name }).returning({ id: s.contractTemplates.id });
    await audit(ctx, "create", "contract_template", made.id, { source: "ai_description", model: t.model });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

/** Upload an existing contract (Word, PDF or text): AI analyses it and saves it as a native template. */
export async function aiImportContractTemplate(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can manage contracts.");
    if (!llmEnabled()) return { ok: false, error: "AI isn't available right now." };
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose a contract file." };
    if (file.size > 8 * 1024 * 1024) return { ok: false, error: "That file is over 8 MB." };
    const text = await contractText(Buffer.from(await file.arrayBuffer()), file.type, file.name);
    if (text.length < 300) return { ok: false, error: "There isn't enough text in that file to read a contract." };
    const t = await importTemplate(text);
    if (!t) return { ok: false, error: "The AI couldn't read the contract this time. Try again in a minute." };
    const analysis = await reviewTemplate(t.body, t.employment);
    const [made] = await db.insert(s.contractTemplates).values({ agencyId: ctx.agencyId, name: t.name, employment: t.employment, body: t.body, source: "ai_import", analysis, createdBy: ctx.name }).returning({ id: s.contractTemplates.id });
    await audit(ctx, "create", "contract_template", made.id, { source: "ai_import", file: file.name, model: t.model });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveContractTemplate(id: string, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const name = String(f.get("name") ?? "").trim();
    const body = String(f.get("body") ?? "");
    const employment = EMP.parse(f.get("employment") ?? "full_time");
    if (name.length < 3 || body.trim().length < 200) return { ok: false, error: "Give the template a name and the full contract text." };
    await db
      .update(s.contractTemplates)
      .set({ name, body, employment, analysis: ruleReview(body, employment) })
      .where(and(eq(s.contractTemplates.agencyId, ctx.agencyId), eq(s.contractTemplates.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function reviewContractTemplate(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const [t] = await db.select().from(s.contractTemplates).where(and(eq(s.contractTemplates.agencyId, ctx.agencyId), eq(s.contractTemplates.id, id)));
    if (!t) return { ok: false, error: "Template not found." };
    await db.update(s.contractTemplates).set({ analysis: await reviewTemplate(t.body, t.employment) }).where(eq(s.contractTemplates.id, id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteContractTemplate(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    await db.delete(s.contractTemplates).where(and(eq(s.contractTemplates.agencyId, ctx.agencyId), eq(s.contractTemplates.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const FREQ: Record<string, string> = { weekly: "weekly", fortnightly: "fortnightly", monthly: "monthly" };
const EMPLOYMENT: Record<string, string> = { full_time: "full-time", part_time: "part-time", casual: "casual", contractor: "contract" };

/** Everything a template can merge, from the employee's record and the agency profile. */
async function mergeData(ctx: Ctx, userId: string) {
  const [[person], [agency], settings] = await Promise.all([
    db.select({ p: s.staffProfiles, name: s.user.name }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, ctx.agencyId))).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.userId, userId))),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId)),
    payrollSettingsFor(ctx.agencyId),
  ]);
  if (!person) throw new Error("That person isn't in this agency.");
  const p = person.p;
  const [manager] = p?.managerId ? await db.select({ name: s.user.name }).from(s.user).where(eq(s.user.id, p.managerId)) : [];
  const legal = [p?.givenName, p?.middleName, p?.familyName].filter(Boolean).join(" ");
  const rate = p?.payRate ? (p.payType === "hourly" ? `$${Number(p.payRate).toFixed(2)} an hour` : `$${Number(p.payRate).toLocaleString("en-AU")} a year (gross, plus super)`) : "";
  const state = settings.addressState ?? agency?.state ?? "";
  return {
    "employee.name": legal || person.name,
    "employee.first_name": p?.givenName ?? person.name.split(" ")[0],
    "employee.address": p?.addressLine1 ? `${p.addressLine1}${p.addressLine2 ? `, ${p.addressLine2}` : ""}, ${p.suburb ?? ""} ${p.addressState ?? ""} ${p.postcode ?? ""}`.trim() : "",
    "employer.name": agency?.legalName ?? ctx.agencyName,
    "employer.abn": agency?.abn ?? "",
    "employer.address": agency?.address ?? [settings.addressLine1, settings.suburb, settings.addressState, settings.postcode].filter(Boolean).join(", "),
    "employer.signatory": settings.stpDeclarationName ?? ctx.name,
    "position.title": p?.title ?? "",
    "position.manager": manager?.name ?? ctx.name,
    "employment.type": EMPLOYMENT[p?.employment ?? "full_time"],
    "start.date": p?.startDate ? dmy(p.startDate) : "",
    "end.date": p?.endDate ? dmy(p.endDate) : "",
    "hours.week": p ? String(Number(p.hoursPerWeek)) : "38",
    "pay.rate": rate,
    "pay.frequency": FREQ[p?.payFrequency ?? settings.frequency] ?? "fortnightly",
    "super.rate": `${Number(p?.superRate ?? 12)}%`,
    "award.name": p?.awardName ?? settings.awardName ?? "",
    "award.classification": p?.classification ?? "",
    probation: "6 months",
    "work.location": agency?.address ?? "our office",
    state: { NSW: "New South Wales", VIC: "Victoria", QLD: "Queensland", WA: "Western Australia", SA: "South Australia", TAS: "Tasmania", ACT: "the Australian Capital Territory", NT: "the Northern Territory" }[state] ?? (state || "the state where you work"),
    today: dmy(new Date()),
  } as Record<string, string>;
}

/** Fills a template for one staff member as a draft contract HR can review and edit. */
export async function issueContract(userId: string, templateId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll", "Only HR or admins can issue contracts.");
    const [t] = await db.select().from(s.contractTemplates).where(and(eq(s.contractTemplates.agencyId, ctx.agencyId), eq(s.contractTemplates.id, templateId)));
    if (!t) return { ok: false, error: "Pick a template." };
    const data = await mergeData(ctx, userId);
    const body = renderContract(t.body, data);
    const title = t.name.replace(/^Employment contract: /, `Employment contract (${data["employee.name"]}): `);
    const [made] = await db.insert(s.employmentContracts).values({ agencyId: ctx.agencyId, userId, templateId, title, body, createdBy: ctx.userId, createdByName: ctx.name }).returning({ id: s.employmentContracts.id });
    await audit(ctx, "create", "employment_contract", made.id, { template: t.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: made.id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveContractDraft(id: string, body: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const [c] = await db.select().from(s.employmentContracts).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, id)));
    if (!c || c.status !== "draft") return { ok: false, error: "Only drafts can be edited. Void it and issue a new one." };
    await db.update(s.employmentContracts).set({ body }).where(eq(s.employmentContracts.id, id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Sends a draft to the employee to sign in their Me portal. */
export async function sendContract(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    const [c] = await db.select().from(s.employmentContracts).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, id)));
    if (!c || c.status !== "draft") return { ok: false, error: "Only drafts can be sent." };
    const gaps = unfilled(c.body);
    if (gaps.length) return { ok: false, error: `Fill in before sending: ${gaps.join(", ")}.` };
    await db.update(s.employmentContracts).set({ status: "sent", sentAt: new Date(), hash: sha(c.body) }).where(eq(s.employmentContracts.id, id));
    await audit(ctx, "update", "employment_contract", id, { sent: true });
    const [u] = await db.select({ email: s.user.email, name: s.user.name }).from(s.user).where(eq(s.user.id, c.userId));
    if (mailEnabled() && u && !u.email.endsWith(".test")) {
      const box = (await ensureMailboxes(ctx)).find((b) => b.kind === "shared");
      const base = process.env.BETTER_AUTH_URL ?? "https://lodgely.mapcn.workers.dev";
      if (box)
        await sendMail({
          agencyId: ctx.agencyId,
          from: { address: box.address, name: ctx.agencyName },
          to: [u.email],
          subject: `Your employment contract from ${ctx.agencyName}`,
          html: `<p>Hi ${u.name.split(" ")[0]},</p><p>Your employment contract is ready to read and sign.</p><p><a href="${base}/app/me/contracts/${id}">Read and sign your contract</a></p><p>The Fair Work Information Statement is here: <a href="https://www.fairwork.gov.au/employment-conditions/national-employment-standards/fair-work-information-statement">fairwork.gov.au</a>.</p>`,
        });
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function voidContract(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("payroll");
    await db.update(s.employmentContracts).set({ status: "void" }).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, id)));
    await audit(ctx, "update", "employment_contract", id, { void: true });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** The employee accepts their contract by typing their full name. Stores a signed PDF with an audit page. */
export async function signContract(id: string, typedName: string, agreed: boolean): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const [c] = await db.select().from(s.employmentContracts).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, id), eq(s.employmentContracts.userId, ctx.userId)));
    if (!c) return { ok: false, error: "Contract not found." };
    if (c.status !== "sent") return { ok: false, error: c.status === "signed" ? "You've already signed this contract." : "This contract isn't open for signing." };
    if (!agreed) return { ok: false, error: "Tick the box to agree." };
    const name = typedName.trim().replace(/\s+/g, " ");
    if (name.length < 3 || !name.includes(" ")) return { ok: false, error: "Type your full name as your signature." };
    if (sha(c.body) !== c.hash) return { ok: false, error: "This contract changed after it was sent. Ask HR to send it again." };
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip");
    const agent = h.get("user-agent");
    const signedAt = new Date();
    let pdfKey: string | null = null;
    try {
      const pdf = await contractPdf({ title: c.title, body: c.body, agencyName: ctx.agencyName, id: c.id, hash: c.hash!, sentByName: c.createdByName, sentAt: c.sentAt, signedName: name, signedAt, ip, agent, email: ctx.email }, await agencyLogo(ctx.agencyId));
      const blob = await putFile(`${agencyPrefix(ctx.agencyId)}contracts/${c.id}.pdf`, pdf, "application/pdf");
      pdfKey = blob.pathname;
    } catch (e) {
      console.error("contract pdf", e);
      pdfKey = null;
    }
    await db.update(s.employmentContracts).set({ status: "signed", signedAt, signedName: name, signedIp: ip, signedAgent: agent, pdfKey }).where(eq(s.employmentContracts.id, id));
    await audit(ctx, "update", "employment_contract", id, { signed: true, ip });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
