import { sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { readFile } from "@/lib/files";
import { hashToken } from "@/lib/sign-core";

// The PDF for another signer, opened from their personal emailed link (no account).
export async function GET(_req: Request, { params }: RouteContext<"/api/sign/link/[token]">) {
  const { token } = await params;
  const [r] = await db.select({ key: s.signRequests.sourceKey, status: s.signRequests.status }).from(s.signRequests).where(sql`${s.signRequests.signers} @> ${JSON.stringify([{ tokenHash: hashToken(token) }])}::jsonb`);
  if (!r || r.status === "draft" || r.status === "void") return new Response("Not found", { status: 404 });
  const file = await readFile(r.key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex" } });
}
