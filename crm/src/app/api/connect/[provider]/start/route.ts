import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { authUrl, isProvider, providerReady } from "@/lib/mail-connect";
import { safeReturn } from "@/lib/connect-return";
import { sign } from "@/lib/secure";
import { actionCtx } from "@/lib/session";

// Starts "Connect Gmail / Outlook": signs who is connecting into the OAuth state, then hands off.
export async function GET(req: Request, { params }: RouteContext<"/api/connect/[provider]/start">) {
  const { provider } = await params;
  const r = safeReturn(new URL(req.url).searchParams.get("return"), "/app/inbox");
  const back = new URL(r, req.url);
  if (!isProvider(provider)) return NextResponse.redirect(back);
  if (!providerReady(provider)) {
    back.searchParams.set("connect_error", "not_configured");
    return NextResponse.redirect(back);
  }
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/sign-in", req.url));
  const ctx = await actionCtx();
  const state = sign({ u: ctx.userId, a: ctx.agencyId, n: ctx.name, p: provider, r });
  return NextResponse.redirect(authUrl(provider, state, ctx.email));
}
