import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import sanitize from "sanitize-html";
import { db, schema as s } from "@/db";
import type { MailAttachment } from "@/db/crm-schema";
import { fileBytes, putFile, safeName } from "@/lib/files";

const API = "https://api.resend.com";
export const mailDomain = () => process.env.MAIL_FROM_DOMAIN ?? null;
export const mailEnabled = () => Boolean(process.env.RESEND_API_KEY && process.env.MAIL_FROM_DOMAIN);

async function resend<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) throw new Error(`Email provider: ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

// ── Addresses ────────────────────────────────────────────────────────────────────────────────
// Until the agency has its own domain, every agency shares MAIL_FROM_DOMAIN and addresses carry
// the agency's slug: ayesha.harbour-migration-x7k2@domain (personal) and
// harbour-migration-x7k2@domain (shared). Inbound mail is routed by exact address.

const local = (v: string) =>
  v
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 30) || "staff";

export async function ensureMailboxes(c: { agencyId: string; agencySlug: string; agencyName: string; userId: string; name: string }) {
  const domain = mailDomain();
  if (!domain) return [];
  const existing = await db.select().from(s.mailboxes).where(eq(s.mailboxes.agencyId, c.agencyId));
  const rows: (typeof s.mailboxes.$inferInsert)[] = [];
  if (!existing.some((m) => m.kind === "shared")) rows.push({ agencyId: c.agencyId, address: `${c.agencySlug}@${domain}`, name: c.agencyName, kind: "shared" });
  if (!existing.some((m) => m.userId === c.userId))
    rows.push({ agencyId: c.agencyId, address: `${local(c.name.split(" ")[0] ?? "staff")}.${c.agencySlug}@${domain}`, name: c.name, userId: c.userId, kind: "personal" });
  if (rows.length) await db.insert(s.mailboxes).values(rows).onConflictDoNothing();
  if (rows.some((r) => r.kind === "shared")) {
    // Mail stored before mailboxes existed (demo data, early sends) belongs to the shared box.
    await db
      .update(s.messages)
      .set({ mailbox: `${c.agencySlug}@${domain}` })
      .where(and(eq(s.messages.agencyId, c.agencyId), sql`${s.messages.mailbox} not like ${`%@${domain}`}`));
  }
  return db.select().from(s.mailboxes).where(eq(s.mailboxes.agencyId, c.agencyId));
}

// ── Sending ──────────────────────────────────────────────────────────────────────────────────

export const cleanHtml = (html: string) =>
  sanitize(html, {
    allowedTags: sanitize.defaults.allowedTags.concat(["img", "span", "font", "u", "s", "h1", "h2", "h3", "hr"]),
    allowedAttributes: {
      "*": ["style", "align"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["face", "color", "size"],
      td: ["colspan", "rowspan", "width"],
      th: ["colspan", "rowspan", "width"],
      table: ["width", "cellpadding", "cellspacing", "border"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel", "data", "cid"],
    transformTags: { a: sanitize.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
  });

export const htmlToText = (html: string) =>
  sanitize(html.replace(/<(br|\/p|\/div|\/li|\/h\d)>/gi, "\n"), { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Wraps a body in a minimal email-safe shell with the agency's footer. */
export function emailShell(body: string, footer?: string) {
  return `<!doctype html><html><body style="margin:0;background:#f6f6f7;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
<div style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;padding:28px;font-size:15px;line-height:1.6">${body}</div>
${footer ? `<p style="max-width:640px;margin:14px auto 0;color:#71717a;font-size:12px;text-align:center">${footer}</p>` : ""}
</body></html>`;
}

export async function sendMail(opts: {
  agencyId: string;
  from: { address: string; name: string };
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
  inReplyTo?: string | null;
  clientId?: string | null;
  matterId?: string | null;
  threadKey?: string;
  footer?: string;
}) {
  const html = cleanHtml(opts.html);
  const text = htmlToText(html);
  let providerId: string | null = null;
  let messageId: string | null = null;
  let status = "saved";
  if (mailEnabled()) {
    const attachments = await Promise.all(
      (opts.attachments ?? []).map(async (a) => ({ filename: a.name, content: (await fileBytes(a.key)).toString("base64"), content_type: a.type })),
    );
    messageId = `<${crypto.randomUUID()}@${mailDomain()}>`;
    const sent = await resend<{ id: string }>("/emails", {
      method: "POST",
      body: JSON.stringify({
        from: `${opts.from.name} <${opts.from.address}>`,
        reply_to: opts.from.address,
        to: opts.to,
        cc: opts.cc?.length ? opts.cc : undefined,
        bcc: opts.bcc?.length ? opts.bcc : undefined,
        subject: opts.subject,
        html: emailShell(html, opts.footer),
        text,
        attachments: attachments.length ? attachments : undefined,
        headers: { "Message-ID": messageId, ...(opts.inReplyTo ? { "In-Reply-To": opts.inReplyTo, References: opts.inReplyTo } : {}) },
      }),
    });
    providerId = sent.id;
    status = "sent";
  }
  const [row] = await db
    .insert(s.messages)
    .values({
      agencyId: opts.agencyId,
      threadKey: opts.threadKey ?? crypto.randomUUID(),
      folder: "sent",
      mailbox: opts.from.address,
      fromAddress: opts.from.address,
      fromName: opts.from.name,
      toAddresses: opts.to,
      ccAddresses: opts.cc ?? null,
      bccAddresses: opts.bcc ?? null,
      subject: opts.subject,
      bodyHtml: html,
      bodyText: text,
      read: true,
      clientId: opts.clientId ?? null,
      matterId: opts.matterId ?? null,
      providerId,
      messageId,
      inReplyTo: opts.inReplyTo ?? null,
      attachments: opts.attachments ?? [],
      status,
    })
    .returning({ id: s.messages.id });
  return { id: row.id, sent: status === "sent" };
}

// ── Webhooks ─────────────────────────────────────────────────────────────────────────────────

/** Verifies a Resend (Svix) webhook signature. */
export function verifyWebhook(body: string, h: Headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  const id = h.get("svix-id");
  const ts = h.get("svix-timestamp");
  const sig = h.get("svix-signature");
  if (!secret || !id || !ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 60 * 10) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest();
  return sig.split(" ").some((part) => {
    const [, v] = part.split(",");
    if (!v) return false;
    const got = Buffer.from(v, "base64");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

type Received = {
  id: string;
  from: string;
  to: string[];
  cc: string[] | null;
  subject: string;
  html: string | null;
  html_format?: string;
  text: string | null;
  message_id: string | null;
  headers: Record<string, string> | null;
  authentication: { spf?: string; dkim?: string; dmarc?: string } | null;
  received_for?: string[];
  attachments: { id: string; filename: string; content_type: string; size: number }[];
};

const addr = (v: string) => (v.match(/<([^>]+)>/)?.[1] ?? v).trim().toLowerCase();
const display = (v: string) => v.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || null;

function decodeHtml(r: Received) {
  if (!r.html) return null;
  if (r.html_format === "data_uri" || r.html.startsWith("data:")) {
    const m = r.html.match(/^data:[^,]*?(;base64)?,([\s\S]*)$/);
    if (m) return m[1] ? Buffer.from(m[2], "base64").toString("utf8") : decodeURIComponent(m[2]);
  }
  return r.html;
}

/** Pulls a received email from Resend into every agency mailbox it was addressed to. */
export async function ingestReceived(emailId: string) {
  const r = await resend<Received>(`/emails/receiving/${emailId}`);
  const recipients = [...new Set([...(r.received_for ?? []), ...r.to, ...(r.cc ?? [])].map(addr))];
  const none = { agencies: [] as string[], messages: [] as string[] };
  if (!recipients.length) return none;
  const boxes = await db.select().from(s.mailboxes).where(inArray(s.mailboxes.address, recipients));
  if (!boxes.length) return none; // not ours (another app on the same domain)
  const already = await db.select({ id: s.messages.id }).from(s.messages).where(eq(s.messages.providerId, r.id)).limit(1);
  if (already.length) return none;

  const auth = r.authentication ?? {};
  const verified = auth.dmarc === "pass" || (auth.dkim === "pass" && auth.spf === "pass");
  const html = decodeHtml(r);
  const from = addr(r.from);
  const inReplyTo = r.headers?.["in-reply-to"] ?? null;

  // Attachments: download once, store per agency.
  const list = r.attachments.length ? await resend<{ data: { id: string; download_url: string; content_type: string; size: number; filename?: string }[] }>(`/emails/receiving/${emailId}/attachments`) : { data: [] };
  const done: string[] = [];
  const inserted: string[] = [];
  for (const agencyId of [...new Set(boxes.map((b) => b.agencyId))]) {
    const box = boxes.find((b) => b.agencyId === agencyId)!;
    const attachments: MailAttachment[] = [];
    for (const a of list.data) {
      const meta = r.attachments.find((x) => x.id === a.id);
      const name = safeName(meta?.filename ?? a.filename ?? "attachment");
      const bytes = await fetch(a.download_url).then((x) => x.arrayBuffer());
      const blob = await putFile(`agency/${agencyId}/mail/${r.id}/${name}`, bytes, a.content_type);
      attachments.push({ name, size: a.size, type: a.content_type, key: blob.pathname });
    }
    const [client] = await db
      .select({ id: s.clients.id })
      .from(s.clients)
      .where(and(eq(s.clients.agencyId, agencyId), sql`lower(${s.clients.email}) = ${from}`))
      .limit(1);
    const [parent] = inReplyTo
      ? await db.select({ threadKey: s.messages.threadKey, matterId: s.messages.matterId }).from(s.messages).where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.messageId, inReplyTo))).limit(1)
      : [];
    const [row] = await db.insert(s.messages).values({
      agencyId,
      threadKey: parent?.threadKey ?? crypto.randomUUID(),
      folder: "inbox",
      mailbox: box.address,
      fromAddress: from,
      fromName: display(r.headers?.from ?? r.from) ?? boxes.find((b) => b.address === from)?.name ?? null,
      toAddresses: r.to.map(addr),
      ccAddresses: r.cc?.map(addr) ?? null,
      subject: r.subject || "(no subject)",
      bodyHtml: html ? cleanHtml(html) : null,
      bodyText: r.text ?? (html ? htmlToText(html) : null),
      read: false,
      clientId: client?.id ?? null,
      matterId: parent?.matterId ?? null,
      providerId: r.id,
      messageId: r.message_id,
      inReplyTo,
      attachments,
      status: "received",
      auth: { ...auth, verified },
    }).returning({ id: s.messages.id });
    inserted.push(row.id);
    if (client) {
      await db.insert(s.activities).values({ agencyId, clientId: client.id, kind: "email", title: `Email received: ${r.subject || "(no subject)"}`, actorName: display(r.from) ?? from });
    }
    done.push(agencyId);
  }
  return { agencies: done, messages: inserted };
}

const statusFor: Record<string, string> = {
  "email.delivered": "delivered",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.delivery_delayed": "delayed",
  "email.failed": "failed",
};

export async function updateDelivery(type: string, emailId: string) {
  const status = statusFor[type];
  if (!status) return [];
  const rows = await db.update(s.messages).set({ status }).where(eq(s.messages.providerId, emailId)).returning({ agencyId: s.messages.agencyId });
  return rows.map((r) => r.agencyId);
}
