import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { clientSession } from "@/lib/client-auth";
import { readFile } from "@/lib/files";

// The PDF a signature request asks the client to sign (the frozen source copy). Staff of the agency
// and the client it was sent to can open it; a draft is visible to staff only.
export async function GET(_req: Request, { params }: RouteContext<"/api/sign/[id]">) {
  const { id } = await params;
  const [r] = await db.select({ agencyId: s.signRequests.agencyId, clientId: s.signRequests.clientId, key: s.signRequests.sourceKey, status: s.signRequests.status }).from(s.signRequests).where(eq(s.signRequests.id, id));
  if (!r) return new Response("Not found", { status: 404 });
  let allowed = false;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) {
    const [m] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, r.agencyId), eq(s.member.userId, session.user.id)));
    allowed = Boolean(m);
  }
  if (!allowed && r.status !== "draft") {
    const c = await clientSession();
    allowed = Boolean(c && c.client.id === r.clientId);
  }
  if (!allowed) return new Response("Forbidden", { status: 403 });
  const file = await readFile(r.key);
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(file.stream, { headers: { "Content-Type": "application/pdf", "Cache-Control": "private, max-age=600", "X-Content-Type-Options": "nosniff" } });
}
