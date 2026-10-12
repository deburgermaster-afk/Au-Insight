import { and, desc, eq, ilike, notInArray, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { extensionCtx, extHeaders, extJson } from "@/lib/ext-auth";
import { visaByCode } from "@/lib/visas";

export const OPTIONS = () => new Response(null, { headers: extHeaders });

/** Open matters for the extension's case picker; ?q= searches client name and reference. */
export async function GET(req: Request) {
  const ctx = await extensionCtx(req);
  if (!ctx) return extJson({ error: "signed_out" }, 401);
  if (!ctx.caps.includes("clients")) return extJson({ error: "Your role doesn't include client files." }, 403);
  const q = new URL(req.url).searchParams.get("q")?.trim();
  const like = q ? `%${q.replace(/[%_]/g, "")}%` : null;
  const rows = await db
    .select({ id: s.matters.id, reference: s.matters.reference, visaCode: s.matters.visaCode, stage: s.matters.stage, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .where(
      and(
        eq(s.matters.agencyId, ctx.agencyId),
        notInArray(s.matters.stage, ["decision", "closed"]),
        like ? or(ilike(s.matters.reference, like), ilike(sql`${s.clients.firstName} || ' ' || ${s.clients.lastName}`, like)) : undefined,
      ),
    )
    .orderBy(desc(s.matters.updatedAt))
    .limit(25);
  return extJson({ matters: rows.map((r) => ({ id: r.id, reference: r.reference, client: `${r.first} ${r.last}`, visa: visaByCode(r.visaCode)?.name ?? r.visaCode, stage: r.stage })) });
}
