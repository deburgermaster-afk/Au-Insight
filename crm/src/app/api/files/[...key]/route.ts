import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { readFile } from "@/lib/files";

// Serves private files. The key is agency/<agencyId>/…; the caller must be a member of that
// agency, or hold an unexpired portal link (?t=token) for it.
export async function GET(req: Request, { params }: RouteContext<"/api/files/[...key]">) {
  const key = (await params).key.map(decodeURIComponent).join("/");
  const agencyId = key.match(/^agency\/([^/]+)\//)?.[1];
  if (!agencyId) return new Response("Not found", { status: 404 });
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  let allowed = false;
  if (token) {
    const [link] = await db
      .select({ id: s.portalLinks.id })
      .from(s.portalLinks)
      .where(and(eq(s.portalLinks.token, token), eq(s.portalLinks.agencyId, agencyId), gt(s.portalLinks.expiresAt, new Date())));
    allowed = Boolean(link) && key.includes("/portal/");
  } else {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session) {
      const [m] = await db
        .select({ id: s.member.id })
        .from(s.member)
        .where(and(eq(s.member.organizationId, agencyId), eq(s.member.userId, session.user.id)));
      allowed = Boolean(m);
    }
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const file = await readFile(key);
  if (!file) return new Response("Not found", { status: 404 });
  const name = url.searchParams.get("name") ?? key.split("/").pop() ?? "file";
  return new Response(file.stream, {
    headers: {
      "Content-Type": file.blob.contentType ?? "application/octet-stream",
      "Content-Length": String(file.blob.size),
      "Content-Disposition": `${url.searchParams.has("download") ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
