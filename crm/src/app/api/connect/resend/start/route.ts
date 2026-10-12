import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { safeReturn } from "@/lib/connect-return";
import { pkce, resendAuthUrl } from "@/lib/resend-connect";
import { encrypt, sign } from "@/lib/secure";
import { actionCtx, canAtLeast } from "@/lib/session";

// "Connect Resend": owner/admin only. PKCE verifier stays in a sealed, short-lived cookie.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const r = safeReturn(url.searchParams.get("return"), "/app/settings/connectors");
  const back = new URL(r, req.url);
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/sign-in", req.url));
  const ctx = await actionCtx();
  if (!canAtLeast(ctx.role, "admin")) {
    back.searchParams.set("connect_error", "admin_only");
    return NextResponse.redirect(back);
  }
  try {
    const { verifier, challenge } = pkce();
    const state = sign({ u: ctx.userId, a: ctx.agencyId, n: ctx.name, p: "resend", r });
    const to = await resendAuthUrl(state, challenge);
    (await cookies()).set("lodgely_pkce", encrypt(verifier), { httpOnly: true, secure: url.protocol === "https:", sameSite: "lax", path: "/api/connect/resend", maxAge: 600 });
    return NextResponse.redirect(to);
  } catch (e) {
    console.error("resend start", e);
    back.searchParams.set("connect_error", "failed");
    return NextResponse.redirect(back);
  }
}
