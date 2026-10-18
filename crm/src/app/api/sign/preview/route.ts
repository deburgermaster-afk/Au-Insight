import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ConsentVars } from "@/lib/consent-templates";
import { agencyTemplate } from "@/lib/agency-templates";
import { consentVars } from "@/lib/sign";
import { renderConsentPdf } from "@/lib/sign-pdf";
import { getCtx } from "@/lib/session";

// Staff preview of a consent template as the client would get it: filled in for the chosen client
// and matter, or with sample client details when none is chosen. Nothing is saved.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ctx = await getCtx();
  const t = await agencyTemplate(ctx.agencyId, url.searchParams.get("template") ?? "");
  if (!t) return new Response("Template not found", { status: 404 });
  if (!ctx.caps.includes("clients")) return new Response("Forbidden", { status: 403 });
  const { agencyId, userId } = ctx;
  const clientId = url.searchParams.get("client");
  let vars: ConsentVars;
  if (clientId) {
    try {
      vars = await consentVars(agencyId, clientId, url.searchParams.get("matter") || null, userId);
    } catch {
      return new Response("Client not found", { status: 404 });
    }
  } else {
    // Agency and agent are real; the client is a placeholder.
    const [anyClient] = await db.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.agencyId, agencyId)).limit(1);
    const base = anyClient ? await consentVars(agencyId, anyClient.id, null, userId) : null;
    vars = { ...(base ?? ({} as ConsentVars)), client: "Sample Client", clientDob: "1 January 1990", clientEmail: "client@example.com", clientAddress: "", passport: "X0000000", nationality: "", visa: "Visa / matter shown here", matterRef: "LDG-0000-0000" };
  }
  // Show the agent's countersign block on forms that have one.
  const r = await renderConsentPdf(t, vars, t.countersign ? [{ id: "agent", role: "agent", label: "Registered migration agent", name: vars.agent, marn: vars.agentMarn }] : []);
  return new Response(Buffer.from(r.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${t.title.replace(/[^\w .-]/g, "")} (preview).pdf"`, "Cache-Control": "private, no-store" } });
}

/** Admin preview of unsaved wording from the template editor (JSON body: the template). */
export async function POST(req: Request) {
  const ctx = await getCtx();
  if (!["admin", "owner"].includes(ctx.role)) return new Response("Forbidden", { status: 403 });
  const t = (await req.json().catch(() => null)) as import("@/lib/consent-templates").ConsentTemplate | null;
  if (!t?.title || typeof t.body !== "string") return new Response("Bad request", { status: 400 });
  const [anyClient] = await db.select({ id: s.clients.id }).from(s.clients).where(eq(s.clients.agencyId, ctx.agencyId)).limit(1);
  const base = anyClient ? await consentVars(ctx.agencyId, anyClient.id, null, ctx.userId) : ({} as ConsentVars);
  const vars: ConsentVars = { ...base, client: "Sample Client", clientDob: "1 January 1990", clientEmail: "client@example.com", clientAddress: "", passport: "X0000000", nationality: "", visa: "Visa / matter shown here", matterRef: "LDG-0000-0000" };
  const safeT = { ...t, body: t.body.slice(0, 20000), checkboxes: (t.checkboxes ?? []).slice(0, 8), key: "preview", group: t.group ?? "Engagement", summary: "" };
  const r = await renderConsentPdf(safeT, vars, t.countersign ? [{ id: "agent", role: "agent", label: "Registered migration agent", name: vars.agent, marn: vars.agentMarn }] : []);
  return new Response(Buffer.from(r.bytes), { headers: { "Content-Type": "application/pdf", "Cache-Control": "no-store" } });
}
