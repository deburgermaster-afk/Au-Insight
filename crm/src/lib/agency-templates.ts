import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { type ConsentTemplate, consentTemplates } from "@/lib/consent-templates";

/**
 * The consent templates an agency works with: Lodgely's set with the agency's own wording applied,
 * minus any it switched off, plus its own templates.
 */
export async function agencyTemplates(agencyId: string, opts: { includeDisabled?: boolean } = {}): Promise<(ConsentTemplate & { disabled?: boolean })[]> {
  const rows = await db.select().from(s.consentTemplateOverrides).where(eq(s.consentTemplateOverrides.agencyId, agencyId));
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const toTemplate = (r: (typeof rows)[number], base?: ConsentTemplate): ConsentTemplate & { disabled?: boolean } => ({
    ...(base ?? {}),
    key: r.key,
    title: r.title,
    group: (r.group as ConsentTemplate["group"]) || base?.group || "Engagement",
    summary: r.summary,
    body: r.body,
    checkboxes: r.checkboxes,
    textField: r.textField ?? undefined,
    initials: r.initials,
    countersign: r.countersign,
    edited: !r.custom,
    custom: r.custom,
    disabled: r.disabled,
  });
  const out = consentTemplates.map((t) => (byKey.has(t.key) ? toTemplate(byKey.get(t.key)!, t) : t));
  out.push(...rows.filter((r) => r.custom).map((r) => toTemplate(r)));
  return opts.includeDisabled ? out : out.filter((t) => !("disabled" in t && t.disabled));
}

export async function agencyTemplate(agencyId: string, key: string) {
  return (await agencyTemplates(agencyId)).find((t) => t.key === key) ?? null;
}
