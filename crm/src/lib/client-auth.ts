import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema as s } from "@/db";

export const CLIENT_COOKIE = "lodgely_client";
const SESSION_DAYS = 30;
const LINK_MINUTES = 60;

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const appUrl = () => process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";

/** A single-use sign-in link for a client's portal. */
export async function createMagicLink(clientId: string, agencyId: string, createdBy?: string) {
  const token = randomBytes(32).toString("base64url");
  await db.insert(s.clientSessions).values({ agencyId, clientId, tokenHash: hash(token), kind: "magic", expiresAt: new Date(Date.now() + LINK_MINUTES * 60_000), createdBy: createdBy ?? null });
  return `${appUrl()}/client/auth/${token}`;
}

/** Trades a magic link for a session token (stored in an httpOnly cookie by the caller). */
export async function redeemMagicLink(token: string) {
  const [link] = await db
    .update(s.clientSessions)
    .set({ usedAt: new Date() })
    .where(and(eq(s.clientSessions.tokenHash, hash(token)), eq(s.clientSessions.kind, "magic"), isNull(s.clientSessions.usedAt), gt(s.clientSessions.expiresAt, new Date())))
    .returning();
  if (!link) return null;
  const session = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(s.clientSessions).values({ agencyId: link.agencyId, clientId: link.clientId, tokenHash: hash(session), kind: "session", expiresAt, createdBy: link.createdBy });
  await db.insert(s.activities).values({ agencyId: link.agencyId, clientId: link.clientId, kind: "system", title: link.createdBy ? "Portal opened by staff (view as client)" : "Client signed in to the portal" });
  return { token: session, expiresAt };
}

/** The signed-in client, or null. Reads the session cookie, so call it only in dynamic code. */
export const clientSession = cache(async () => {
  const token = (await cookies()).get(CLIENT_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db
    .select({ client: s.clients, agency: s.organization, profile: s.agencyProfile, sessionId: s.clientSessions.id })
    .from(s.clientSessions)
    .innerJoin(s.clients, eq(s.clients.id, s.clientSessions.clientId))
    .innerJoin(s.organization, eq(s.organization.id, s.clientSessions.agencyId))
    .leftJoin(s.agencyProfile, eq(s.agencyProfile.agencyId, s.clientSessions.agencyId))
    .where(and(eq(s.clientSessions.tokenHash, hash(token)), eq(s.clientSessions.kind, "session"), gt(s.clientSessions.expiresAt, new Date())));
  return row ?? null;
});

export type ClientCtx = NonNullable<Awaited<ReturnType<typeof clientSession>>>;

/** For portal pages: the signed-in client, or off to sign in. */
export async function requireClient(): Promise<ClientCtx> {
  const c = await clientSession();
  if (!c) redirect("/client/sign-in");
  return c;
}

export async function endClientSession() {
  const jar = await cookies();
  const token = jar.get(CLIENT_COOKIE)?.value;
  if (token) await db.delete(s.clientSessions).where(eq(s.clientSessions.tokenHash, hash(token)));
  jar.delete(CLIENT_COOKIE);
}
