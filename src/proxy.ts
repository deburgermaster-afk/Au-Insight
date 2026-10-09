import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|sw.js|manifest.webmanifest|icons/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)"],
};
