import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { XERO_SCOPES, xeroReady } from "@/lib/payroll-integrations";
import { sign } from "@/lib/secure";
import { actionCtx } from "@/lib/session";

const back = "/app/settings/payroll?tab=integrations";

// "Connect Xero": HR or admins approve access in Xero, then come back to the callback.
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.redirect(new URL("/sign-in", req.url));
  const ctx = await actionCtx();
  const to = new URL(back, req.url);
  if (!ctx.caps.includes("payroll")) return NextResponse.redirect((to.searchParams.set("connect_error", "admin_only"), to));
  if (!xeroReady()) return NextResponse.redirect((to.searchParams.set("connect_error", "xero_not_configured"), to));
  const state = sign({ u: ctx.userId, a: ctx.agencyId, n: ctx.name, p: "xero" });
  const url = new URL("https://login.xero.com/identity/connect/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", process.env.XERO_CLIENT_ID!);
  url.searchParams.set("redirect_uri", new URL("/api/connect/xero/callback", req.url).toString());
  url.searchParams.set("scope", XERO_SCOPES);
  url.searchParams.set("state", state);
  return NextResponse.redirect(url);
}
