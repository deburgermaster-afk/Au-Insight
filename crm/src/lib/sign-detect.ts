import "server-only";
import { PDFDocument, PDFName, PDFRef, PDFSignature, PDFCheckBox, PDFTextField, PDFArray, type PDFDict } from "pdf-lib";
import { z } from "zod";
import type { SignField } from "@/db/crm-schema";
import { completeJson, llmEnabled } from "@/lib/llm";

// Finds where the client needs to sign on an uploaded PDF:
//  1. form fields already in the PDF (signature, text and checkbox widgets);
//  2. the text layer: "Signature", "Signed", "Date", "Name", "Initials" labels and lines of
//     underscores or dots next to them;
//  3. the AI reads the labelled lines and picks the ones meant for the client (not the agent,
//     witness or sponsor), fixing types and labels, and adding any the heuristics missed.
// Coordinates are page fractions with a top-left origin, as the signing screen draws them.

type Line = { id: string; page: number; text: string; x: number; y: number; w: number; h: number };
type Cand = Omit<SignField, "id"> & { lineId?: string };

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const typeFor = (t: string): SignField["type"] | null => {
  const s = t.toLowerCase();
  if (/initial/.test(s)) return "initials";
  if (/sign(ature|ed)?\b|sign here|signatory/.test(s)) return "signature";
  if (/\bdate\b|dd\s*\/\s*mm|day of/.test(s)) return "date";
  if (/\bname\b|print(ed)? name/.test(s)) return "name";
  return null;
};
const SIZE: Record<SignField["type"], [number, number]> = { signature: [0.32, 0.055], initials: [0.11, 0.035], date: [0.2, 0.028], name: [0.34, 0.028], text: [0.34, 0.028], checkbox: [0.022, 0.016] };

async function textLines(bytes: Uint8Array) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const lines: Line[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width: number; height: number };
    const items = (content.items as Item[]).filter((i) => typeof i.str === "string" && i.str.trim());
    const rows: { y: number; parts: { x: number; w: number; h: number; s: string }[] }[] = [];
    for (const it of items) {
      const [, , c, d, e, f] = it.transform;
      const fh = Math.hypot(c, d) || it.height || 10;
      const [x, yb] = vp.convertToViewportPoint(e, f) as [number, number];
      const top = yb - fh;
      const row = rows.find((r) => Math.abs(r.y - top) < fh * 0.5);
      const part = { x, w: it.width, h: fh, s: it.str };
      if (row) row.parts.push(part);
      else rows.push({ y: top, parts: [part] });
    }
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x);
      // Split a row into segments where there's a wide gap (two columns: "Signature ____   Date ____").
      let seg: typeof r.parts = [];
      const flush = () => {
        if (!seg.length) return;
        const x0 = seg[0].x;
        const x1 = Math.max(...seg.map((s) => s.x + s.w));
        const h = Math.max(...seg.map((s) => s.h));
        lines.push({ id: `L${lines.length + 1}`, page: p, text: seg.map((s) => s.s).join(" ").replace(/\s+/g, " ").trim(), x: x0 / vp.width, y: r.y / vp.height, w: (x1 - x0) / vp.width, h: h / vp.height });
        seg = [];
      };
      for (const part of r.parts) {
        const last = seg[seg.length - 1];
        if (last && part.x - (last.x + last.w) > 40) flush();
        seg.push(part);
      }
      flush();
    }
  }
  return { lines, pages: doc.numPages };
}

/** Form widgets already in the PDF. */
async function formFields(bytes: Uint8Array): Promise<Cand[]> {
  const out: Cand[] = [];
  try {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const form = pdf.getForm();
    const pages = pdf.getPages();
    const pageOfRef = new Map<string, number>();
    pages.forEach((pg, i) => {
      const annots = pg.node.lookup(PDFName.of("Annots"));
      if (annots instanceof PDFArray) for (const a of annots.asArray()) if (a instanceof PDFRef) pageOfRef.set(a.toString(), i);
    });
    for (const f of form.getFields()) {
      const type: SignField["type"] | null = f instanceof PDFSignature ? "signature" : f instanceof PDFCheckBox ? "checkbox" : f instanceof PDFTextField ? (typeFor(f.getName()) ?? "text") : null;
      if (!type) continue;
      for (const w of f.acroField.getWidgets()) {
        const ref = pdf.context.getObjectRef(w.dict as PDFDict);
        const pi = ref ? pageOfRef.get(ref.toString()) : undefined;
        if (pi == null) continue;
        const pg = pages[pi];
        const cb = pg.getCropBox();
        const r = w.getRectangle();
        out.push({ page: pi + 1, x: clamp((r.x - cb.x) / cb.width), y: clamp(1 - (r.y - cb.y + r.height) / cb.height), w: r.width / cb.width, h: r.height / cb.height, type, label: f.getName().replace(/[_.\[\]0-9]+/g, " ").trim().slice(0, 60) || type, required: type !== "checkbox", source: "detected" });
      }
    }
  } catch (e) {
    console.error("sign-detect form", e instanceof Error ? e.message : e);
  }
  return out;
}

/** Labelled lines and blanks from the text layer. */
function heuristic(lines: Line[]): Cand[] {
  const out: Cand[] = [];
  const blank = /_{4,}|\.{8,}|…{3,}/;
  for (const l of lines) {
    const t = typeFor(l.text);
    const checkbox = /^(☐|□|\[\s?\])/.test(l.text);
    if (checkbox) {
      out.push({ page: l.page, x: l.x, y: l.y, w: SIZE.checkbox[0], h: Math.max(SIZE.checkbox[1], l.h), type: "checkbox", label: l.text.replace(/^(☐|□|\[\s?\])\s*/, "").slice(0, 80) || "Tick", required: false, source: "detected", lineId: l.id });
      continue;
    }
    if (!t && !blank.test(l.text)) continue;
    if (OTHERS.test(l.text)) continue; // someone else signs here
    const type = t ?? "text";
    const [w, h] = SIZE[type];
    const label = l.text.replace(/[_.…:]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || (type === "text" ? "Details" : type);
    // Short label with room to its right: the field goes on the same line; otherwise just below.
    const labelOnly = l.text.replace(/[_.…]+/g, "").trim();
    const room = 1 - (l.x + l.w);
    if (blank.test(l.text)) {
      // The blank is part of this line: put the field over the blank's span (roughly the right part of the line).
      const share = Math.max(0.3, (l.text.length - labelOnly.length) / Math.max(1, l.text.length));
      const bx = l.x + l.w * (1 - share);
      out.push({ page: l.page, x: bx, y: clamp(l.y + l.h - h), w: Math.max(0.12, l.w * share), h, type, label, required: type !== "text", source: "detected", lineId: l.id });
    } else if (labelOnly.length > 45 || !/:\s*$|^\W*(\w+\s){0,4}\w+\W*$/.test(labelOnly)) {
      continue; // a sentence that merely mentions "date" or "sign"
    } else if (labelOnly.length < 40 && room > w * 0.8) {
      out.push({ page: l.page, x: l.x + l.w + 0.01, y: clamp(l.y + l.h - h * 0.85), w: Math.min(w, room - 0.02), h, type, label, required: true, source: "detected", lineId: l.id });
    } else if (t) {
      out.push({ page: l.page, x: l.x, y: clamp(l.y + l.h + 0.004), w, h, type, label, required: true, source: "detected", lineId: l.id });
    }
  }
  return out;
}

/** Lines meant for someone other than the client. */
const OTHERS = /witness|agent|officer|sponsor|employer|justice of the peace|\bJP\b|translator|interpreter|office use|official use|nominator|referee|guarantor|solicitor|lawyer|pharmacist|police/i;

const overlaps = (a: Cand, b: Cand) => a.page === b.page && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

const AiSchema = z.object({
  fields: z.array(
    z.object({
      lineId: z.string(),
      type: z.enum(["signature", "initials", "date", "name", "text", "checkbox"]).catch("text"),
      label: z.string(),
      forClient: z.boolean(),
      placement: z.enum(["on", "right", "below"]).catch("on"),
    }),
  ),
});

/** AI pass: decides which labelled lines are for the client to complete. */
async function aiPick(lines: Line[], cands: Cand[], clientName: string) {
  const interesting = new Set(cands.map((c) => c.lineId).filter(Boolean));
  // Give the model the candidate lines plus nearby context, capped.
  const ctx = lines.filter((l, i) => interesting.has(l.id) || interesting.has(lines[i + 1]?.id) || interesting.has(lines[i - 1]?.id) || typeFor(l.text)).slice(0, 260);
  if (!ctx.length) return null;
  const text = ctx.map((l) => `${l.id} p${l.page} y=${l.y.toFixed(3)} x=${l.x.toFixed(2)}: ${l.text.slice(0, 140)}`).join("\n");
  const r = await completeJson(
    AiSchema,
    "You prepare PDFs for electronic signature by a migration agency's client. Given text lines from a PDF (with ids, page and position), list every place the CLIENT (the applicant or person the form is about) must sign, initial, date, print their name, tick or fill in. Mark forClient=false for places meant for someone else: the migration agent, witness, sponsor, employer, authorised officer, translator, Justice of the Peace, or office use. Use the line id where the blank or label is. placement: 'on' if the line itself contains the blank (underscores/dots), 'right' if the blank is to the right of a short label, 'below' if it is under the label.",
    `Client: ${clientName}\n\nLines:\n${text}`,
    { timeoutMs: 45_000, maxTokens: 3000 },
  );
  return r?.value.fields ?? null;
}

export async function detectSignFields(bytes: Uint8Array, opts: { clientName: string; useAi: boolean }): Promise<{ fields: SignField[]; pages: number; method: string }> {
  const [{ lines, pages }, widgets] = await Promise.all([textLines(bytes).catch(() => ({ lines: [] as Line[], pages: 1 })), formFields(bytes)]);
  let cands: Cand[] = [...widgets];
  const heur = heuristic(lines).filter((h) => !cands.some((c) => overlaps(c, h)));
  let method = widgets.length ? "form fields" : "text layout";
  if (opts.useAi && llmEnabled() && lines.length) {
    const picks = await aiPick(lines, heur, opts.clientName).catch(() => null);
    if (picks) {
      method = widgets.length ? "form fields + AI" : "AI";
      const byLine = new Map(lines.map((l) => [l.id, l]));
      const fromAi: Cand[] = [];
      for (const p of picks) {
        if (!p.forClient) continue;
        const l = byLine.get(p.lineId);
        if (!l) continue;
        const h0 = heur.find((h) => h.lineId === p.lineId);
        const [w, h] = SIZE[p.type];
        const base: Cand = h0 && h0.type !== "checkbox" ? { ...h0 } : p.placement === "below" ? { page: l.page, x: l.x, y: clamp(l.y + l.h + 0.004), w, h, type: p.type, label: p.label, required: true, source: "ai" } : p.placement === "right" ? { page: l.page, x: Math.min(l.x + l.w + 0.01, 1 - w), y: clamp(l.y + l.h - h * 0.85), w, h, type: p.type, label: p.label, required: true, source: "ai" } : { page: l.page, x: l.x + l.w * 0.35, y: clamp(l.y + l.h - h), w: Math.max(0.12, l.w * 0.6), h, type: p.type, label: p.label, required: true, source: "ai" };
        if (p.type !== base.type) {
          base.type = p.type;
          base.h = SIZE[p.type][1];
          if (p.type === "signature") base.w = Math.max(base.w, 0.22);
        }
        base.label = p.label.slice(0, 60) || base.label;
        base.source = "ai";
        base.required = p.type !== "checkbox" && p.type !== "text" ? true : base.required;
        fromAi.push(base);
      }
      cands = [...cands, ...fromAi.filter((a) => !cands.some((c) => overlaps(c, a)))];
    } else cands = [...cands, ...heur];
  } else cands = [...cands, ...heur];

  // Nothing found: a signature, name and date at the end of the last page.
  if (!cands.some((c) => c.type === "signature")) {
    const last = pages;
    method = cands.length ? `${method} + default signature` : "default placement";
    cands.push({ page: last, x: 0.1, y: 0.8, w: 0.32, h: 0.055, type: "signature", label: "Client signature", required: true, source: "manual" });
    cands.push({ page: last, x: 0.55, y: 0.826, w: 0.2, h: 0.028, type: "date", label: "Date", required: true, source: "manual" });
    cands.push({ page: last, x: 0.1, y: 0.87, w: 0.34, h: 0.028, type: "name", label: "Full name", required: true, source: "manual" });
  }
  const fields: SignField[] = cands
    .slice(0, 80)
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x)
    .map((c, i) => ({ id: `f${i + 1}`, page: c.page, type: c.type, label: c.label, required: c.required, source: c.source, x: clamp(c.x), y: clamp(c.y), w: Math.min(c.w, 1 - clamp(c.x)), h: Math.min(c.h, 1 - clamp(c.y)) }));
  return { fields, pages, method };
}
