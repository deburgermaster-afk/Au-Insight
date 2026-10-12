import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { and, eq, gt } from "drizzle-orm";
import { headers } from "next/headers";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";

const MAX = 25 * 1024 * 1024;

// Issues short-lived tokens for browser uploads straight to the private Blob store. Staff may
// upload under their agency; a client with a portal link may upload under that link's folder.
export async function POST(req: Request) {
  const body = (await req.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname, payload) => {
        const p = payload ? (JSON.parse(payload) as { token?: string }) : {};
        if (p.token) {
          const [link] = await db.select().from(s.portalLinks).where(and(eq(s.portalLinks.token, p.token), gt(s.portalLinks.expiresAt, new Date())));
          if (!link || !pathname.startsWith(`agency/${link.agencyId}/portal/${link.id}/`)) throw new Error("This upload link has expired.");
        } else {
          const session = await auth.api.getSession({ headers: await headers() });
          if (!session) throw new Error("Sign in to upload.");
          const agencyId = pathname.match(/^agency\/([^/]+)\//)?.[1] ?? "";
          const [m] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, agencyId), eq(s.member.userId, session.user.id)));
          if (!m) throw new Error("You can't upload to this agency.");
        }
        return { maximumSizeInBytes: MAX, addRandomSuffix: true };
      },
    });
    return Response.json(json);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
