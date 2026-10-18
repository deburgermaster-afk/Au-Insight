import "server-only";
import { PDFDocument, PDFName, PDFTextField } from "pdf-lib";
import { z } from "zod";
import type { SignField } from "@/db/crm-schema";
import { completeJson, llmEnabled } from "@/lib/llm";
import { safe } from "@/lib/sign-pdf";

// Prefills the text fields of a PDF form (Form 956, 80, 1221, 888… when they have fillable fields)
// from the client record: name and identity fields by rule, anything else by the AI, which may only
// use the facts it's given. Fields it can't answer are left for the client.

export type ClientFacts = Record<string, string | null | undefined>;

const RULES: [RegExp, string][] = [
  [/family\s*name|surname|last\s*name/i, "familyName"],
  [/given\s*name|first\s*name|forename/i, "givenNames"],
  [/full\s*name|name\s*of\s*(the\s*)?(applicant|client|person)|^name$/i, "fullName"],
  [/date\s*of\s*birth|birth\s*date|\bdob\b/i, "dateOfBirth"],
  [/passport\s*(no|number|#)?/i, "passportNumber"],
  [/country\s*of\s*birth|birth\s*country/i, "countryOfBirth"],
  [/nationality|citizenship/i, "nationality"],
  [/e-?mail/i, "email"],
  [/mobile|phone|telephone/i, "phone"],
  [/suburb|town|city/i, "city"],
  [/\bstate\b/i, "state"],
  [/residential\s*address|home\s*address|^address/i, "address"],
  [/\bsex\b|gender/i, "gender"],
];

type Widget = { name: string; tip: string; rects: { page: number; x: number; y: number; w: number; h: number }[] };

async function textWidgets(pdf: PDFDocument): Promise<Widget[]> {
  const pages = pdf.getPages();
  const pageOf = new Map(pages.map((p, i) => [p.ref.toString(), i]));
  const out: Widget[] = [];
  for (const f of pdf.getForm().getFields()) {
    if (!(f instanceof PDFTextField) || f.getText()) continue;
    const tip = String(f.acroField.dict.get(PDFName.of("TU")) ?? "").replace(/^\(|\)$/g, "");
    const rects = f.acroField.getWidgets().flatMap((w) => {
      const pi = w.P() ? pageOf.get(w.P()!.toString()) : 0;
      const pg = pages[pi ?? 0];
      const cb = pg.getCropBox();
      const r = w.getRectangle();
      return [{ page: (pi ?? 0) + 1, x: (r.x - cb.x) / cb.width, y: 1 - (r.y - cb.y + r.height) / cb.height, w: r.width / cb.width, h: r.height / cb.height }];
    });
    out.push({ name: f.getName(), tip, rects });
  }
  return out;
}

export async function prefillPdf(bytes: Uint8Array, facts: ClientFacts, fields: SignField[]): Promise<{ bytes: Uint8Array; filled: { name: string; value: string; by: "rule" | "ai" }[]; fields: SignField[] }> {
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = pdf.getForm();
  const widgets = await textWidgets(pdf);
  const filled: { name: string; value: string; by: "rule" | "ai" }[] = [];
  const left: Widget[] = [];
  for (const w of widgets) {
    const label = `${w.name} ${w.tip}`.replace(/[_.\[\]0-9]+/g, " ");
    const key = RULES.find(([re]) => re.test(label))?.[1];
    const v = key ? facts[key] : null;
    if (v) filled.push({ name: w.name, value: v, by: "rule" });
    else left.push(w);
  }
  if (left.length && llmEnabled()) {
    const r = await completeJson(
      z.object({ values: z.array(z.object({ field: z.string(), value: z.string() })) }),
      "You prefill an Australian immigration PDF form for a registered migration agent. For each form field given, return a value ONLY if it is directly stated in the client facts (copy it exactly, dates as DD/MM/YYYY). Skip fields you can't answer from the facts, yes/no questions, declarations and anything for someone other than the client. Never guess.",
      JSON.stringify({ facts, fields: left.slice(0, 150).map((w) => ({ field: w.name, tooltip: w.tip || undefined })) }),
      { timeoutMs: 45_000, maxTokens: 2500 },
    ).catch(() => null);
    const names = new Set(left.map((w) => w.name));
    for (const x of r?.value.values ?? []) if (names.has(x.field) && x.value.trim()) filled.push({ name: x.field, value: x.value.trim().slice(0, 200), by: "ai" });
  }
  const done: Widget[] = [];
  for (const f of filled) {
    try {
      form.getTextField(f.name).setText(safe(f.value));
      done.push(widgets.find((w) => w.name === f.name)!);
    } catch (e) {
      console.error("prefill", f.name, e instanceof Error ? e.message : e);
    }
  }
  // Fields the client no longer needs to complete: those sitting on a prefilled box.
  const covered = (s: SignField) => done.some((w) => w?.rects.some((r) => r.page === s.page && Math.abs(r.x - s.x) < 0.01 && Math.abs(r.y - s.y) < 0.01));
  return { bytes: await pdf.save(), filled: filled.filter((f) => done.some((w) => w?.name === f.name)), fields: fields.filter((s) => !(s.source === "detected" && s.type !== "signature" && s.type !== "checkbox" && covered(s))) };
}
