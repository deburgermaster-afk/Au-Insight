import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { clientSession } from "@/lib/client-auth";
import { putFile, safeName } from "@/lib/files";

const MAX = 25 * 1024 * 1024;

// Uploads go through the app into R2: works on any network that can reach the app itself.
// Form fields: file, folder (staff), token (upload link) or client=1 (signed-in client portal).
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "No file" }, { status: 400 });
  if (file.size > MAX) return Response.json({ error: "Files must be 25 MB or smaller" }, { status: 413 });
  const token = form.get("token");
  let prefix: string;
  if (typeof token === "string" && token) {
    const [link] = await db.select().from(s.portalLinks).where(and(eq(s.portalLinks.token, token), gt(s.portalLinks.expiresAt, new Date())));
    if (!link) return Response.json({ error: "This upload link has expired." }, { status: 403 });
    prefix = `agency/${link.agencyId}/portal/${link.id}`;
  } else if (form.get("client") === "1") {
    const c = await clientSession();
    if (!c) return Response.json({ error: "Your session has ended. Sign in again." }, { status: 401 });
    prefix = `agency/${c.client.agencyId}/client/${c.client.id}/${crypto.randomUUID().slice(0, 8)}`;
  } else {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });
    const folder = String(form.get("folder") ?? "uploads").replace(/[^\w/-]+/g, "").replace(/^\/+|\.\./g, "");
    const agencyId = String(form.get("agencyId") ?? "");
    const [m] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, agencyId), eq(s.member.userId, session.user.id)));
    if (!m) return Response.json({ error: "You can't upload to this agency." }, { status: 403 });
    prefix = `agency/${agencyId}/${folder}`;
  }
  const blob = await putFile(`${prefix}/${safeName(file.name)}`, await file.arrayBuffer(), file.type || "application/octet-stream");
  return Response.json({ pathname: blob.pathname });
}
