"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { issueExtensionToken } from "@/lib/ext-auth";
import { actionCtx } from "@/lib/session";

/** Approves the ImmiAccount extension for this browser; the token goes straight to the extension. */
export async function approveExtension(label: string): Promise<ActionResult & { token?: string; user?: { name: string; agency: string } }> {
  try {
    const ctx = await actionCtx();
    if (!ctx.caps.includes("clients")) return { ok: false, error: "Your role doesn't include client files." };
    const token = await issueExtensionToken(ctx.agencyId, ctx.userId, label || "Browser");
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "extension_token", entityId: ctx.userId, detail: { label } });
    return { ok: true, token, user: { name: ctx.name, agency: ctx.agencyName } };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function myExtensions() {
  const ctx = await actionCtx();
  return db
    .select({ id: s.extensionTokens.id, label: s.extensionTokens.label, createdAt: s.extensionTokens.createdAt, lastUsedAt: s.extensionTokens.lastUsedAt })
    .from(s.extensionTokens)
    .where(and(eq(s.extensionTokens.agencyId, ctx.agencyId), eq(s.extensionTokens.userId, ctx.userId), isNull(s.extensionTokens.revokedAt)))
    .orderBy(desc(s.extensionTokens.createdAt));
}

export async function revokeExtension(id: string): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    await db.update(s.extensionTokens).set({ revokedAt: new Date() }).where(and(eq(s.extensionTokens.id, id), eq(s.extensionTokens.userId, ctx.userId), eq(s.extensionTokens.agencyId, ctx.agencyId)));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
