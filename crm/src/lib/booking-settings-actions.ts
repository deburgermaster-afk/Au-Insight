"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { BookingHours } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { requireRole } from "@/lib/session";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Times look like 09:00.");
const range = z.tuple([hhmm, hhmm]).refine(([a, b]) => a < b, "Each block must end after it starts.");
const hoursSchema = z.object({ mon: z.array(range), tue: z.array(range), wed: z.array(range), thu: z.array(range), fri: z.array(range), sat: z.array(range), sun: z.array(range) });

export async function saveBookingSettings(input: { enabled: boolean; hours: BookingHours }): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const hours = hoursSchema.parse(input.hours) as BookingHours;
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, bookingEnabled: input.enabled, bookingHours: hours }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { bookingEnabled: input.enabled, bookingHours: hours, updatedAt: new Date() } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "booking_settings", detail: { enabled: input.enabled } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the hours." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const typeSchema = z.object({
  name: z.string().trim().min(2, "Name the appointment.").max(80),
  description: z.string().trim().max(500).optional().default(""),
  minutes: z.number().int().min(10).max(240),
  fee: z.number().min(0).max(100000).nullable(),
  mode: z.enum(["office", "phone", "video", "choice"]),
  staffIds: z.array(z.string()).max(50),
  videoLink: z.string().trim().url("Enter the full meeting link, starting with https://").or(z.literal("")).optional().default(""),
  bufferMinutes: z.number().int().min(0).max(120),
  minNoticeHours: z.number().int().min(0).max(720),
  maxDaysAhead: z.number().int().min(1).max(365),
  invoiceOnBooking: z.boolean(),
  active: z.boolean(),
});
export type BookingTypeInput = z.input<typeof typeSchema>;

const slugify = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "appointment";

export async function saveBookingType(id: string | null, input: BookingTypeInput): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const v = typeSchema.parse(input);
    const values = { ...v, fee: v.fee == null ? null : v.fee.toFixed(2), description: v.description || null, videoLink: v.videoLink || null };
    if (id) {
      const [r] = await db.update(s.bookingTypes).set({ ...values, updatedAt: new Date() }).where(and(eq(s.bookingTypes.agencyId, ctx.agencyId), eq(s.bookingTypes.id, id))).returning({ id: s.bookingTypes.id });
      if (!r) return { ok: false, error: "Not found." };
    } else {
      const existing = await db.select({ slug: s.bookingTypes.slug }).from(s.bookingTypes).where(eq(s.bookingTypes.agencyId, ctx.agencyId));
      let slug = slugify(v.name);
      for (let n = 2; existing.some((e) => e.slug === slug); n++) slug = `${slugify(v.name)}-${n}`;
      await db.insert(s.bookingTypes).values({ agencyId: ctx.agencyId, slug, sort: existing.length, ...values });
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the appointment type." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function deleteBookingType(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.delete(s.bookingTypes).where(and(eq(s.bookingTypes.agencyId, ctx.agencyId), eq(s.bookingTypes.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
