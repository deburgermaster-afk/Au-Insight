import "server-only";
import { drawLogo } from "@/lib/brand";
import { PDFDocument, type PDFFont, rgb, StandardFonts } from "pdf-lib";

// Signed employment contract: the text exactly as issued, then a signature and audit page.

const A4: [number, number] = [595.28, 841.89];
const M = 56;
const ink = rgb(0.09, 0.09, 0.11);
const muted = rgb(0.44, 0.44, 0.48);

const safe = (v: string) =>
  v
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        out.push(line);
        line = word;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const syd = (d: Date) => `${d.toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" })} (Sydney)`;

export async function contractPdf(c: { title: string; body: string; agencyName: string; id: string; hash: string; sentByName: string | null; sentAt: Date | null; signedName: string; signedAt: Date; ip: string | null; agent: string | null; email: string }, logo?: Uint8Array | null) {
  const doc = await PDFDocument.create();
  doc.setTitle(safe(c.title));
  doc.setProducer("Lodgely");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage(A4);
  let y = A4[1] - M;
  const width = A4[0] - M * 2;
  const logoW = await drawLogo(doc, page, logo, M, y, 160, 36);
  if (logoW) y -= 36 + 14;
  const write = (text: string, f: PDFFont, size: number, color = ink, indent = 0, gap = 4) => {
    for (const l of wrap(safe(text), f, size, width - indent)) {
      if (y < M + size) {
        page = doc.addPage(A4);
        y = A4[1] - M;
      }
      page.drawText(l, { x: M + indent, y: y - size, size, font: f, color });
      y -= size + gap;
    }
  };
  for (const raw of c.body.split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      y -= 6;
      continue;
    }
    const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1");
    if (line.startsWith("# ")) write(strip(line.slice(2)), bold, 17, ink, 0, 8);
    else if (line.startsWith("## ")) {
      y -= 6;
      write(strip(line.slice(3)), bold, 11.5, ink, 0, 5);
    } else if (/^\s*[-*] /.test(line)) write(`-  ${strip(line.replace(/^\s*[-*] /, ""))}`, font, 9.5, ink, 10);
    else write(strip(line), font, 9.5);
  }
  page = doc.addPage(A4);
  y = A4[1] - M;
  write("Signature and audit trail", bold, 15, ink, 0, 10);
  write(`Signed by ${c.signedName} (${c.email})`, bold, 11);
  write(`Accepted electronically by typing their full name and agreeing to the contract, under the Electronic Transactions Act 1999 (Cth).`, font, 9.5, muted);
  y -= 8;
  const rows: [string, string][] = [
    ["Contract", c.title],
    ["Contract ID", c.id],
    ["Issued by", `${c.sentByName ?? c.agencyName} for ${c.agencyName}`],
    ["Sent", c.sentAt ? syd(c.sentAt) : "-"],
    ["Signed", syd(c.signedAt)],
    ["IP address", c.ip ?? "-"],
    ["Device", (c.agent ?? "-").slice(0, 160)],
    ["Text fingerprint (SHA-256)", c.hash],
  ];
  for (const [k, v] of rows) {
    write(k, bold, 9, muted, 0, 2);
    write(v, font, 9.5, ink, 0, 8);
  }
  return Buffer.from(await doc.save());
}
