"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { agencyPrefix } from "@/lib/files";
import { todayIso } from "@/lib/format";
import { assessLmt, LMT_PLATFORMS, type LmtAd } from "@/lib/lmt";
import { requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof z.ZodError ? (e.issues[0]?.message ?? "Check the form.") : e instanceof Error ? e.message : String(e) });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");

const adInput = z.object({
  platform: z.enum(LMT_PLATFORMS.map((p) => p.value) as [string, ...string[]], { message: "Choose where it was advertised." }),
  adTitle: z.string().trim().min(2, "Enter the ad's title.").max(160),
  url: z.string().trim().url("Enter the full link, starting with https://").or(z.literal("")).nullable(),
  publishedOn: isoDate,
  endsOn: isoDate.or(z.literal("")).nullable(),
  showsTitle: z.boolean(),
  showsEmployer: z.boolean(),
  showsSkills: z.boolean(),
  showsSalary: z.boolean(),
  applicants: z.number().int().min(0).max(100000).nullable(),
  evidence: z.array(z.object({ name: z.string().max(200), key: z.string().max(400), size: z.number(), type: z.string().max(120) })).max(20),
  notes: z.string().trim().max(2000).nullable(),
});
export type LmtAdInput = z.input<typeof adInput>;

async function nominationOf(agencyId: string, id: string) {
  const [n] = await db.select().from(s.nominations).where(and(eq(s.nominations.agencyId, agencyId), eq(s.nominations.id, id)));
  if (!n) throw new Error("Nomination not found.");
  return n;
}

/** Keeps the nomination's LMT status in step with its ads. */
async function syncStatus(agencyId: string, nominationId: string) {
  const n = await nominationOf(agencyId, nominationId);
  const ads = (await db.select().from(s.lmtAds).where(eq(s.lmtAds.nominationId, nominationId))) as LmtAd[];
  const r = assessLmt(ads, { salary: n.salary ? Number(n.salary) : null, lodgeOn: n.lodgedAt, today: todayIso() });
  const lmt = n.lmtExemption ? "not_required" : r.complete ? "done" : ads.length ? "in_progress" : "needed";
  if (lmt !== n.lmt) await db.update(s.nominations).set({ lmt, updatedAt: new Date() }).where(eq(s.nominations.id, n.id));
  return n;
}

function done(agencyId: string, employerId: string, nominationId: string) {
  updateTag(agencyTag(agencyId));
  revalidatePath(`/app/employers/${employerId}/lmt/${nominationId}`);
}

export async function saveLmtAd(nominationId: string, id: string | null, input: LmtAdInput): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const v = adInput.parse(input);
    if (v.endsOn && v.endsOn < v.publishedOn) return { ok: false, error: "The closing date is before the ad was published." };
    if (v.publishedOn > todayIso()) return { ok: false, error: "The publish date can't be in the future." };
    // Evidence must be this agency's own uploads.
    if (v.evidence.some((f) => !f.key.startsWith(agencyPrefix(ctx.agencyId)))) return { ok: false, error: "One of the files isn't from this agency." };
    const n = await nominationOf(ctx.agencyId, nominationId);
    const row = { platform: v.platform, adTitle: v.adTitle, url: v.url || null, publishedOn: v.publishedOn, endsOn: v.endsOn || null, showsTitle: v.showsTitle, showsEmployer: v.showsEmployer, showsSkills: v.showsSkills, showsSalary: v.showsSalary, applicants: v.applicants, evidence: v.evidence, notes: v.notes };
    if (id) {
      const r = await db.update(s.lmtAds).set({ ...row, updatedAt: new Date() }).where(and(eq(s.lmtAds.agencyId, ctx.agencyId), eq(s.lmtAds.id, id), eq(s.lmtAds.nominationId, nominationId))).returning({ id: s.lmtAds.id });
      if (!r.length) return { ok: false, error: "Ad not found." };
    } else {
      await db.insert(s.lmtAds).values({ ...row, agencyId: ctx.agencyId, nominationId, createdBy: ctx.userId });
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: id ? "update" : "create", entity: "lmt_ad", entityId: id ?? nominationId, detail: { platform: v.platform, publishedOn: v.publishedOn } });
    await syncStatus(ctx.agencyId, nominationId);
    done(ctx.agencyId, n.employerId, nominationId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteLmtAd(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const [a] = await db.select().from(s.lmtAds).where(and(eq(s.lmtAds.agencyId, ctx.agencyId), eq(s.lmtAds.id, id)));
    if (!a) return { ok: false, error: "Ad not found." };
    await db.delete(s.lmtAds).where(eq(s.lmtAds.id, id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "lmt_ad", entityId: id, detail: { platform: a.platform, publishedOn: a.publishedOn } });
    const n = await syncStatus(ctx.agencyId, a.nominationId);
    done(ctx.agencyId, n.employerId, a.nominationId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Records why testing isn't needed (or clears it). */
export async function setLmtExemption(nominationId: string, reason: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const r = reason?.trim().slice(0, 300) || null;
    const n = await nominationOf(ctx.agencyId, nominationId);
    await db.update(s.nominations).set({ lmtExemption: r, updatedAt: new Date() }).where(eq(s.nominations.id, n.id));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "nomination", entityId: n.id, detail: { lmtExemption: r } });
    await syncStatus(ctx.agencyId, nominationId);
    done(ctx.agencyId, n.employerId, nominationId);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
