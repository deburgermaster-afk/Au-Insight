import { strToU8, zipSync } from "fflate";
import { db, schema as s } from "@/db";
import { fileBytes } from "@/lib/files";
import { buildPack, sheetText } from "@/lib/lodgement";
import { packSheetHtml } from "@/lib/lodgement-html";
import { actionCtx } from "@/lib/session";

// Downloads the lodgement pack: renamed documents in attach order + the data sheet (HTML and text).
export async function GET(req: Request, { params }: RouteContext<"/api/matters/[id]/pack">) {
  const ctx = await actionCtx();
  if (!ctx.caps.includes("clients")) return new Response("Your role doesn't include client files.", { status: 403 });
  const agencyId = ctx.agencyId;
  const pack = await buildPack(agencyId, (await params).id);
  if (!pack) return new Response("Not found", { status: 404 });
  if (new URL(req.url).searchParams.get("view") === "sheet") return new Response(packSheetHtml(pack), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  const files: Record<string, Uint8Array> = {
    "00 Data sheet.html": strToU8(packSheetHtml(pack)),
    "00 Data sheet.txt": strToU8(sheetText(pack)),
  };
  const skipped: string[] = [];
  for (const d of pack.docs) {
    if (!d.storageKey) continue;
    try {
      files[`Documents/${d.file}`] = new Uint8Array(await fileBytes(d.storageKey));
    } catch {
      skipped.push(d.file);
    }
  }
  if (skipped.length) files["Missing files.txt"] = strToU8(`These couldn't be read from storage:\n${skipped.join("\n")}`);
  const zip = zipSync(files, { level: 6 });
  await db.insert(s.auditLog).values({ agencyId, actorId: ctx.userId, actorName: ctx.name, action: "export", entity: "lodgement_pack", entityId: pack.matter.id, detail: { documents: pack.docs.length } });
  const name = `${pack.matter.reference} ${pack.client.name} lodgement pack.zip`.replace(/[^\w .-]+/g, "");
  return new Response(Buffer.from(zip), { headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
