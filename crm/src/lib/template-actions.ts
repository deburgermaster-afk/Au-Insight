"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { consentByKey } from "@/lib/consent-templates";
import { agencyTag } from "@/lib/data";
import { requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

const schema = z.object({
  title: z.string().trim().min(3, "Give the form a title.").max(120),
  group: z.enum(["Engagement", "Privacy & authority", "Application", "Third parties", "Money", "Ending"]),
  summary: z.string().trim().max(240),
  body: z.string().trim().min(20, "Add the wording of the form.").max(20000),
  checkboxes: z.array(z.object({ id: z.string().max(30), label: z.string().trim().min(3).max(240), required: z.boolean().optional() })).max(8),
  textField: z.object({ id: z.string().max(30), label: z.string().trim().min(3).max(120), required: z.boolean().optional() }).nullable(),
  initials: z.boolean(),
  countersign: z.boolean(),
});
export type TemplateInput = z.infer<typeof schema>;

/** Admin: save the agency's wording for a template ("new" creates the agency's own template). Returns its key. */
export async function saveTemplate(key: string, input: TemplateInput): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const v = schema.parse(input);
    const custom = key === "new" || key.startsWith("own-");
    if (!custom && !consentByKey(key)) return { ok: false, error: "Template not found." };
    const k = key === "new" ? `own-${crypto.randomUUID().slice(0, 8)}` : key;
    const values = { ...v, checkboxes: v.checkboxes.map((c, i) => ({ ...c, id: c.id || `c${i + 1}` })), textField: v.textField ? { ...v.textField, id: v.textField.id || "text" } : null, updatedBy: ctx.name, custom, updatedAt: new Date() };
    await db
      .insert(s.consentTemplateOverrides)
      .values({ agencyId: ctx.agencyId, key: k, ...values })
      .onConflictDoUpdate({ target: [s.consentTemplateOverrides.agencyId, s.consentTemplateOverrides.key], set: values });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: key === "new" ? "create" : "update", entity: "consent_template", entityId: k, detail: { title: v.title } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: k };
  } catch (e) {
    return fail(e);
  }
}

/** Admin: back to Lodgely's wording (built-in), or delete the agency's own template. */
export async function resetTemplate(key: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.delete(s.consentTemplateOverrides).where(and(eq(s.consentTemplateOverrides.agencyId, ctx.agencyId), eq(s.consentTemplateOverrides.key, key)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "consent_template", entityId: key });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Admin: hide a template from the library (or show it again). */
export async function setTemplateHidden(key: string, hidden: boolean, current: TemplateInput): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const v = schema.parse(current);
    await db
      .insert(s.consentTemplateOverrides)
      .values({ agencyId: ctx.agencyId, key, ...v, custom: key.startsWith("own-"), disabled: hidden, updatedBy: ctx.name })
      .onConflictDoUpdate({ target: [s.consentTemplateOverrides.agencyId, s.consentTemplateOverrides.key], set: { disabled: hidden, updatedBy: ctx.name, updatedAt: new Date() } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
