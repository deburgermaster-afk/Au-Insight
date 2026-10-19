"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { MailAttachment } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { readDocument } from "@/lib/doc-check";
import { fileBytes } from "@/lib/files";
import { completeJson, llmEnabled } from "@/lib/llm";
import { mrzValid, parseMrz } from "@/lib/mrz";
import { requireCap } from "@/lib/session";

export type PassportFields = {
  firstName: string;
  lastName: string;
  passportNumber: string;
  nationality: string;
  dateOfBirth: string | null;
  gender: string | null;
  passportExpiry: string | null;
  countryOfBirth: string | null;
};

const Read = z.object({
  isPassport: z.boolean(),
  mrzLine1: z.string().nullable(),
  mrzLine2: z.string().nullable(),
  surname: z.string().nullable(),
  givenNames: z.string().nullable(),
  passportNumber: z.string().nullable(),
  nationality: z.string().nullable().describe("Nationality as a country name in English, e.g. India"),
  dateOfBirth: z.string().nullable().describe("YYYY-MM-DD"),
  sex: z.string().nullable(),
  expiryDate: z.string().nullable().describe("YYYY-MM-DD"),
  placeOfBirth: z.string().nullable(),
  countryOfBirth: z.string().nullable().describe("Country of birth in English if it can be told from the place of birth"),
});

const title = (t: string) => t.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (m) => m.toUpperCase());
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
/** Dates as printed on passports: 2026-03-14, 14 MAR 2026, 14 MAR/MARS 2026 or 14/03/2026 (day first). */
function isoDate(v: string | null) {
  if (!v) return null;
  const t = v.trim().toUpperCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})\s+([A-Z]{3})[A-Z/ ]*?\s(\d{4})$/);
  if (m && MONTHS.includes(m[2])) return `${m[3]}-${String(MONTHS.indexOf(m[2]) + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const n = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (n) return `${n[3]}-${n[2].padStart(2, "0")}-${n[1].padStart(2, "0")}`;
  return null;
}

async function aiAllowed(agencyId: string) {
  const [p] = await db.select({ on: s.agencyProfile.aiDocsEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  return Boolean(p?.on) && llmEnabled();
}

/**
 * Reads a passport photo or PDF. The machine-readable zone is checked against its check digits:
 * when they pass, the number, dates and nationality come from the MRZ and are marked verified.
 */
export async function readPassport(file: MailAttachment): Promise<{ ok: true; fields: PassportFields; verified: boolean; warnings: string[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("clients");
    if (!file.key.startsWith(`agency/${ctx.agencyId}/`)) return { ok: false, error: "File not found." };
    if (!(await aiAllowed(ctx.agencyId))) return { ok: false, error: "Turn on AI document reading first (Settings → AI assistant → Documents)." };
    const got = await readDocument(await fileBytes(file.key), file.type, file.name);
    if ("unsupported" in got) return { ok: false, error: got.unsupported };
    const r = await completeJson(
      Read,
      "You read passport bio pages for an Australian migration agency. Copy exactly what is printed. The machine-readable zone (MRZ) is the two lines of 44 characters at the bottom, using < as filler: copy both lines character for character with no spaces. If something can't be read, use null. Never guess.",
      `File: ${file.name}${got.text ? `\n\nText found in the file:\n${got.text.slice(0, 4000)}` : ""}`,
      { images: got.images, timeoutMs: 90_000, maxTokens: 900 },
    );
    if (!r) return { ok: false, error: "The passport couldn't be read. Try a sharper, well-lit photo of the photo page." };
    const v = r.value;
    if (!v.isPassport) return { ok: false, error: "This doesn't look like a passport photo page." };
    const mrz = v.mrzLine1 && v.mrzLine2 ? parseMrz(v.mrzLine1, v.mrzLine2) : null;
    const verified = Boolean(mrz && mrzValid(mrz));
    const warnings: string[] = [];
    if (!mrz) warnings.push("The machine-readable lines couldn't be read, so check every field against the passport.");
    else if (!verified) warnings.push("The machine-readable lines didn't pass their check digits, so a character may have been misread. Check the number and dates.");
    const fields: PassportFields = {
      firstName: title((verified ? mrz!.givenNames : v.givenNames) ?? ""),
      lastName: title((verified ? mrz!.surname : v.surname) ?? ""),
      passportNumber: ((verified ? mrz!.passportNumber : v.passportNumber) ?? "").replace(/\s/g, "").toUpperCase(),
      nationality: v.nationality ?? mrz?.nationality ?? "",
      dateOfBirth: verified ? mrz!.dateOfBirth : isoDate(v.dateOfBirth),
      gender: (verified ? mrz!.sex : v.sex?.[0]?.toUpperCase()) === "M" ? "male" : (verified ? mrz!.sex : v.sex?.[0]?.toUpperCase()) === "F" ? "female" : null,
      passportExpiry: verified ? mrz!.expiry : isoDate(v.expiryDate),
      countryOfBirth: v.countryOfBirth,
    };
    if (fields.passportExpiry && fields.passportExpiry < new Date().toISOString().slice(0, 10)) warnings.push("This passport has expired.");
    else if (fields.passportExpiry && Date.parse(fields.passportExpiry) - Date.now() < 183 * 864e5) warnings.push("This passport expires within 6 months.");
    return { ok: true, fields, verified, warnings };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const apply = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  passportNumber: z.string().trim().max(20),
  nationality: z.string().trim().max(60),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  gender: z.string().nullable(),
  passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  countryOfBirth: z.string().trim().max(60).nullable(),
});

async function fileThePassport(ctx: { agencyId: string; userId: string; name: string }, clientId: string, file: MailAttachment, expiry: string | null) {
  await db.insert(s.documents).values({ agencyId: ctx.agencyId, clientId, name: file.name, category: "Identity", mimeType: file.type, sizeBytes: file.size, storageKey: file.key, uploadedBy: ctx.name, source: "upload", expiresAt: expiry });
}

/** Saves the fields the agent chose onto the client, and files the passport scan. */
export async function applyPassport(clientId: string, raw: Partial<PassportFields>, file: MailAttachment): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    if (!file.key.startsWith(`agency/${ctx.agencyId}/`)) return { ok: false, error: "File not found." };
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    const v = apply.partial().parse(raw);
    const set = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined && x !== "")) as Partial<typeof s.clients.$inferInsert>;
    if (Object.keys(set).length) await db.update(s.clients).set({ ...set, updatedAt: new Date() }).where(eq(s.clients.id, clientId));
    await fileThePassport(ctx, clientId, file, v.passportExpiry ?? null);
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "client", entityId: clientId, detail: { from: "passport scan", before: Object.fromEntries(Object.keys(set).map((k) => [k, (c as Record<string, unknown>)[k] ?? null])), after: set } });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "document", title: "Passport scanned", body: `Updated: ${Object.keys(set).join(", ") || "nothing"}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the fields." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** New client straight from a passport scan (as a lead). */
export async function clientFromPassport(raw: PassportFields, file: MailAttachment): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    if (!file.key.startsWith(`agency/${ctx.agencyId}/`)) return { ok: false, error: "File not found." };
    const v = apply.parse(raw);
    if (v.passportNumber) {
      const [dupe] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.passportNumber, v.passportNumber)));
      if (dupe) return { ok: false, error: "A client with this passport number already exists.", };
    }
    const [c] = await db.insert(s.clients).values({ agencyId: ctx.agencyId, ...v, stage: "lead", source: "Passport scan", assignedTo: ctx.userId }).returning({ id: s.clients.id });
    await fileThePassport(ctx, c.id, file, v.passportExpiry);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: c.id, kind: "system", title: "Client added from a passport scan", actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: c.id };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the fields." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
