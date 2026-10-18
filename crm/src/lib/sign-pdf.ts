import "server-only";
import { createHash } from "node:crypto";
import { degrees, PDFDocument, type PDFFont, type PDFPage, rgb, StandardFonts } from "pdf-lib";
import type { SignField, SignSigner, SignValue } from "@/db/crm-schema";
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

type Rgb = ReturnType<typeof rgb>;
const panel = rgb(0.965, 0.968, 0.976);
const fieldFill = rgb(0.955, 0.97, 1);
const fieldLine = rgb(0.62, 0.7, 0.86);

/**
 * Renders a consent template, filled in, to an A4 PDF. The layout is fitted to one page: it tries
 * body sizes from 10pt down to 7.5pt and keeps the largest that fits, flowing to more pages only
 * when even the smallest doesn't. Fields are placed on exact point positions and returned as page
 * fractions for the signing screen.
 */
/** A signer besides the client: another person (sponsor, second parent) or the agent countersigning. */
export type ExtraSigner = { id: string; role: "other" | "agent"; label: string; name: string; marn?: string | null };

export async function renderConsentPdf(t: ConsentTemplate, vars: Partial<ConsentVars>, extra: ExtraSigner[] = []) {
  for (const size of [10, 9.6, 9.2, 8.8, 8.4, 8, 7.6]) {
    const r = await layoutConsent(t, vars, size, extra);
    if (r.pages === 1) return r;
  }
  return layoutConsent(t, vars, 9, extra);
}

/** Several consent forms as one PDF (a "pack"), each starting on its own page; fields keep their page. */
export async function renderBundle(list: ConsentTemplate[], vars: Partial<ConsentVars>, extra: ExtraSigner[] = [], agentFor: (t: ConsentTemplate) => boolean = (t) => Boolean(t.countersign)) {
  const out = await PDFDocument.create();
  out.setTitle(safe(list.map((t) => t.title).join(", ")).slice(0, 200));
  out.setCreator("Lodgely");
  const fields: SignField[] = [];
  for (const t of list) {
    const r = await renderConsentPdf(t, vars, extra.filter((e) => e.role !== "agent" || agentFor(t)));
    const src = await PDFDocument.load(r.bytes);
    const offset = out.getPageCount();
    for (const pg of await out.copyPages(src, src.getPageIndices())) out.addPage(pg);
    for (const f of r.fields) fields.push({ ...f, page: f.page + offset, label: list.length > 1 ? `${f.label} · ${t.title}`.slice(0, 110) : f.label });
  }
  fields.forEach((f, i) => (f.id = `f${i + 1}`));
  return { bytes: await out.save(), fields, pages: out.getPageCount() };
}

async function layoutConsent(t: ConsentTemplate, vars: Partial<ConsentVars>, size: number, extra: ExtraSigner[] = []) {
  const [W, H] = A4;
  const MX = 46; // side margin
  const TOP = 44;
  const FOOT = t.initials ? 66 : 40; // space kept for the footer (and initials)
  const pdf = await PDFDocument.create();
  pdf.setTitle(safe(t.title));
  pdf.setAuthor(safe(vars.agencyLegal || vars.agency || "Lodgely"));
  pdf.setCreator("Lodgely");
  const reg = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const wrapR = wrapper(reg);
  const wrapB = wrapper(bold);
  const width = W - MX * 2;
  const lh = size * 1.36; // body line height
  const fields: SignField[] = [];
  let page: PDFPage = pdf.addPage(A4);
  let y = H - TOP; // top of the next line box
  const newPage = () => {
    page = pdf.addPage(A4);
    y = H - TOP;
  };
  const need = (h: number) => {
    if (y - h < FOOT + 6) newPage();
  };
  /** Draws wrapped text with its first line's box starting at y. */
  const para = (s: string, o: { font?: PDFFont; size?: number; color?: Rgb; x?: number; w?: number; gap?: number; lead?: number } = {}) => {
    const font = o.font ?? reg;
    const sz = o.size ?? size;
    const lead = o.lead ?? sz * 1.36;
    const lines = (font === bold ? wrapB : font === reg ? wrapR : wrapper(font))(s, sz, (o.w ?? width - (o.x ?? 0)) - 2);
    for (const l of lines) {
      need(lead);
      // Baseline sits at the cap-height centre of the line box.
      page.drawText(l, { x: MX + (o.x ?? 0), y: y - (lead + sz * 0.7) / 2, size: sz, font, color: o.color ?? ink });
      y -= lead;
    }
    y -= o.gap ?? 0;
  };
  const rightText = (s: string, yy: number, sz: number, font = reg, color: Rgb = muted) => page.drawText(safe(s), { x: W - MX - font.widthOfTextAtSize(safe(s), sz), y: yy, size: sz, font, color });
  const box = (x: number, top: number, w: number, h: number, fill = fieldFill, border = fieldLine) => page.drawRectangle({ x, y: top - h, width: w, height: h, color: fill, borderColor: border, borderWidth: 0.7 });
  /** A field at point coordinates (top-left of the box), recorded as page fractions. */
  const field = (f: Pick<SignField, "type" | "label" | "required">, x: number, top: number, w: number, h: number, signer = "client") => {
    fields.push({ ...f, id: `f${fields.length + 1}`, page: pdf.getPageCount(), x: x / W, y: (H - top) / H, w: w / W, h: h / H, source: "template", signer });
  };

  // ── Letterhead ──
  const agencyName = vars.agencyLegal || vars.agency || "";
  page.drawText(safe(agencyName), { x: MX, y: y - 13, size: 13, font: bold, color: ink });
  const contact = [vars.abn ? `ABN ${vars.abn}` : "", vars.agencyAddress ?? "", [vars.agencyPhone, vars.agencyEmail].filter(Boolean).join("  ·  ")].filter(Boolean);
  contact.forEach((c, i) => rightText(c, y - 7 - i * 9.5, 7.5));
  y -= Math.max(20, contact.length * 9.5 + 4);
  page.drawRectangle({ x: MX, y: y - 1.6, width: width, height: 1.6, color: ink });
  y -= 14;
  para(t.title, { font: bold, size: size + 6, lead: (size + 6) * 1.2, gap: 1 });
  para(`${vars.matterRef ? `Matter ${vars.matterRef}   ·   ` : ""}Prepared ${vars.date ?? ""}`, { size: size - 1.5, color: muted, gap: size * 0.9 });

  // ── Parties panel (two columns) ──
  const rows: [string, string][][] = [
    [["Client", vars.client ?? ""], ["Date of birth", vars.clientDob ?? ""], ["Passport", [vars.passport, vars.nationality].filter(Boolean).join(" · ")]],
    [["Registered migration agent", `${vars.agent ?? ""}${vars.agentMarn ? `  (MARN ${vars.agentMarn})` : ""}`], ["Agency", agencyName], ["Matter", vars.visa ?? ""]],
  ];
  const colW = (width - 24) / 2;
  const labelSz = size - 2.2;
  const valSz = size - 0.6;
  const cellH = (col: [string, string][]) => col.reduce((h, [, v]) => h + labelSz * 1.25 + Math.max(1, wrapR(v || "—", valSz, colW - 4).length) * valSz * 1.3 + 4, 0);
  const panelH = Math.max(cellH(rows[0]), cellH(rows[1])) + 14;
  need(panelH);
  page.drawRectangle({ x: MX, y: y - panelH, width, height: panelH, color: panel });
  rows.forEach((col, ci) => {
    let cy = y - 8;
    const cx = MX + 10 + ci * (colW + 4);
    for (const [k, v] of col) {
      page.drawText(safe(k.toUpperCase()), { x: cx, y: cy - labelSz, size: labelSz, font: bold, color: muted });
      cy -= labelSz * 1.25 + 1;
      for (const l of wrapR(v || "—", valSz, colW - 4)) {
        page.drawText(l, { x: cx, y: cy - valSz, size: valSz, font: reg, color: ink });
        cy -= valSz * 1.3;
      }
      cy -= 3;
    }
  });
  y -= panelH + size * 1.1;

  // ── Body (the template's own "Parties" section is shown as the panel above) ──
  for (const sec of consentSections(fillConsent(t.body, vars))) {
    if (/^parties$/i.test(sec.heading)) continue;
    need(lh * 3);
    if (sec.heading) para(sec.heading, { font: bold, size: size + 0.6, gap: size * 0.15 });
    sec.paras.forEach((p, i) => para(p, { gap: i === sec.paras.length - 1 ? size * 0.75 : size * 0.4 }));
  }

  // ── Confirmation and signature ──
  const cbs = t.checkboxes ?? [];
  const cbLines = cbs.map((cb) => wrapR(cb.label + (cb.required ? "" : " (optional)"), size, width - 44));
  const textH = t.textField ? labelSz * 1.4 + 26 + 8 : 0;
  const sigBlock = 14 + size * 1.6 + cbLines.reduce((h, l) => h + Math.max(16, l.length * lh) + 4, 0) + textH + 12 + 58 + 10 + 26 + 18 + 12;
  const extraH = extra.length * 92;
  need(sigBlock + extraH);
  y -= 2;
  const blockTop = y;
  y -= 12;
  page.drawText("CLIENT CONFIRMATION", { x: MX + 12, y: y - size + 1, size: size - 1, font: bold, color: muted });
  y -= size * 1.6;
  const ix = MX + 12;
  cbs.forEach((cb, i) => {
    const lines = cbLines[i];
    const rowH = Math.max(16, lines.length * lh);
    const s = 11;
    const top = y - (Math.min(rowH, lh) - s) / 2;
    box(ix, top, s, s);
    field({ type: "checkbox", label: cb.label, required: Boolean(cb.required) }, ix, top, s, s);
    lines.forEach((l, j) => page.drawText(l, { x: ix + 20, y: y - j * lh - (lh + size * 0.7) / 2, size, font: reg, color: ink }));
    y -= rowH + 4;
  });
  const inner = width - 24;
  if (t.textField) {
    page.drawText(safe(t.textField.label), { x: ix, y: y - labelSz, size: labelSz, font: reg, color: muted });
    y -= labelSz * 1.4;
    box(ix, y, inner, 26);
    field({ type: "text", label: t.textField.label, required: Boolean(t.textField.required) }, ix, y, inner, 26);
    y -= 26 + 8;
  }
  y -= 4;
  const sigW = Math.round(inner * 0.56);
  const dateX = ix + sigW + 20;
  const dateW = inner - sigW - 20;
  page.drawText("Signature", { x: ix, y: y - labelSz, size: labelSz, font: reg, color: muted });
  page.drawText("Date", { x: dateX, y: y - labelSz * 1.5 - 26 + 4, size: labelSz, font: reg, color: muted });
  y -= labelSz * 1.5;
  box(ix, y, sigW, 52);
  field({ type: "signature", label: "Client signature", required: true }, ix, y, sigW, 52);
  page.drawLine({ start: { x: ix + 8, y: y - 42 }, end: { x: ix + sigW - 8, y: y - 42 }, thickness: 0.5, color: fieldLine });
  // The date sits level with the bottom of the signature box.
  box(dateX, y - 26, dateW, 26);
  field({ type: "date", label: "Date signed", required: true }, dateX, y - 26, dateW, 26);
  y -= 52 + 8;
  page.drawText("Full name", { x: ix, y: y - labelSz, size: labelSz, font: reg, color: muted });
  y -= labelSz * 1.5;
  box(ix, y, sigW, 24);
  field({ type: "name", label: "Full name", required: true }, ix, y, sigW, 24);
  y -= 24 + 12;
  // Border drawn last, sized to what was drawn (outline only, so it covers nothing).
  page.drawRectangle({ x: MX, y, width, height: blockTop - y, borderColor: line, borderWidth: 0.8 });

  // ── Other signers: each gets its own box with signature and date ──
  for (const e of extra) {
    y -= 10;
    const top = y;
    y -= 12;
    const head = e.role === "agent" ? `REGISTERED MIGRATION AGENT  ·  ${e.name}${e.marn ? `  (MARN ${e.marn})` : ""}` : `${e.label.toUpperCase()}  ·  ${e.name}`;
    page.drawText(safe(head), { x: ix, y: y - size + 1, size: size - 1, font: bold, color: muted });
    y -= size * 1.6;
    page.drawText("Signature", { x: ix, y: y - labelSz, size: labelSz, font: reg, color: muted });
    y -= labelSz * 1.5;
    box(ix, y, sigW, 40);
    field({ type: "signature", label: `${e.role === "agent" ? "Agent" : e.label} signature`, required: true }, ix, y, sigW, 40, e.id);
    page.drawLine({ start: { x: ix + 8, y: y - 31 }, end: { x: ix + sigW - 8, y: y - 31 }, thickness: 0.5, color: fieldLine });
    page.drawText("Date", { x: dateX, y: y - 40 + 26 + 4, size: labelSz, font: reg, color: muted });
    box(dateX, y - 14, dateW, 26);
    field({ type: "date", label: `${e.role === "agent" ? "Agent" : e.label} date`, required: true }, dateX, y - 14, dateW, 26, e.id);
    y -= 40 + 12;
    page.drawRectangle({ x: MX, y, width, height: top - y, borderColor: line, borderWidth: 0.8 });
  }

  // ── Footer on every page, with initials boxes when the template asks for them ──
  const pages = pdf.getPages();
  pages.forEach((pg, i) => {
    pg.drawLine({ start: { x: MX, y: 30 }, end: { x: W - MX, y: 30 }, thickness: 0.5, color: line });
    pg.drawText(safe(`${t.title}  ·  ${vars.client ?? ""}  ·  Signed electronically via Lodgely`), { x: MX, y: 19, size: 7, font: reg, color: muted });
    const pn = `Page ${i + 1} of ${pages.length}`;
    if (t.initials) {
      const bx = W - MX - 64;
      pg.drawText("Initials", { x: bx - reg.widthOfTextAtSize("Initials", 7) - 6, y: 40, size: 7, font: reg, color: muted });
      pg.drawRectangle({ x: bx, y: 34, width: 64, height: 22, color: fieldFill, borderColor: fieldLine, borderWidth: 0.7 });
      fields.push({ id: `f${fields.length + 1}`, page: i + 1, x: bx / W, y: (H - 56) / H, w: 64 / W, h: 22 / H, type: "initials", label: "Initials", required: true, source: "template", signer: "client" });
    }
    pg.drawText(pn, { x: W - MX - reg.widthOfTextAtSize(pn, 7), y: 19, size: 7, font: reg, color: muted });
  });
  const bytes = await pdf.save();
  fields.forEach((f, i) => (f.id = `f${i + 1}`));
  return { bytes, fields, pages: pages.length, size };
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
  signers?: SignSigner[];
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

  // Signing record (flows onto more pages when there are many fields)
  let page = pdf.addPage(A4);
  let y = A4[1] - M;
  const wrap = wrapper(reg);
  const KEY_W = 168;
  const ensure = (h: number) => {
    if (y - h < M) {
      page = pdf.addPage(A4);
      y = A4[1] - M;
    }
  };
  /** Cuts text to fit a width, with an ellipsis. */
  const fit = (s: string, size: number, w: number) => {
    let t = safe(s);
    if (reg.widthOfTextAtSize(t, size) <= w) return t;
    while (t.length > 1 && reg.widthOfTextAtSize(`${t}...`, size) > w) t = t.slice(0, -1);
    return `${t.trimEnd()}...`;
  };
  const write = (s: string, size = 9.5, font = reg, color = ink) => {
    for (const l of wrap(s, size, A4[0] - M * 2)) {
      ensure(size + 4);
      page.drawText(l, { x: M, y: y - size, size, font, color });
      y -= size + 4;
    }
  };
  const pair = (k: string, v: string, size = 9.5) => {
    const lines = wrap(v, size, A4[0] - M * 2 - KEY_W);
    ensure(Math.max(1, lines.length) * (size + 3.5) + 2);
    page.drawText(fit(k, size, KEY_W - 10), { x: M, y: y - size, size, font: reg, color: muted });
    lines.forEach((l, i) => page.drawText(l, { x: M + KEY_W, y: y - size - i * (size + 3.5), size, font: reg, color: ink }));
    y -= Math.max(1, lines.length) * (size + 3.5) + 2;
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
  for (const sg of (audit.signers ?? []).filter((x) => x.role !== "client")) {
    y -= 4;
    pair(sg.role === "agent" ? "Countersigned by agent" : `Signed by ${sg.label.toLowerCase()}`, `${sg.signedName ?? sg.name} · ${syd(sg.signedAt ? new Date(sg.signedAt) : null)}`);
    pair("    Signed in as", `${sg.email ?? "-"}${sg.role === "other" ? " (personal emailed link)" : sg.role === "agent" ? " (Lodgely staff sign-in)" : ""}`);
    pair("    IP address", sg.ip ?? "-");
  }
  y -= 8;
  write("Fields completed", 10.5, bold);
  y -= 2;
  const who = new Map((audit.signers ?? []).map((x) => [x.id, x.role === "agent" ? "agent" : x.label.toLowerCase()]));
  for (const f of fields) {
    const v = byId.get(f.id);
    const shown = !v ? "(left blank)" : f.type === "signature" || f.type === "initials" ? `${f.type} applied` : f.type === "checkbox" ? (v === "yes" ? "ticked" : "not ticked") : v;
    const by = who.size > 1 ? ` (${who.get(f.signer ?? "client") ?? "client"})` : "";
    pair(`p${f.page}  ${f.label}`, `${shown}${by}`, 8.5);
  }
  return pdf.save();
}
