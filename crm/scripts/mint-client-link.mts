// Prints a one-hour client portal sign-in token (open /client/auth/<token>) for testing.
// Usage: npx tsx --env-file=.env.local scripts/mint-client-link.mts <client-email> <agency-slug>
import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
const sql = neon(process.env.DATABASE_URL!);
const [c] = await sql`select c.id, c.agency_id from clients c join organization o on o.id=c.agency_id where c.email=${process.argv[2]} and o.slug=${process.argv[3]}`;
const t = randomBytes(32).toString("base64url");
await sql`insert into client_sessions (agency_id, client_id, token_hash, kind, expires_at) values (${c.agency_id}, ${c.id}, ${createHash("sha256").update(t).digest("hex")}, 'magic', now() + interval '1 hour')`;
console.log(t);
