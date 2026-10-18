import "server-only";
import { createHash } from "node:crypto";
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { SignField, SignValue } from "@/db/crm-schema";
import { type ConsentTemplate, type ConsentVars, consentSections, fillConsent } from "@/lib/consent-templates";

// PDFs for e-signing: consent forms rendered from templates (with their fields placed exactly), and
// the signed copy (values stamped onto the original pages, plus a signing record page).

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const ink = rgb(0.09, 0.09, 0.11);
const muted = rgb(0.44, 0.44, 0.48);
const line = rgb(0.85, 0.85, 0.88);
const accent = rgb(0.16, 0.38, 0.85);

export const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Standard PDF fonts only cover Latin-1, so map typographic characters and drop the rest. */
export const safe = (v: string) =>
  v
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

const syd = (d: Date | null | undefined) => (d ? `${d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} (Sydney)` : "-");

function wrapper(font: PDFFont) {
  return (text: string, size: number, w: number) => {
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
}

/** Renders a consent template, filled in, to a PDF. Returns the bytes and the fields to sign. */
export async function renderConsentPdf(t: ConsentTemplate, vars: Partial<ConsentVars>) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(t.title));
  pdf.setAuthor(safe(vars.agencyLegal || vars.agency || "Lodgely"));
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wrap = wrapper(reg);
  const width = A4[0] - M * 2;
  const fields: SignField[] = [];
  let page: PDFPage = pdf.addPage(A4);
  let y = A4[1] - M;
  const pageNo = () => pdf.getPageCount();
  const newPage = () => {
    page = pdf.addPage(A4);
    y = A4[1] - M;
  };
  const need = (h: number) => {
    if (y - h < M + 40) newPage();
  };
  const text = (s: string, o: { font?: PDFFont; size?: number; color?: typeof ink; gap?: number; x?: number } = {}) => {
    const size = o.size ?? 10;
    const font = o.font ?? reg;
    for (const l of (font === reg ? wrap : wrapper(font))(s, size, width - (o.x ?? 0))) {
      need(size + 4);
      page.drawText(l, { x: M + (o.x ?? 0), y: y - size, size, font, color: o.color ?? ink });
      y -= size + 4;
    }
    y -= o.gap ?? 0;
  };
  /** Records a field at PDF points (bottom-left origin) as page fractions (top-left origin). */
  const field = (f: Omit<SignField, "id" | "page" | "x" | "y" | "w" | "h" | "source">, x: number, yTop: number, w: number, h: number) => {
    fields.push({ ...f, id: `f${fields.length + 1}`, page: pageNo(), x: x / A4[0], y: (A4[1] - yTop) / A4[1], w: w / A4[0], h: h / A4[1], source: "template" });
    page.drawRectangle({ x, y: yTop - h, width: w, height: h, borderColor: line, borderWidth: 0.8, color: rgb(0.97, 0.98, 1) });
  };

  // Letterhead
  text(vars.agencyLegal || vars.agency || "", { font: bold, size: 12 });
  text([vars.abn ? `ABN ${vars.abn}` : null, vars.agentMarn ? `Agent MARN ${vars.agentMarn}` : null, vars.agencyPhone, vars.agencyEmail].filter(Boolean).join("  ·  "), { size: 8.5, color: muted, gap: 14 });
  text(t.title, { font: bold, size: 16, gap: 2 });
  text(`${vars.matterRef ? `Reference ${vars.matterRef}  ·  ` : ""}prepared ${vars.date ?? ""}`, { size: 9, color: muted, gap: 10 });
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: line });
  y -= 14;

  for (const sec of consentSections(fillConsent(t.body, vars))) {
    need(40);
    if (sec.heading) text(sec.heading, { font: bold, size: 10.5, gap: 3 });
    for (const p of sec.paras) text(p, { size: 9.5, gap: 6 });
    y -= 4;
  }

  // Initials at the foot of every body page (before the signature block is added).
  if (t.initials) {
    const bodyPages = pdf.getPageCount();
    for (let i = 0; i < bodyPages; i++) {
      const pg = pdf.getPage(i);
      pg.drawText("Initials", { x: A4[0] - M - 110, y: 52, size: 8, font: reg, color: muted });
      fields.push({ id: `f${fields.length + 1}`, page: i + 1, x: (A4[0] - M - 70) / A4[0], y: (A4[1] - 66) / A4[1], w: 70 / A4[0], h: 26 / A4[1], type: "initials", label: "Initials", required: true, source: "template" });
      pg.drawRectangle({ x: A4[0] - M - 70, y: 40, width: 70, height: 26, borderColor: line, borderWidth: 0.8, color: rgb(0.97, 0.98, 1) });
    }
  }

  // Signature block
  need(60 + (t.checkboxes?.length ?? 0) * 22 + (t.textField ? 60 : 0) + 150);
  y -= 6;
  text("Client confirmation", { font: bold, size: 11, gap: 6 });
  for (const cb of t.checkboxes ?? []) {
    need(24);
    field({ type: "checkbox", label: cb.label, required: Boolean(cb.required) }, M, y, 14, 14);
    const lines = wrap(cb.label + (cb.required ? "" : " (optional)"), 9.5, width - 24);
    lines.forEach((l, i) => page.drawText(l, { x: M + 22, y: y - 10.5 - i * 13, size: 9.5, font: reg, color: ink }));
    y -= Math.max(18, lines.length * 13 + 6);
  }
  if (t.textField) {
    need(60);
    text(t.textField.label, { size: 9, color: muted, gap: 2 });
    field({ type: "text", label: t.textField.label, required: Boolean(t.textField.required) }, M, y, width, 34);
    y -= 44;
  }
  need(130);
  y -= 6;
  page.drawText("Signature", { x: M, y: y - 9, size: 9, font: reg, color: muted });
  page.drawText("Date", { x: M + 300, y: y - 9, size: 9, font: reg, color: muted });
  y -= 14;
  field({ type: "signature", label: "Client signature", required: true }, M, y, 240, 56);
  field({ type: "date", label: "Date signed", required: true }, M + 300, y, 140, 26);
  y -= 66;
  page.drawText("Full name", { x: M, y: y - 9, size: 9, font: reg, color: muted });
  y -= 14;
  field({ type: "name", label: "Full name", required: true }, M, y, 240, 26);
  y -= 40;
  text(`Prepared by ${vars.agent || "the registered migration agent"}${vars.agentMarn ? ` (MARN ${vars.agentMarn})` : ""} for ${vars.client || "the client"}. Signed electronically through the Lodgely client portal.`, { size: 8, color: muted });

  const pages = pdf.getPages();
  pages.forEach((pg, i) => pg.drawText(safe(`${t.title}  ·  ${vars.client ?? ""}  ·  page ${i + 1} of ${pages.length}`), { x: M, y: 24, size: 7.5, font: reg, color: muted }));
  const bytes = await pdf.save();
  return { bytes, fields, pages: pages.length };
}

/** Maps a field box (page fractions, top-left origin) to PDF user space, respecting crop box and rotation. */
function place(pg: PDFPage, f: { x: number; y: number; w: number; h: number }) {
  const cb = pg.getCropBox();
  const rot = ((pg.getRotation().angle % 360) + 360) % 360;
  // u/v: right/down on the page as displayed, in points.
  if (rot === 90) return { x: cb.x + (f.y + f.h) * cb.width, y: cb.y + f.x * cb.height, w: f.h * cb.width, h: f.w * cb.height, rotate: 90 };
  if (rot === 180) return { x: cb.x + (1 - f.x) * cb.width, y: cb.y + (f.y + f.h) * cb.height, w: f.w * cb.width, h: f.h * cb.height, rotate: 180 };
  if (rot === 270) return { x: cb.x + (1 - f.y - f.h) * cb.width, y: cb.y + (1 - f.x) * cb.height, w: f.h * cb.width, h: f.w * cb.height, rotate: 270 };
  return { x: cb.x + f.x * cb.width, y: cb.y + (1 - f.y - f.h) * cb.height, w: f.w * cb.width, h: f.h * cb.height, rotate: 0 };
}

export type SignAudit = {
  id: string;
  title: string;
  agency: string;
  clientName: string;
  sourceHash: string;
  sentByName: string | null;
  sentAt: Date;
  viewedAt: Date | null;
  signedAt: Date;
  signerName: string;
  signerEmail: string | null;
  signerIp: string | null;
  signerAgent: string | null;
};

/** Stamps the client's values onto the original PDF and adds a signing record page. */
export async function stampSignedPdf(source: Uint8Array, fields: SignField[], values: SignValue[], audit: SignAudit) {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true });
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const byId = new Map(values.map((v) => [v.id, v.value]));
  const images = new Map<string, Awaited<ReturnType<typeof pdf.embedPng>>>();
  // Flatten any form so stamped values aren't hidden behind interactive fields.
  try {
    pdf.getForm().flatten();
  } catch {
    /* no form */
  }
  const pages = pdf.getPages();
  for (const f of fields) {
    const v = byId.get(f.id);
    const pg = pages[f.page - 1];
    if (!v || !pg) continue;
    const r = place(pg, f);
    const rot = degrees(r.rotate);
    if (f.type === "signature" || f.type === "initials") {
      if (!v.startsWith("data:image/png;base64,")) continue;
      let img = images.get(v);
      if (!img) {
        img = await pdf.embedPng(Buffer.from(v.split(",")[1], "base64"));
        images.set(v, img);
      }
      const ratio = img.width / img.height;
      const boxW = r.rotate % 180 ? r.h : r.w;
      const boxH = r.rotate % 180 ? r.w : r.h;
      let h = boxH * 0.92;
      let w = h * ratio;
      if (w > boxW * 0.96) {
        w = boxW * 0.96;
        h = w / ratio;
      }
      if (r.rotate === 0) pg.drawImage(img, { x: r.x + 2, y: r.y + (boxH - h) / 2, width: w, height: h });
      else pg.drawImage(img, { x: r.x, y: r.y, width: w, height: h, rotate: rot });
    } else if (f.type === "checkbox") {
      if (v !== "yes") continue;
      const s = Math.min(r.w, r.h);
      pg.drawText("X", { x: r.x + s * 0.18, y: r.y + s * 0.18, size: s * 0.85, font: bold, color: accent, rotate: rot });
    } else {
      const boxW = r.rotate % 180 ? r.h : r.w;
      const boxH = r.rotate % 180 ? r.w : r.h;
      let size = Math.min(11, boxH * 0.62);
      const t = safe(v).slice(0, 300);
      while (size > 5 && reg.widthOfTextAtSize(t, size) > boxW - 4) size -= 0.5;
      if (r.rotate === 0) pg.drawText(t, { x: r.x + 2, y: r.y + (boxH - size) / 2 + 1, size, font: reg, color: ink });
      else pg.drawText(t, { x: r.x, y: r.y, size, font: reg, color: ink, rotate: rot });
    }
  }

  // Signing record
  const page = pdf.addPage(A4);
  let y = A4[1] - M;
  const wrap = wrapper(reg);
  const write = (s: string, size = 9.5, font = reg, color = ink) => {
    for (const l of wrap(s, size, A4[0] - M * 2)) {
      page.drawText(l, { x: M, y: y - size, size, font, color });
      y -= size + 4;
    }
  };
  const pair = (k: string, v: string) => {
    page.drawText(safe(k), { x: M, y: y - 9.5, size: 9.5, font: reg, color: muted });
    const lines = wrap(v, 9.5, A4[0] - M * 2 - 150);
    lines.forEach((l, i) => page.drawText(l, { x: M + 150, y: y - 9.5 - i * 13, size: 9.5, font: reg, color: ink }));
    y -= Math.max(1, lines.length) * 13 + 2;
  };
  write("Signing record", 15, bold);
  y -= 2;
  write(`Kept by Lodgely for ${audit.agency}. The fingerprint identifies the exact document the client was shown; any change to it gives a different fingerprint.`, 9, reg, muted);
  y -= 6;
  page.drawLine({ start: { x: M, y }, end: { x: A4[0] - M, y }, thickness: 0.6, color: line });
  y -= 12;
  pair("Document", audit.title);
  pair("Request ID", audit.id);
  pair("Client", audit.clientName);
  pair("Original fingerprint (SHA-256)", audit.sourceHash);
  pair("Sent", `${syd(audit.sentAt)}${audit.sentByName ? ` by ${audit.sentByName}` : ""}`);
  pair("Opened by client", syd(audit.viewedAt));
  pair("Signed", syd(audit.signedAt));
  pair("Signed as", audit.signerName);
  pair("Signed in as", audit.signerEmail ?? "-");
  pair("Method", "Client portal sign-in (emailed link or code), guided fields, drawn or typed signature");
  pair("IP address", audit.signerIp ?? "-");
  pair("Device", audit.signerAgent ?? "-");
  y -= 6;
  write("Fields completed", 10.5, bold);
  for (const f of fields) {
    const v = byId.get(f.id);
    const shown = !v ? "(left blank)" : f.type === "signature" || f.type === "initials" ? `${f.type} applied` : f.type === "checkbox" ? (v === "yes" ? "ticked" : "not ticked") : v;
    pair(`p${f.page} · ${f.label}`.slice(0, 40), shown);
    if (y < M + 30) break;
  }
  return pdf.save();
}
