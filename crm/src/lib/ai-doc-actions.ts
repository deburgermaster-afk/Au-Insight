"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { runDocCheck } from "@/lib/doc-check";
import { DRAFT_KINDS, type DraftKind, generateDraft } from "@/lib/drafting";
import { llmEnabled } from "@/lib/llm";
import { requireCap, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function aiOn(agencyId: string) {
  if (!llmEnabled()) throw new Error("The AI service isn't configured on this server.");
  const [p] = await db.select({ on: s.agencyProfile.aiDocsEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  if (!p?.on) throw new Error("Turn on AI document checks and drafting in Settings → AI assistant first.");
}

/** Admin: switch AI document checks and drafting on (records who agreed, and when) or off. */
export async function setAiDocs(on: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.update(s.agencyProfile).set(on ? { aiDocsEnabledAt: new Date(), aiDocsEnabledBy: ctx.name } : { aiDocsEnabledAt: null, aiDocsEnabledBy: null }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "ai_docs", entityId: ctx.agencyId, detail: { on } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: check (or re-check) one document now. */
export async function checkDocumentNow(documentId: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    await aiOn(ctx.agencyId);
    const row = await runDocCheck(ctx.agencyId, documentId, ctx.userId);
    updateTag(agencyTag(ctx.agencyId));
    if (row.status === "unsupported") return { ok: false, error: row.error ?? "This file type can't be checked." };
    if (row.status === "failed") return { ok: false, error: row.error ?? "Couldn't check this document." };
    return { ok: true, id: row.verdict ?? "" };
  } catch (e) {
    return fail(e);
  }
}

/** Staff: write a new AI draft for the matter. Returns the draft id. */
export async function createDraft(matterId: string, kind: string, instructions: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    await aiOn(ctx.agencyId);
    if (!(kind in DRAFT_KINDS)) return { ok: false, error: "Unknown draft type." };
    const d = await generateDraft(ctx.agencyId, matterId, kind as DraftKind, instructions, ctx.name);
    const [row] = await db
      .insert(s.drafts)
      .values({ agencyId: ctx.agencyId, matterId, kind, title: d.title || DRAFT_KINDS[kind as DraftKind].title, body: d.body, checks: d.checks, model: d.model, createdBy: ctx.userId, createdByName: ctx.name })
      .returning({ id: s.drafts.id });
    const [m] = await db.select({ clientId: s.matters.clientId }).from(s.matters).where(eq(s.matters.id, matterId));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m?.clientId ?? null, matterId, kind: "note", title: `AI draft: ${DRAFT_KINDS[kind as DraftKind].title}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function saveDraft(id: string, title: string, body: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    await db.update(s.drafts).set({ title: title.trim().slice(0, 200) || "Draft", body, updatedAt: new Date() }).where(and(eq(s.drafts.agencyId, ctx.agencyId), eq(s.drafts.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDraft(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    await db.delete(s.drafts).where(and(eq(s.drafts.agencyId, ctx.agencyId), eq(s.drafts.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
