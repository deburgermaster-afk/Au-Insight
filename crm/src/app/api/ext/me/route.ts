import { extensionCtx, extHeaders, extJson } from "@/lib/ext-auth";

export const OPTIONS = () => new Response(null, { headers: extHeaders });

export async function GET(req: Request) {
  const ctx = await extensionCtx(req);
  if (!ctx) return extJson({ error: "signed_out" }, 401);
  return extJson({ name: ctx.name, email: ctx.email, agency: ctx.agencyName, registered: ctx.registered });
}
