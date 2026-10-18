import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { clientSession } from "@/lib/client-auth";
import { safe } from "@/lib/sign-pdf";

// Official receipt for tuition the agency collected on an institution's behalf: what was billed,
// the scholarship applied, each payment received, and whether it has been remitted.
export async function GET(_req: Request, { params }: RouteContext<"/api/tuition/[id]/receipt">) {
  const { id } = await params;
  const [t] = await db.select().from(s.tuitionPayments).where(eq(s.tuitionPayments.id, id));
  if (!t) return new Response("Not found", { status: 404 });
  let allowed = false;
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) allowed = Boolean((await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, t.agencyId), eq(s.member.userId, session.user.id))))[0]);
  if (!allowed) allowed = (await clientSession())?.client.id === t.clientId;
  if (!allowed) return new Response("Forbidden", { status: 403 });

  const [[c], [org], [p], [inst], [app], [inv], pays] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.id, t.clientId)),
    db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, t.agencyId)),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, t.agencyId)),
    t.institutionId ? db.select().from(s.institutions).where(eq(s.institutions.id, t.institutionId)) : Promise.resolve([]),
    t.applicationId ? db.select().from(s.studentApplications).where(eq(s.studentApplications.id, t.applicationId)) : Promise.resolve([]),
    t.invoiceId ? db.select().from(s.invoices).where(eq(s.invoices.id, t.invoiceId)) : Promise.resolve([]),
    t.invoiceId ? db.select().from(s.ledger).where(and(eq(s.ledger.invoiceId, t.invoiceId), eq(s.ledger.kind, "receipt"))) : Promise.resolve([]),
  ]);
  const paid = pays.reduce((a, x) => a + Number(x.amount), 0);
  const aud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const d = (v: string | null | undefined) => (v ? new Date(`${v}T00:00:00Z`).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "-");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.09, 0.09, 0.11);
  const muted = rgb(0.44, 0.44, 0.48);
  const line = rgb(0.86, 0.86, 0.9);
  const M = 46;
  const W = 595.28 - M * 2;
  let y = 841.89 - 46;
  const text = (v: string, x: number, size = 10, font = reg, color = ink) => page.drawText(safe(v), { x, y, size, font, color });
  const right = (v: string, size = 10, font = reg, color = ink) => page.drawText(safe(v), { x: M + W - font.widthOfTextAtSize(safe(v), size), y, size, font, color });

  y -= 13;
  text(p?.legalName || org?.name || "", M, 13, bold);
  right([p?.abn ? `ABN ${p.abn}` : "", p?.phone ?? ""].filter(Boolean).join("  ·  "), 8, reg, muted);
  y -= 11;
  right([p?.address, p?.email].filter(Boolean).join("  ·  "), 8, reg, muted);
  y -= 12;
  page.drawRectangle({ x: M, y, width: W, height: 1.6, color: ink });
  y -= 30;
  text("Official receipt", M, 18, bold);
  right(t.status === "remitted" ? "PAID · REMITTED" : paid + 0.005 >= Number(t.amount) ? "PAID" : paid > 0 ? "PART PAID" : "AWAITING PAYMENT", 9, bold, paid + 0.005 >= Number(t.amount) ? rgb(0.05, 0.55, 0.3) : rgb(0.75, 0.45, 0.05));
  y -= 16;
  text(`Receipt ${inv?.number ?? id.slice(0, 8)}-R  ·  issued ${d(new Date().toISOString().slice(0, 10))}`, M, 9, reg, muted);
  y -= 26;

  const pair = (k: string, v: string) => {
    text(k, M, 9.5, reg, muted);
    text(v, M + 150, 9.5);
    y -= 15;
  };
  pair("Received from", `${c.firstName} ${c.lastName}`);
  if (c.passportNumber) pair("Passport", c.passportNumber);
  pair("Paid on behalf of", inst?.name ?? "Institution");
  if (inst?.cricos) pair("CRICOS provider", inst.cricos);
  if (app) pair("Course", `${app.course}${app.courseCode ? ` (${app.courseCode})` : ""}${app.coeNumber ? ` · CoE ${app.coeNumber}` : ""}`);
  pair("Period", t.period);
  y -= 8;
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.6, color: line });
  y -= 10;
  const row = (k: string, v: string, b = false) => {
    text(k, M, 10, b ? bold : reg);
    right(v, 10, b ? bold : reg);
    y -= 17;
  };
  row(`${t.kind === "tuition" ? "Tuition fee" : t.kind === "oshc" ? "Overseas Student Health Cover" : `${t.kind[0].toUpperCase()}${t.kind.slice(1)} fee`}`, aud(Number(t.gross)));
  if (Number(t.scholarship) > 0) row("Less scholarship", `-${aud(Number(t.scholarship))}`);
  row("Amount payable", aud(Number(t.amount)), true);
  y -= 6;
  for (const x of pays) row(`Received ${d(x.occurredAt)} · ${x.method ?? "payment"}${x.reference ? ` · ${x.reference}` : ""}`, aud(Number(x.amount)));
  row("Total received", aud(paid), true);
  if (paid + 0.005 < Number(t.amount)) row("Balance owing", aud(Number(t.amount) - paid), true);
  y -= 10;
  page.drawLine({ start: { x: M, y: y + 6 }, end: { x: M + W, y: y + 6 }, thickness: 0.6, color: line });
  y -= 12;
  const note = t.status === "remitted" ? `Remitted to ${inst?.name ?? "the institution"} on ${d(t.remittedAt)}${t.remittedRef ? ` (reference ${t.remittedRef})` : ""}.` : `Held in our client (trust) account and remitted to ${inst?.name ?? "the institution"}${inst?.remitDays ? ` within ${inst.remitDays} days` : ""} under our agreement.`;
  for (const l of [note, "No GST applies: these are the institution's fees, collected and paid on your behalf. Keep this receipt for your records; the institution issues its own tuition receipt."]) {
    const words = safe(l).split(" ");
    let cur = "";
    for (const w of words) {
      if (reg.widthOfTextAtSize(`${cur} ${w}`, 8.5) > W && cur) {
        text(cur, M, 8.5, reg, muted);
        y -= 12;
        cur = w;
      } else cur = cur ? `${cur} ${w}` : w;
    }
    text(cur, M, 8.5, reg, muted);
    y -= 14;
  }
  page.drawText(safe(`${p?.legalName || org?.name || ""}  ·  generated by Lodgely`), { x: M, y: 30, size: 7, font: reg, color: muted });
  return new Response(Buffer.from(await pdf.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="Receipt ${inv?.number ?? id.slice(0, 8)}.pdf"`, "Cache-Control": "private, no-store" } });
}
