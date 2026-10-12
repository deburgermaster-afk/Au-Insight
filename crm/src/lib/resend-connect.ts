import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { decrypt, encrypt } from "@/lib/secure";

// "Connect Resend": the agency authorizes its own Resend account with OAuth 2.1 + PKCE, so mail on
// its domain sends from (and counts against) its own plan. Lodgely registers itself as a public
// OAuth client once per deployment (dynamic client registration) and keeps the client_id.
const API = "https://api.resend.com";
const base = () => process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";
export const resendRedirect = () => `${base()}/api/connect/resend/callback`;
export const RESEND_SCOPE = "full_access";

async function clientId() {
  const uri = resendRedirect();
  const find = () => db.select({ id: s.oauthClients.clientId }).from(s.oauthClients).where(and(eq(s.oauthClients.provider, "resend"), eq(s.oauthClients.redirectUri, uri)));
  const [row] = await find();
  if (row) return row.id;
  const res = await fetch(`${API}/oauth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_name: "Lodgely", client_uri: base(), redirect_uris: [uri], grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", scope: RESEND_SCOPE }),
  });
  if (!res.ok) throw new Error(`Resend registration: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const { client_id } = (await res.json()) as { client_id: string };
  await db.insert(s.oauthClients).values({ provider: "resend", redirectUri: uri, clientId: client_id }).onConflictDoNothing();
  return (await find())[0]?.id ?? client_id;
}

/** A fresh PKCE pair: the verifier stays with us (sealed cookie), the challenge goes to Resend. */
export function pkce() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export async function resendAuthUrl(state: string, challenge: string) {
  const q = new URLSearchParams({ client_id: await clientId(), response_type: "code", redirect_uri: resendRedirect(), scope: RESEND_SCOPE, state, code_challenge: challenge, code_challenge_method: "S256" });
  return `${API}/oauth/authorize?${q}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`${API}/oauth/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: await clientId(), ...body }) });
  if (!res.ok) throw new Error(`Resend token: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Tokens;
}

/** Reads display claims from the access token (a JWT) without trusting them for anything else. */
function claims(jwt: string) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function completeResend(code: string, verifier: string, who: { agencyId: string; userId: string; name: string }) {
  const t = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: resendRedirect(), code_verifier: verifier });
  const c = claims(t.access_token);
  const account = [c.team_name, c.team, c.org_name, c.name].find((v): v is string => typeof v === "string" && v.length > 0) ?? null;
  const values = {
    agencyId: who.agencyId,
    kind: "resend",
    status: "active",
    account,
    scope: t.scope ?? RESEND_SCOPE,
    accessToken: encrypt(t.access_token),
    refreshToken: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    connectedBy: who.userId,
    connectedByName: who.name,
    lastError: null,
    updatedAt: new Date(),
  };
  const [row] = await db.insert(s.connectors).values(values).onConflictDoUpdate({ target: [s.connectors.agencyId, s.connectors.kind], set: values }).returning();
  return row;
}

export type Connector = typeof s.connectors.$inferSelect;

export async function resendConnector(agencyId: string) {
  const [c] = await db.select().from(s.connectors).where(and(eq(s.connectors.agencyId, agencyId), eq(s.connectors.kind, "resend")));
  return c ?? null;
}

// Refresh tokens rotate and can't be replayed, so one refresh per connector at a time.
const inflight = new Map<string, Promise<string>>();

/** A valid access token for the agency's Resend account, refreshing (and rotating) when needed. */
export async function resendToken(c: Connector): Promise<string> {
  if (c.expiresAt && c.expiresAt.getTime() > Date.now() + 30_000) return decrypt(c.accessToken);
  const running = inflight.get(c.id);
  if (running) return running;
  const job = (async () => {
    // Another instance may already have rotated it.
    const [now] = await db.select().from(s.connectors).where(eq(s.connectors.id, c.id));
    if (!now) throw new Error("Resend is no longer connected.");
    if (now.expiresAt && now.expiresAt.getTime() > Date.now() + 30_000) return decrypt(now.accessToken);
    if (!now.refreshToken) throw new Error("Reconnect Resend: the authorization expired.");
    try {
      const t = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(now.refreshToken) });
      await db
        .update(s.connectors)
        .set({ accessToken: encrypt(t.access_token), refreshToken: t.refresh_token ? encrypt(t.refresh_token) : now.refreshToken, expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000), status: "active", lastError: null, updatedAt: new Date() })
        .where(eq(s.connectors.id, c.id));
      return t.access_token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      await db.update(s.connectors).set({ status: "error", lastError: msg.slice(0, 300) }).where(eq(s.connectors.id, c.id));
      throw new Error("Reconnect Resend: the authorization was revoked or expired.");
    }
  })().finally(() => inflight.delete(c.id));
  inflight.set(c.id, job);
  return job;
}

/** Calls Resend as the agency (their connected account). */
export async function asAgency<T>(c: Connector, path: string, init?: RequestInit): Promise<T> {
  const { resend } = await import("@/lib/mail");
  return resend<T>(path, init, await resendToken(c));
}

export async function revokeResend(c: Connector) {
  if (!c.refreshToken) return;
  await fetch(`${API}/oauth/revoke`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(c.refreshToken), token_type_hint: "refresh_token", client_id: await clientId() }) }).catch(() => null);
}

export const WEBHOOK_EVENTS = ["email.received", "email.delivered", "email.bounced", "email.complained", "email.delivery_delayed", "email.failed"];
export const webhookUrl = (connectorId: string) => `${base()}/api/mail/webhook?c=${connectorId}`;
