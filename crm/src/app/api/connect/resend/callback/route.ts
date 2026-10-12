import { cookies, headers } from "next/headers";
import { NextResponse, after } from "next/server";
import { revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { safeReturn } from "@/lib/connect-return";
import { agencyTag } from "@/lib/data";
import { completeResend } from "@/lib/resend-connect";
import { setupResend } from "@/lib/resend-setup";
import { decrypt, verify } from "@/lib/secure";

// Resend sends people back here after they approve access.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const state = verify<{ u: string; a: string; n: string; p: string; r?: string }>(url.searchParams.get("state") ?? "");
  const back = new URL(safeReturn(state?.r, "/app/settings/connectors"), req.url);
  const jar = await cookies();
  const sealed = jar.get("lodgely_pkce")?.value;
  jar.delete({ name: "lodgely_pkce", path: "/api/connect/resend" });
  const session = await auth.api.getSession({ headers: await headers() });
  if (!state || state.p !== "resend" || !session || session.user.id !== state.u || !sealed) {
    back.searchParams.set("connect_error", "expired");
    return NextResponse.redirect(back);
  }
  const code = url.searchParams.get("code");
  if (!code) {
    back.searchParams.set("connect_error", url.searchParams.get("error") ?? "cancelled");
    return NextResponse.redirect(back);
  }
  try {
    const c = await completeResend(code, decrypt(sealed), { agencyId: state.a, userId: state.u, name: state.n });
    await db.insert(s.auditLog).values({ agencyId: state.a, actorId: state.u, actorName: state.n, action: "create", entity: "connector", entityId: c.id, detail: { kind: "resend", account: c.account } });
    const [org] = await db.select({ slug: s.organization.slug, name: s.organization.name }).from(s.organization).where(eq(s.organization.id, state.a));
    // Webhook, domain pick-up and first usage reading: a few quick calls, done before landing.
    const setup = await Promise.race([
      setupResend(c, { agencyId: state.a, agencySlug: org?.slug ?? "", agencyName: org?.name ?? "", userId: state.u, name: state.n }).catch((e) => (console.error("resend setup", e), null)),
      new Promise<null>((r) => setTimeout(() => r(null), 12_000)),
    ]);
    after(() => revalidateTag(agencyTag(state.a), { expire: 0 }));
    revalidateTag(agencyTag(state.a), { expire: 0 });
    back.searchParams.set("connected", "resend");
    if (setup?.domain) back.searchParams.set("domain", setup.domain);
  } catch (e) {
    console.error("resend connect", e);
    back.searchParams.set("connect_error", "failed");
  }
  return NextResponse.redirect(back);
}
