import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { actionCtx } from "@/lib/session";

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A Word-compatible download (.doc) of the saved draft.
export async function GET(_req: Request, { params }: RouteContext<"/api/drafts/[id]/doc">) {
  const ctx = await actionCtx();
  if (!ctx.caps.includes("clients")) return new Response("Forbidden", { status: 403 });
  const [d] = await db.select().from(s.drafts).where(and(eq(s.drafts.agencyId, ctx.agencyId), eq(s.drafts.id, (await params).id)));
  if (!d) return new Response("Not found", { status: 404 });
  const body = d.body
    .split(/\n{2,}/)
    .map((block) => (block.startsWith("## ") ? `<h2>${esc(block.slice(3))}</h2>` : `<p>${esc(block).replace(/\n/g, "<br>").replace(/\[\[([^\]]+)\]\]/g, '<span style="background:#fff3a3">[[$1]]</span>')}</p>`))
    .join("\n");
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(d.title)}</title>
<style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.4}h1{font-size:16pt}h2{font-size:12.5pt;margin-top:14pt}</style></head><body><h1>${esc(d.title)}</h1>${body}</body></html>`;
  const name = `${d.title.replace(/[^\w .-]+/g, "").slice(0, 80) || "Draft"}.doc`;
  return new Response(html, { headers: { "Content-Type": "application/msword; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
