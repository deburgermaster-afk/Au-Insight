import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { readFile } from "@/lib/files";
import { getCtx } from "@/lib/session";

// The signed-in agency's logo, for previews in the app.
export async function GET() {
  const ctx = await getCtx();
  const [p] = await db.select({ key: s.agencyProfile.logoKey }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
  const f = p?.key ? await readFile(p.key) : null;
  if (!f) return new Response("No logo", { status: 404 });
  return new Response(f.stream, { headers: { "Content-Type": f.blob.contentType ?? "image/png", "Cache-Control": "private, max-age=60" } });
}
