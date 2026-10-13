"use server";

import { and, eq, inArray } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { type DupInput, dupKeys } from "@/lib/client-import";
import { agencyTag } from "@/lib/data";
import { mergeClientRecords } from "@/lib/duplicates";
import { requireCap, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/** Existing clients indexed by their strong duplicate keys (email, passport, name + date of birth). */
async function existingIndex(agencyId: string) {
  const rows = await db
    .select({ id: s.clients.id, firstName: s.clients.firstName, lastName: s.clients.lastName, email: s.clients.email, phone: s.clients.phone, dateOfBirth: s.clients.dateOfBirth, passportNumber: s.clients.passportNumber })
    .from(s.clients)
    .where(eq(s.clients.agencyId, agencyId));
  const idx = new Map<string, { id: string; name: string; reason: string }>();
  for (const r of rows) for (const k of dupKeys(r)) if (k.strong && !idx.has(k.key)) idx.set(k.key, { id: r.id, name: `${r.firstName} ${r.lastName}`, reason: k.reason });
  return idx;
}
const matchIn = (idx: Map<string, { id: string; name: string; reason: string }>, c: DupInput) => {
  for (const k of dupKeys(c)) if (k.strong && idx.has(k.key)) return idx.get(k.key)!;
  return null;
};

/** Preview: which import rows look like clients you already have. */
export async function checkImport(rows: DupInput[]): Promise<{ ok: true; matches: ({ id: string; name: string; reason: string } | null)[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("clients");
    const idx = await existingIndex(ctx.agencyId);
    return { ok: true, matches: rows.slice(0, 5000).map((r) => matchIn(idx, r)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const row = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100),
  email: z.string().email().max(200).nullable(),
  phone: z.string().max(50).nullable(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  gender: z.string().max(30).nullable(),
  nationality: z.string().max(80).nullable(),
  countryOfBirth: z.string().max(80).nullable(),
  passportNumber: z.string().max(30).nullable(),
  passportExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  address: z.string().max(300).nullable(),
  city: z.string().max(100).nullable(),
  state: z.string().max(50).nullable(),
  currentVisa: z.string().max(30).nullable(),
  visaExpiry: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  occupation: z.string().max(120).nullable(),
  anzsco: z.string().max(20).nullable(),
  englishTest: z.string().max(40).nullable(),
  englishScore: z.string().max(60).nullable(),
  stage: z.enum(["lead", "prospect", "active", "on_hold", "past", "lost"]),
  source: z.string().max(80).nullable(),
  tags: z.array(z.string().max(40)).max(20),
  notes: z.string().max(5000).nullable(),
});

/**
 * Imports a batch (up to 250). Rows that match an existing client are skipped, update that client
 * (only fields it doesn't have yet), or are created anyway, as chosen.
 */
export async function importClients(input: unknown[], onDuplicate: "skip" | "update" | "create"): Promise<ActionResult & { created?: number; updated?: number; skipped?: number; failed?: { index: number; error: string }[] }> {
  try {
    const ctx = await requireCap("clients");
    if (input.length > 250) return { ok: false, error: "Send at most 250 rows at a time." };
    const idx = await existingIndex(ctx.agencyId);
    const failed: { index: number; error: string }[] = [];
    const toInsert: (typeof s.clients.$inferInsert)[] = [];
    let updated = 0;
    let skipped = 0;
    for (let i = 0; i < input.length; i++) {
      const parsed = row.safeParse(input[i]);
      if (!parsed.success) {
        failed.push({ index: i, error: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }
      const v = parsed.data;
      const match = onDuplicate === "create" ? null : matchIn(idx, v);
      if (match && onDuplicate === "skip") {
        skipped++;
        continue;
      }
      if (match) {
        const [cur] = await db.select().from(s.clients).where(eq(s.clients.id, match.id));
        const fill: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v)) {
          if (k === "tags" || k === "stage" || val == null || val === "") continue;
          if ((cur as Record<string, unknown>)[k] == null || (cur as Record<string, unknown>)[k] === "") fill[k] = val;
        }
        const tags = [...new Set([...(cur.tags ?? []), ...v.tags])];
        await db.update(s.clients).set({ ...fill, tags, updatedAt: new Date() }).where(eq(s.clients.id, cur.id));
        updated++;
        continue;
      }
      toInsert.push({ ...v, agencyId: ctx.agencyId, assignedTo: ctx.userId, source: v.source ?? "Import" });
      // Later rows in the same file match this one too.
      for (const k of dupKeys(v)) if (k.strong && !idx.has(k.key)) idx.set(k.key, { id: "pending", name: `${v.firstName} ${v.lastName}`, reason: k.reason });
    }
    let created = 0;
    if (toInsert.length) {
      const ids = await db.insert(s.clients).values(toInsert).returning({ id: s.clients.id });
      created = ids.length;
      await db.insert(s.activities).values(ids.map((r) => ({ agencyId: ctx.agencyId, clientId: r.id, kind: "system", title: "Client imported from CSV", actorId: ctx.userId, actorName: ctx.name })));
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "import", entity: "client", entityId: ctx.agencyId, detail: { created, updated, skipped, failed: failed.length } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, created, updated, skipped, failed };
  } catch (e) {
    return fail(e);
  }
}

const MERGEABLE = ["firstName", "lastName", "email", "phone", "dateOfBirth", "gender", "nationality", "countryOfBirth", "passportNumber", "passportExpiry", "address", "city", "state", "currentVisa", "visaExpiry", "occupation", "anzsco", "englishTest", "englishScore", "stage", "source"] as const;

/** Admin: merge duplicates into one client. Chosen values win; everything else moves across. */
export async function mergeClients(keepId: string, removeIds: string[], chosen: Record<string, string | null>): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const ids = [...new Set(removeIds)].filter((x) => x !== keepId);
    if (!ids.length) return { ok: false, error: "Pick at least one duplicate to merge." };
    const all = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), inArray(s.clients.id, [keepId, ...ids])));
    const keep = all.find((c) => c.id === keepId);
    if (!keep || all.length !== ids.length + 1) return { ok: false, error: "Those clients aren't all in your agency." };
    const others = all.filter((c) => c.id !== keepId);
    const values: Record<string, unknown> = {};
    for (const k of MERGEABLE) if (k in chosen) values[k] = chosen[k] || null;
    values.firstName = values.firstName ?? keep.firstName;
    values.lastName = values.lastName ?? keep.lastName;
    values.tags = [...new Set([keep, ...others].flatMap((c) => c.tags ?? []))];
    values.notes = [keep.notes, ...others.map((c) => c.notes)].filter(Boolean).join("\n\n— merged —\n") || null;
    values.portalEnabled = [keep, ...others].some((c) => c.portalEnabled);
    values.onshore = keep.onshore;
    await mergeClientRecords(ctx.agencyId, keepId, ids, values);
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: keepId, kind: "system", title: `Merged ${others.length} duplicate record${others.length === 1 ? "" : "s"}`, body: others.map((c) => `${c.firstName} ${c.lastName}${c.email ? ` <${c.email}>` : ""}`).join("\n"), actorId: ctx.userId, actorName: ctx.name });
    // The removed records are kept in the audit log in full, in case a merge needs undoing by hand.
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "merge", entity: "client", entityId: keepId, detail: { removed: others, kept: keep } as never });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: keepId };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: these records are different people; stop suggesting them. */
export async function dismissDuplicates(ids: string[]): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const list = [...new Set(ids)].sort();
    const values = list.flatMap((a, i) => list.slice(i + 1).map((b) => ({ agencyId: ctx.agencyId, a, b, createdBy: ctx.userId })));
    if (values.length) await db.insert(s.duplicateDismissals).values(values).onConflictDoNothing();
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
