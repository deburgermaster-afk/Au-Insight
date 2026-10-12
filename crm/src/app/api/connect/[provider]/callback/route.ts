import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { after } from "next/server";
import { revalidateTag } from "next/cache";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { agencyTag } from "@/lib/data";
import { completeConnection, isProvider, syncConnection } from "@/lib/mail-connect";
import { safeReturn } from "@/lib/connect-return";
import { verify } from "@/lib/secure";
import { eq } from "drizzle-orm";

// Google / Microsoft send people back here after they approve access.
export async function GET(req: Request, { params }: RouteContext<"/api/connect/[provider]/callback">) {
  const { provider } = await params;
  const url = new URL(req.url);
  const state = verify<{ u: string; a: string; n: string; p: string; r?: string }>(url.searchParams.get("state") ?? "");
  const back = new URL(safeReturn(state?.r, "/app/inbox"), req.url);
  const code = url.searchParams.get("code");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!isProvider(provider) || !state || state.p !== provider || !session || session.user.id !== state.u) {
    back.searchParams.set("connect_error", "expired");
    return NextResponse.redirect(back);
  }
  if (!code) {
    back.searchParams.set("connect_error", url.searchParams.get("error") ?? "cancelled");
    return NextResponse.redirect(back);
  }
  try {
    const { id, email } = await completeConnection(provider, code, { agencyId: state.a, userId: state.u, name: state.n });
    await db.insert(s.auditLog).values({ agencyId: state.a, actorId: state.u, actorName: state.n, action: "create", entity: "mail_connection", entityId: id, detail: { provider, email } });
    after(async () => {
      const [c] = await db.select().from(s.mailConnections).where(eq(s.mailConnections.id, id));
      if (c) await syncConnection(c).catch((e) => console.error("first sync", e));
      revalidateTag(agencyTag(state.a), { expire: 0 });
    });
    revalidateTag(agencyTag(state.a), { expire: 0 });
    back.searchParams.set("connected", email);
  } catch (e) {
    console.error("connect", e);
    back.searchParams.set("connect_error", "failed");
  }
  return NextResponse.redirect(back);
}
