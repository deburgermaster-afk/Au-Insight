import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Keys derive from the app secret, so nothing new to configure. Changing BETTER_AUTH_SECRET
// invalidates stored mail tokens (people reconnect) and in-flight OAuth states.
const secret = () => process.env.BETTER_AUTH_SECRET ?? "";
const key = (purpose: string) => createHash("sha256").update(`${secret()}:${purpose}`).digest();

/** AES-256-GCM; output is iv.tag.ciphertext in base64url. */
export function encrypt(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key("mail-tokens"), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

export function decrypt(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", key("mail-tokens"), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

/** A tamper-proof, expiring token carrying a small JSON payload (used as OAuth state). */
export function sign(payload: object, ttlSeconds = 600) {
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlSeconds * 1000 })).toString("base64url");
  return `${data}.${createHmac("sha256", key("oauth-state")).update(data).digest("base64url")}`;
}

export function verify<T>(token: string): T | null {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const want = createHmac("sha256", key("oauth-state")).update(data).digest();
  const got = Buffer.from(mac, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  const v = JSON.parse(Buffer.from(data, "base64url").toString()) as T & { exp: number };
  return v.exp > Date.now() ? v : null;
}
