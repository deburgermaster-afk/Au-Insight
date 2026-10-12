"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { canAtLeast, requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

export async function createFolder(name: string, parentId: string | null, minRole: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("files");
    const n = name.trim();
    if (!n) return { ok: false, error: "Name the folder." };
    if (!["staff", "agent", "supervisor", "admin"].includes(minRole)) return { ok: false, error: "Unknown access level." };
    const [row] = await db.insert(s.folders).values({ agencyId: ctx.agencyId, name: n.slice(0, 80), parentId, minRole, createdBy: ctx.name }).returning({ id: s.folders.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function renameFolder(id: string, name: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("files");
    await db.update(s.folders).set({ name: name.trim().slice(0, 80) }).where(and(eq(s.folders.agencyId, ctx.agencyId), eq(s.folders.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFolder(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("files");
    const [child] = await db.select({ id: s.folders.id }).from(s.folders).where(and(eq(s.folders.agencyId, ctx.agencyId), eq(s.folders.parentId, id))).limit(1);
    const [doc] = await db.select({ id: s.documents.id }).from(s.documents).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.folderId, id))).limit(1);
    if (child || doc) return { ok: false, error: "Empty the folder first." };
    await db.delete(s.folders).where(and(eq(s.folders.agencyId, ctx.agencyId), eq(s.folders.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function moveDocument(id: string, folderId: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireCap("files");
    await db.update(s.documents).set({ folderId }).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Removes a document record. Client files must be kept 7 years (Code of Conduct s56), so only admins can. */
export async function deleteDocument(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("files");
    if (!canAtLeast(ctx.role, "admin")) return { ok: false, error: "Only admins can delete files: client records must be kept for 7 years." };
    await db.delete(s.documents).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.id, id)));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "document", entityId: id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
