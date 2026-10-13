import { neon } from "@neondatabase/serverless";
import { createHash, randomBytes } from "node:crypto";
const sql = neon(process.env.DATABASE_URL!);
const [m] = await sql`select client_id, agency_id from matters where id='6136b5b3-f736-4924-8a8e-1526a3690447'`;
const t = randomBytes(32).toString("base64url");
await sql`insert into client_sessions (agency_id, client_id, token_hash, kind, expires_at) values (${m.agency_id}, ${m.client_id}, ${createHash("sha256").update(t).digest("hex")}, 'magic', now() + interval '1 hour')`;
console.log(t);
