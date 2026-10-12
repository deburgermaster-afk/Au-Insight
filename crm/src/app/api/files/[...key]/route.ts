import { and, eq, gt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { clientSession } from "@/lib/client-auth";
import { readFile } from "@/lib/files";

// Serves private files. The key is agency/<agencyId>/…; the caller must be a member of that
// agency, hold an unexpired portal link (?t=token) for it, or be the signed-in client it belongs to.
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
    if (!allowed) {
      // A signed-in client may open files on their own record, or attached to mail with them.
      const c = await clientSession();
      if (c && c.client.agencyId === agencyId) {
        const [doc] = await db.select({ id: s.documents.id }).from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.clientId, c.client.id), eq(s.documents.storageKey, key)));
        const [msg] = doc
          ? [doc]
          : await db
              .select({ id: s.messages.id })
              .from(s.messages)
              .where(and(eq(s.messages.agencyId, agencyId), eq(s.messages.clientId, c.client.id), sql`${s.messages.attachments} @> ${JSON.stringify([{ key }])}::jsonb`));
        allowed = Boolean(doc ?? msg);
      }
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
