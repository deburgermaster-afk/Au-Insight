import { revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { agencyTag } from "@/lib/data";
import { saveConnector, xeroToken } from "@/lib/payroll-integrations";
import { verify } from "@/lib/secure";

// Xero sends people back here: swap the code for tokens and remember which organisation to post to.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = new URL("/app/settings/payroll?tab=integrations", req.url);
  const state = verify<{ u: string; a: string; n: string; p: string }>(url.searchParams.get("state") ?? "");
  const session = await auth.api.getSession({ headers: await headers() });
  if (!state || state.p !== "xero" || !session || session.user.id !== state.u) return NextResponse.redirect((back.searchParams.set("connect_error", "expired"), back));
  const code = url.searchParams.get("code");
  if (!code) return NextResponse.redirect((back.searchParams.set("connect_error", url.searchParams.get("error") ?? "cancelled"), back));
  try {
    const t = await xeroToken({ grant_type: "authorization_code", code, redirect_uri: new URL("/api/connect/xero/callback", req.url).toString() });
    const orgs = (await (await fetch("https://api.xero.com/connections", { headers: { Authorization: `Bearer ${t.access_token}` } })).json()) as { tenantId: string; tenantName: string; tenantType: string }[];
    const org = orgs.find((o) => o.tenantType === "ORGANISATION") ?? orgs[0];
    if (!org) throw new Error("No Xero organisation was shared.");
    await saveConnector(state.a, "xero", { key: t.access_token, account: org.tenantName, scope: org.tenantId, refreshToken: t.refresh_token, expiresAt: new Date(Date.now() + t.expires_in * 1000) }, { id: state.u, name: state.n });
    revalidateTag(agencyTag(state.a), { expire: 0 });
    back.searchParams.set("connected", "xero");
  } catch (e) {
    console.error("xero callback", e);
    back.searchParams.set("connect_error", "failed");
  }
  return NextResponse.redirect(back);
}
