import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { fileBytes } from "@/lib/files";
import { actionCtx } from "@/lib/session";

// The signed contract PDF: HR, or the employee who signed it.
export async function GET(_: Request, { params }: RouteContext<"/api/contracts/[id]/pdf">) {
  const ctx = await actionCtx();
  const [c] = await db.select().from(s.employmentContracts).where(and(eq(s.employmentContracts.agencyId, ctx.agencyId), eq(s.employmentContracts.id, (await params).id)));
  if (!c || (!ctx.caps.includes("payroll") && c.userId !== ctx.userId)) return new Response("Not found", { status: 404 });
  if (!c.pdfKey) return new Response("No signed copy stored.", { status: 404 });
  const bytes = await fileBytes(c.pdfKey);
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${c.title.replace(/[^\w .()-]+/g, "")}.pdf"`, "Cache-Control": "private, no-store" } });
}
