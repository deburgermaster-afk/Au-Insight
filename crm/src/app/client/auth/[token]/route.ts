import { NextResponse } from "next/server";
import { CLIENT_COOKIE, redeemMagicLink } from "@/lib/client-auth";

// Opening the emailed link signs the client in and lands them on their portal.
export async function GET(req: Request, { params }: RouteContext<"/client/auth/[token]">) {
  const { token } = await params;
  const session = await redeemMagicLink(token);
  if (!session) return NextResponse.redirect(new URL("/client/sign-in?expired=1", req.url));
  const next = new URL(req.url).searchParams.get("next");
  const res = NextResponse.redirect(new URL(next && /^\/client(\/[\w\-/]*)?$/.test(next) ? next : "/client", req.url));
  res.cookies.set(CLIENT_COOKIE, session.token, { httpOnly: true, secure: true, sameSite: "lax", path: "/", expires: session.expiresAt });
  return res;
}
