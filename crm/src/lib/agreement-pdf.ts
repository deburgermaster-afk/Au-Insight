import "server-only";
import { PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { AgreementContent } from "@/db/crm-schema";
import { drawLogo } from "@/lib/brand";

// The signed copy: the agreement exactly as sent, the client's signature, and an audit trail
// (who, when, from where, and the fingerprint of the text they saw).

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const ink = rgb(0.09, 0.09, 0.11);
const muted = rgb(0.44, 0.44, 0.48);
const line = rgb(0.89, 0.89, 0.91);

/** Standard PDF fonts only cover Latin-1, so map typographic characters and drop the rest. */
const safe = (v: string) =>
  v
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const aud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const syd = (d: Date | null | undefined) => (d ? `${d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} (Sydney)` : "-");

export type SignedInfo = {
  id: string;
  contentHash: string;
  sentByName: string | null;
  sentAt: Date;
  viewedAt: Date | null;
  signedAt: Date;
  signerName: string;
  signerEmail: string | null;
  signerIp: string | null;
  signerAgent: string | null;
  guideAcknowledged: boolean;
  signaturePng: string | null;
};

export async function agreementPdf(c: AgreementContent, s: SignedInfo, logo?: Uint8Array | null) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(c.title));
  pdf.setAuthor(safe(c.agency.legalName ?? c.agency.name));
  pdf.setSubject(`Signed by ${safe(s.signerName)}`);
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;
  const width = A4[0] - M * 2;

  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };
  const need = (h: number) => {
    if (y - h < M + 20) newPage();
  };
  const wrap = (text: string, font: PDFFont, size: number, w = width) => {
    const words = safe(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const word of words) {
      const next = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > w && cur) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    if (cur) lines.push(cur);
    return lines;
  };
  const text = (t: string, o: { font?: PDFFont; size?: number; color?: typeof ink; gap?: number; x?: number; w?: number } = {}) => {
    const font = o.font ?? reg;
    const size = o.size ?? 10;
    for (const l of wrap(t, font, size, o.w ?? width - (o.x ?? 0))) {
      need(size + 4);
      page.drawText(l, { x: M + (o.x ?? 0), y: y - size, size, font, color: o.color ?? ink });
      y -= size + 4;
    }
    y -= o.gap ?? 0;
  };
  const rule = (gap = 10) => {
    need(gap * 2);
    y -= gap / 2;
    page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: line });
    y -= gap;
  };
  const pair = (k: string, v: string) => {
    need(14);
    page.drawText(safe(k), { x: M, y: y - 9.5, size: 9.5, font: reg, color: muted });
    const lines = wrap(v, reg, 9.5, width - 140);
    lines.forEach((l, i) => page.drawText(l, { x: M + 140, y: y - 9.5 - i * 13, size: 9.5, font: reg, color: ink }));
    y -= Math.max(1, lines.length) * 13 + 1;
  };

  // Header (logo above the agency name when the agency has one)
  const logoH = (await drawLogo(pdf, page, logo, M, y, 160, 36)) ? 36 : 0;
  if (logoH) y -= logoH + 8;
  text(c.agency.legalName ?? c.agency.name, { font: bold, size: 12 });
  text([c.agency.abn ? `ABN ${c.agency.abn}` : null, c.agency.marn ? `MARN ${c.agency.marn}` : null, c.agency.phone, c.agency.email].filter(Boolean).join("  ·  "), { size: 8.5, color: muted, gap: 14 });
  text(c.title, { font: bold, size: 17, gap: 2 });
  text(`Reference ${c.matter.reference}  ·  prepared ${c.preparedOn}`, { size: 9, color: muted, gap: 8 });
  rule();

  text("Parties", { font: bold, size: 11, gap: 4 });
  pair("Client", c.client.name);
  if (c.client.dateOfBirth) pair("Date of birth", c.client.dateOfBirth);
  if (c.client.address) pair("Address", c.client.address);
  if (c.client.email) pair("Email", c.client.email);
  pair("Agency", c.agency.legalName ?? c.agency.name);
  if (c.agency.address) pair("Agency address", c.agency.address);
  pair("Registered agent", `${c.agency.agent}${c.agency.agentMarn ? ` (MARN ${c.agency.agentMarn})` : ""}`);
  pair("Application", `${c.matter.visa}${c.matter.stream ? `, ${c.matter.stream} stream` : ""}`);
  y -= 6;
  rule();

  text("Fee estimate", { font: bold, size: 11, gap: 4 });
  if (c.fees.length) {
    for (const f of c.fees) {
      need(14);
      page.drawText(safe(f.label + (f.note ? ` (${f.note})` : "")), { x: M, y: y - 9.5, size: 9.5, font: reg, color: ink });
      const amt = aud(f.amount);
      page.drawText(amt, { x: A4[0] - M - reg.widthOfTextAtSize(amt, 9.5), y: y - 9.5, size: 9.5, font: reg, color: ink });
      y -= 14;
    }
    const total = aud(c.fees.reduce((a, f) => a + f.amount, 0));
    need(16);
    page.drawLine({ start: { x: M, y: y - 2 }, end: { x: A4[0] - M, y: y - 2 }, thickness: 0.6, color: line });
    y -= 6;
    page.drawText("Total estimate", { x: M, y: y - 10, size: 10, font: bold, color: ink });
    page.drawText(total, { x: A4[0] - M - bold.widthOfTextAtSize(total, 10), y: y - 10, size: 10, font: bold, color: ink });
    y -= 18;
  } else text("Fees to be confirmed in writing before work starts.", { size: 9.5, color: muted });
  rule();

  for (const sec of c.sections) {
    need(40);
    text(sec.heading, { font: bold, size: 10.5, gap: 2 });
    for (const p of sec.body) text(p, { size: 9.5, gap: 5 });
    y -= 4;
  }
  rule(14);

  // Signature
  need(150);
  text("Signed by the client", { font: bold, size: 11, gap: 6 });
  if (s.signaturePng?.startsWith("data:image/png;base64,")) {
    const img = await pdf.embedPng(Buffer.from(s.signaturePng.split(",")[1], "base64"));
    const h = 60;
    const w = Math.min(220, (img.width / img.height) * h);
    page.drawImage(img, { x: M, y: y - h, width: w, height: h });
    y -= h + 4;
  }
  page.drawLine({ start: { x: M, y }, end: { x: M + 240, y }, thickness: 0.6, color: muted });
  y -= 4;
  text(`${s.signerName}  ·  ${syd(s.signedAt)}`, { size: 9.5 });
  text(s.guideAcknowledged ? "Confirmed receiving the OMARA Consumer Guide." : "", { size: 9, color: muted });

  // Audit trail
  newPage();
  text("Signing record", { font: bold, size: 14, gap: 4 });
  text("Kept by Lodgely with this agreement. The fingerprint changes if any word of the agreement changes.", { size: 9, color: muted, gap: 8 });
  rule();
  pair("Agreement ID", s.id);
  pair("Fingerprint (SHA-256)", s.contentHash);
  pair("Sent", `${syd(s.sentAt)}${s.sentByName ? ` by ${s.sentByName}` : ""}`);
  pair("Opened by client", syd(s.viewedAt));
  pair("Signed", syd(s.signedAt));
  pair("Signed as", s.signerName);
  pair("Signed in as", s.signerEmail ?? "-");
  pair("Signing method", "Client portal sign-in (emailed link or code), typed name and drawn signature");
  pair("IP address", s.signerIp ?? "-");
  pair("Device", s.signerAgent ?? "-");
  pair("Consumer Guide", s.guideAcknowledged ? "Acknowledged as received" : "Not acknowledged");

  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    const label = safe(`${c.matter.reference}  ·  ${c.client.name}  ·  page ${i + 1} of ${pages.length}`);
    pg.drawText(label, { x: M, y: 30, size: 7.5, font: reg, color: muted });
  });
  return pdf.save();
}
