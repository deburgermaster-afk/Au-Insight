import { db, schema as s } from "@/db";
import { extensionCtx, extHeaders, extJson } from "@/lib/ext-auth";
import { buildPack } from "@/lib/lodgement";

export const OPTIONS = () => new Response(null, { headers: extHeaders });

/** The data sheet the extension fills ImmiAccount from. */
export async function GET(req: Request, { params }: RouteContext<"/api/ext/matters/[id]">) {
  const ctx = await extensionCtx(req);
  if (!ctx) return extJson({ error: "signed_out" }, 401);
  if (!ctx.caps.includes("clients")) return extJson({ error: "Your role doesn't include client files." }, 403);
  const pack = await buildPack(ctx.agencyId, (await params).id);
  if (!pack) return extJson({ error: "not_found" }, 404);
  await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "view", entity: "lodgement_pack", entityId: pack.matter.id, detail: { via: "extension" } });
  return extJson({
    matter: pack.matter,
    client: pack.client,
    sections: pack.sheet.map((sec) => ({ title: sec.title, fields: sec.fields.filter((f) => f.value).map(({ key, label, value, match, kind }) => ({ key, label, value, match, kind })) })),
    docs: pack.docs.map(({ order, file, evidence }) => ({ order, file, evidence })),
    blocking: pack.gaps.filter((g) => g.level === "block").length,
    packUrl: `/app/matters/${pack.matter.id}/lodge`,
  });
}
