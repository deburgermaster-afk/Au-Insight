import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { memberCtx } from "@/lib/session";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");

/** A new extension sign-in. The raw token is handed to the extension once; only its hash is kept. */
export async function issueExtensionToken(agencyId: string, userId: string, label: string) {
  const token = `lxt_${randomBytes(32).toString("base64url")}`;
  await db.insert(s.extensionTokens).values({ agencyId, userId, tokenHash: hash(token), label: label.slice(0, 80) });
  return token;
}

/** Resolves "Authorization: Bearer lxt_…" to the member it belongs to (null if revoked or no longer a member). */
export async function extensionCtx(req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (lxt_[\w-]{20,})$/)?.[1];
  if (!token) return null;
  const [row] = await db.select().from(s.extensionTokens).where(and(eq(s.extensionTokens.tokenHash, hash(token)), isNull(s.extensionTokens.revokedAt)));
  if (!row) return null;
  const ctx = await memberCtx(row.agencyId, row.userId);
  if (!ctx) return null;
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) await db.update(s.extensionTokens).set({ lastUsedAt: new Date() }).where(eq(s.extensionTokens.id, row.id));
  return ctx;
}

/** CORS for the extension's requests (it also has host permission, so this mostly matters for errors). */
export const extHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, OPTIONS", "Cache-Control": "no-store" };
export const extJson = (data: unknown, status = 200) => Response.json(data, { status, headers: extHeaders });
