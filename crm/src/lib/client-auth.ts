import "server-only";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, lt, sql } from "drizzle-orm";
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
  return startSession(link);
}

// ── Email codes ────────────────────────────────────────────────────────────────────────────────
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const codeHash = (clientId: string, code: string) => createHmac("sha256", process.env.BETTER_AUTH_SECRET ?? "lodgely").update(`${clientId}:${code}`).digest("hex");

/** A 6-digit sign-in code for each of these client records (one email can be a client of several agencies). */
export async function createSignInCode(clients: { id: string; agencyId: string }[]) {
  const recent = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(s.clientSessions)
    .where(and(inArray(s.clientSessions.clientId, clients.map((c) => c.id)), eq(s.clientSessions.kind, "code"), gte(s.clientSessions.createdAt, new Date(Date.now() - CODE_MINUTES * 60_000))));
  if ((recent[0]?.n ?? 0) >= 3 * clients.length) return null; // three codes per 10 minutes is plenty
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(s.clientSessions).values(clients.map((c) => ({ agencyId: c.agencyId, clientId: c.id, tokenHash: codeHash(c.id, code), kind: "code", expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000) })));
  return code;
}

/** Checks a code typed by the client. Each wrong guess counts against every live code for that email. */
export async function redeemSignInCode(email: string, code: string) {
  const rows = await db
    .select({ row: s.clientSessions })
    .from(s.clientSessions)
    .innerJoin(s.clients, eq(s.clients.id, s.clientSessions.clientId))
    .where(and(sql`lower(${s.clients.email}) = ${email.trim().toLowerCase()}`, eq(s.clientSessions.kind, "code"), isNull(s.clientSessions.usedAt), gt(s.clientSessions.expiresAt, new Date()), lt(s.clientSessions.attempts, MAX_ATTEMPTS)))
    .orderBy(desc(s.clientSessions.createdAt));
  if (!rows.length) return { error: "That code has expired. Send a new one." } as const;
  const match = /^\d{6}$/.test(code) ? rows.find((r) => r.row.tokenHash === codeHash(r.row.clientId, code)) : undefined;
  const ids = rows.map((r) => r.row.id);
  if (!match) {
    await db.update(s.clientSessions).set({ attempts: sql`${s.clientSessions.attempts} + 1` }).where(inArray(s.clientSessions.id, ids));
    const left = MAX_ATTEMPTS - 1 - Math.max(...rows.map((r) => r.row.attempts));
    return { error: left > 0 ? `That code isn't right. ${left} ${left === 1 ? "try" : "tries"} left.` : "Too many tries. Send a new code." } as const;
  }
  await db.update(s.clientSessions).set({ usedAt: new Date() }).where(inArray(s.clientSessions.id, ids));
  return { session: await startSession(match.row) } as const;
}

async function startSession(link: typeof s.clientSessions.$inferSelect) {
  const session = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 864e5);
  await db.insert(s.clientSessions).values({ agencyId: link.agencyId, clientId: link.clientId, tokenHash: hash(session), kind: "session", expiresAt, createdBy: link.createdBy });
  await db.insert(s.activities).values({ agencyId: link.agencyId, clientId: link.clientId, kind: "system", title: link.createdBy ? "Portal opened by staff (view as client)" : "Client signed in to the portal" });
  return { token: session, expiresAt };
}

/** Sets the portal session cookie (server actions and route handlers only). */
export async function setClientCookie(session: { token: string; expiresAt: Date }) {
  (await cookies()).set(CLIENT_COOKIE, session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: session.expiresAt });
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
