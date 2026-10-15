import "server-only";
import { and, eq, lt, or, isNull, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { MailAttachment } from "@/db/crm-schema";
import { putFile, fileBytes, safeName } from "@/lib/files";
import { analyzeMessage } from "@/lib/mail-ai";
import { decrypt, encrypt } from "@/lib/secure";

// ── Providers ──────────────────────────────────────────────────────────────────────────────────
export type Provider = "google" | "microsoft";
const P = {
  google: {
    id: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    auth: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    scope: "openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send",
    extra: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    id: () => process.env.MICROSOFT_CLIENT_ID,
    secret: () => process.env.MICROSOFT_CLIENT_SECRET,
    auth: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    token: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email profile offline_access User.Read Mail.Read Mail.Send",
    extra: { prompt: "select_account" },
  },
} as const;

export const providerReady = (p: Provider) => Boolean(P[p].id() && P[p].secret());
export const isProvider = (v: string): v is Provider => v === "google" || v === "microsoft";
const base = () => process.env.BETTER_AUTH_URL ?? "https://lodgely.mapcn.workers.dev";
export const redirectUri = (p: Provider) => `${base()}/api/connect/${p}/callback`;

export function authUrl(p: Provider, state: string, loginHint?: string) {
  const q = new URLSearchParams({ client_id: P[p].id()!, redirect_uri: redirectUri(p), response_type: "code", scope: P[p].scope, state, ...P[p].extra, ...(loginHint ? { login_hint: loginHint } : {}) });
  return `${P[p].auth}?${q}`;
}

type Tokens = { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
async function tokenRequest(p: Provider, body: Record<string, string>) {
  const res = await fetch(P[p].token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: P[p].id()!, client_secret: P[p].secret()!, ...body }) });
  if (!res.ok) throw new Error(`${p} token: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as Tokens;
}

/** Finishes the OAuth flow: exchanges the code, reads the mailbox address, stores tokens encrypted. */
export async function completeConnection(p: Provider, code: string, who: { agencyId: string; userId: string; name: string }) {
  const t = await tokenRequest(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(p) });
  const email =
    p === "google"
      ? ((await (await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { email: string }).email
      : await (async () => {
          const me = (await (await fetch("https://graph.microsoft.com/v1.0/me", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { mail?: string; userPrincipalName?: string };
          return me.mail ?? me.userPrincipalName ?? "";
        })();
  if (!email) throw new Error("Couldn't read the mailbox address.");
  const values = {
    agencyId: who.agencyId,
    userId: who.userId,
    provider: p,
    email: email.toLowerCase(),
    accessToken: encrypt(t.access_token),
    refreshToken: t.refresh_token ? encrypt(t.refresh_token) : null,
    expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000),
    status: "active",
    lastError: null,
  };
  const [existing] = await db.select({ id: s.mailConnections.id, refresh: s.mailConnections.refreshToken }).from(s.mailConnections).where(and(eq(s.mailConnections.agencyId, who.agencyId), eq(s.mailConnections.email, values.email)));
  const id = existing
    ? (await db.update(s.mailConnections).set({ ...values, refreshToken: values.refreshToken ?? existing.refresh }).where(eq(s.mailConnections.id, existing.id)).returning({ id: s.mailConnections.id }))[0].id
    : (await db.insert(s.mailConnections).values(values).returning({ id: s.mailConnections.id }))[0].id;
  // The connected address becomes one of the person's mailboxes in Lodgely.
  await db.insert(s.mailboxes).values({ agencyId: who.agencyId, address: values.email, name: who.name, userId: who.userId, kind: "personal" }).onConflictDoNothing();
  return { id, email: values.email };
}

type Conn = typeof s.mailConnections.$inferSelect;
async function accessToken(c: Conn) {
  if (c.expiresAt && c.expiresAt > new Date()) return decrypt(c.accessToken);
  if (!c.refreshToken) throw new Error("Reconnect this mailbox: no refresh token.");
  const t = await tokenRequest(c.provider as Provider, { grant_type: "refresh_token", refresh_token: decrypt(c.refreshToken) });
  await db
    .update(s.mailConnections)
    .set({ accessToken: encrypt(t.access_token), refreshToken: t.refresh_token ? encrypt(t.refresh_token) : c.refreshToken, expiresAt: new Date(Date.now() + (t.expires_in - 60) * 1000) })
    .where(eq(s.mailConnections.id, c.id));
  return t.access_token;
}

// ── Inbound ───────────────────────────────────────────────────────────────────────────────────
type Inbound = { providerId: string; messageId: string | null; inReplyTo: string | null; from: string; fromName: string | null; to: string[]; cc: string[]; subject: string; html: string | null; text: string | null; date: Date; attachments: { name: string; type: string; size: number; load: () => Promise<Buffer> }[] };

const addr = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();
const display = (v: string) => v.match(/^\s*"?([^"<]+?)"?\s*</)?.[1]?.trim() ?? null;
const list = (v?: string) => (v ? v.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(addr).filter(Boolean) : []);
const b64url = (v: string) => Buffer.from(v.replace(/-/g, "+").replace(/_/g, "/"), "base64");

type GPart = { mimeType: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; attachmentId?: string; size?: number }; parts?: GPart[] };

async function gmailInbound(token: string, since: Date): Promise<Inbound[]> {
  const g = (path: string) => fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, { headers: { Authorization: `Bearer ${token}` } }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`gmail ${r.status} ${(await r.text()).slice(0, 160)}`))));
  const q = encodeURIComponent(`in:inbox after:${Math.floor(since.getTime() / 1000)}`);
  const ids = ((await g(`messages?q=${q}&maxResults=40`)) as { messages?: { id: string }[] }).messages ?? [];
  const out: Inbound[] = [];
  for (const { id } of ids) {
    const m = (await g(`messages/${id}?format=full`)) as { id: string; internalDate: string; payload: GPart };
    const h = (n: string) => m.payload.headers?.find((x) => x.name.toLowerCase() === n)?.value ?? "";
    let html: string | null = null;
    let text: string | null = null;
    const atts: Inbound["attachments"] = [];
    const walk = (p: GPart) => {
      if (p.filename && p.body?.attachmentId) {
        const aid = p.body.attachmentId;
        atts.push({ name: p.filename, type: p.mimeType, size: p.body.size ?? 0, load: async () => b64url(((await g(`messages/${id}/attachments/${aid}`)) as { data: string }).data) });
      } else if (p.mimeType === "text/html" && p.body?.data && !html) html = b64url(p.body.data).toString("utf8");
      else if (p.mimeType === "text/plain" && p.body?.data && !text) text = b64url(p.body.data).toString("utf8");
      p.parts?.forEach(walk);
    };
    walk(m.payload);
    out.push({ providerId: `gmail:${m.id}`, messageId: h("message-id") || null, inReplyTo: h("in-reply-to") || null, from: addr(h("from")), fromName: display(h("from")), to: list(h("to")), cc: list(h("cc")), subject: h("subject") || "(no subject)", html, text, date: new Date(Number(m.internalDate)), attachments: atts });
  }
  return out;
}

async function graphInbound(token: string, since: Date): Promise<Inbound[]> {
  const g = (path: string) => fetch(`https://graph.microsoft.com/v1.0/me/${path}`, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="html"' } }).then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`graph ${r.status} ${(await r.text()).slice(0, 160)}`))));
  type E = { emailAddress: { address: string; name?: string } };
  type M = { id: string; subject: string; receivedDateTime: string; internetMessageId?: string; from?: E; toRecipients: E[]; ccRecipients: E[]; body: { contentType: string; content: string }; hasAttachments: boolean; internetMessageHeaders?: { name: string; value: string }[] };
  const filter = encodeURIComponent(`receivedDateTime ge ${since.toISOString()}`);
  const page = (await g(`mailFolders/inbox/messages?$filter=${filter}&$orderby=receivedDateTime desc&$top=40&$select=id,subject,receivedDateTime,internetMessageId,from,toRecipients,ccRecipients,body,hasAttachments`)) as { value: M[] };
  return page.value.map((m) => ({
    providerId: `graph:${m.id}`,
    messageId: m.internetMessageId ?? null,
    inReplyTo: null,
    from: (m.from?.emailAddress.address ?? "").toLowerCase(),
    fromName: m.from?.emailAddress.name ?? null,
    to: m.toRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    cc: m.ccRecipients.map((r) => r.emailAddress.address.toLowerCase()),
    subject: m.subject || "(no subject)",
    html: m.body.contentType === "html" ? m.body.content : null,
    text: m.body.contentType === "text" ? m.body.content : null,
    date: new Date(m.receivedDateTime),
    attachments: [],
    _hasAttachments: m.hasAttachments,
    _load: async () => {
      const a = (await g(`messages/${m.id}/attachments`)) as { value: { "@odata.type": string; name: string; contentType: string; size: number; contentBytes?: string }[] };
      return a.value.filter((x) => x["@odata.type"] === "#microsoft.graph.fileAttachment" && x.contentBytes).map((x) => ({ name: x.name, type: x.contentType, size: x.size, load: async () => Buffer.from(x.contentBytes!, "base64") }));
    },
  })) as (Inbound & { _hasAttachments?: boolean; _load?: () => Promise<Inbound["attachments"]> })[];
}

/** Pulls new inbox mail from one connected account into Lodgely and runs AI understanding. */
export async function syncConnection(c: Conn) {
  const { cleanHtml, htmlToText } = await import("@/lib/mail");
  try {
    const token = await accessToken(c);
    const since = c.lastSyncAt ? new Date(c.lastSyncAt.getTime() - 5 * 60_000) : new Date(Date.now() - 14 * 864e5);
    const items = c.provider === "google" ? await gmailInbound(token, since) : await graphInbound(token, since);
    let added = 0;
    for (const it of items as (Inbound & { _hasAttachments?: boolean; _load?: () => Promise<Inbound["attachments"]> })[]) {
      const [dupe] = await db.select({ id: s.messages.id }).from(s.messages).where(and(eq(s.messages.agencyId, c.agencyId), eq(s.messages.providerId, it.providerId)));
      if (dupe) continue;
      const attachments: MailAttachment[] = [];
      const files = it._hasAttachments && it._load ? await it._load() : it.attachments;
      for (const a of files.slice(0, 10)) {
        if (a.size > 20 * 1024 * 1024) continue;
        const name = safeName(a.name);
        const blob = await putFile(`agency/${c.agencyId}/mail/${it.providerId.replace(":", "-")}/${name}`, await a.load(), a.type || "application/octet-stream");
        attachments.push({ name, size: a.size, type: a.type, key: blob.pathname });
      }
      const [client] = await db.select({ id: s.clients.id }).from(s.clients).where(and(eq(s.clients.agencyId, c.agencyId), sql`lower(${s.clients.email}) = ${it.from}`)).limit(1);
      const [parent] = it.inReplyTo ? await db.select({ threadKey: s.messages.threadKey, matterId: s.messages.matterId }).from(s.messages).where(and(eq(s.messages.agencyId, c.agencyId), eq(s.messages.messageId, it.inReplyTo))).limit(1) : [];
      const html = it.html ? cleanHtml(it.html) : null;
      const [row] = await db
        .insert(s.messages)
        .values({
          agencyId: c.agencyId,
          threadKey: parent?.threadKey ?? crypto.randomUUID(),
          folder: "inbox",
          mailbox: c.email,
          fromAddress: it.from,
          fromName: it.fromName,
          toAddresses: it.to.length ? it.to : [c.email],
          ccAddresses: it.cc.length ? it.cc : null,
          subject: it.subject,
          bodyHtml: html,
          bodyText: it.text ?? (html ? htmlToText(html) : null),
          read: false,
          clientId: client?.id ?? null,
          matterId: parent?.matterId ?? null,
          providerId: it.providerId,
          messageId: it.messageId,
          inReplyTo: it.inReplyTo,
          attachments,
          status: "received",
          sentAt: it.date,
        })
        .returning({ id: s.messages.id });
      if (client) await db.insert(s.activities).values({ agencyId: c.agencyId, clientId: client.id, kind: "email", title: `Email received: ${it.subject}`, actorName: it.fromName ?? it.from });
      added++;
      await analyzeMessage(row.id).catch((e) => console.error("mail-ai", e));
    }
    await db.update(s.mailConnections).set({ lastSyncAt: new Date(), status: "active", lastError: null }).where(eq(s.mailConnections.id, c.id));
    return { added };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(s.mailConnections).set({ status: "error", lastError: msg.slice(0, 300) }).where(eq(s.mailConnections.id, c.id));
    throw e;
  }
}

/** Syncs every connection that hasn't synced in [minutes] (all agencies, for the cron; or one agency). */
export async function syncStale(minutes = 3, agencyId?: string) {
  const cutoff = new Date(Date.now() - minutes * 60_000);
  const rows = await db
    .select()
    .from(s.mailConnections)
    .where(and(agencyId ? eq(s.mailConnections.agencyId, agencyId) : undefined, or(isNull(s.mailConnections.lastSyncAt), lt(s.mailConnections.lastSyncAt, cutoff))));
  let added = 0;
  for (const c of rows) added += (await syncConnection(c).catch(() => ({ added: 0 }))).added;
  return { connections: rows.length, added };
}

// ── Outbound ──────────────────────────────────────────────────────────────────────────────────
const wrap = (b: Buffer) => b.toString("base64").replace(/.{76}/g, "$&\r\n");
const encodeHeader = (v: string) => (/^[\x20-\x7e]*$/.test(v) ? v : `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=`);

/** The connected account for a From address, if this agency has one. */
export async function connectionFor(agencyId: string, address: string) {
  const [c] = await db.select().from(s.mailConnections).where(and(eq(s.mailConnections.agencyId, agencyId), eq(s.mailConnections.email, address.toLowerCase())));
  return c ?? null;
}

/** Sends through Gmail or Outlook, so mail leaves from the person's real account. */
export async function sendViaConnection(c: Conn, m: { fromName: string; to: string[]; cc?: string[]; bcc?: string[]; subject: string; html: string; text: string; attachments: MailAttachment[]; messageId: string; inReplyTo?: string | null }) {
  const token = await accessToken(c);
  const files = await Promise.all(m.attachments.map(async (a) => ({ ...a, bytes: await fileBytes(a.key) })));
  if (c.provider === "google") {
    const mixed = `mixed_${crypto.randomUUID()}`;
    const alt = `alt_${crypto.randomUUID()}`;
    const lines = [
      `From: ${encodeHeader(m.fromName)} <${c.email}>`,
      `To: ${m.to.join(", ")}`,
      m.cc?.length ? `Cc: ${m.cc.join(", ")}` : null,
      m.bcc?.length ? `Bcc: ${m.bcc.join(", ")}` : null,
      `Subject: ${encodeHeader(m.subject)}`,
      `Message-ID: ${m.messageId}`,
      m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}\r\nReferences: ${m.inReplyTo}` : null,
      "MIME-Version: 1.0",
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
      `--${mixed}`,
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(Buffer.from(m.text)),
      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(Buffer.from(m.html)),
      `--${alt}--`,
      ...files.flatMap((f) => [`--${mixed}`, `Content-Type: ${f.type}; name="${f.name}"`, `Content-Disposition: attachment; filename="${f.name}"`, "Content-Transfer-Encoding: base64", "", wrap(f.bytes)]),
      `--${mixed}--`,
    ].filter((x) => x !== null);
    const raw = Buffer.from(lines.join("\r\n")).toString("base64url");
    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ raw }) });
    if (!res.ok) throw new Error(`Gmail: ${res.status} ${(await res.text()).slice(0, 200)}`);
    return `gmail:${((await res.json()) as { id: string }).id}`;
  }
  const rcpt = (xs?: string[]) => (xs ?? []).map((address) => ({ emailAddress: { address } }));
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: m.subject,
        body: { contentType: "HTML", content: m.html },
        toRecipients: rcpt(m.to),
        ccRecipients: rcpt(m.cc),
        bccRecipients: rcpt(m.bcc),
        attachments: files.map((f) => ({ "@odata.type": "#microsoft.graph.fileAttachment", name: f.name, contentType: f.type, contentBytes: f.bytes.toString("base64") })),
      },
      saveToSentItems: true,
    }),
  });
  if (!res.ok) throw new Error(`Outlook: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return `graph:sent:${crypto.randomUUID()}`;
}
