import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { after } from "next/server";
import { PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { DocCheck } from "@/db/crm-schema";
import { fileBytes } from "@/lib/files";
import { completeJson, llmEnabled } from "@/lib/llm";
import { visaByCode } from "@/lib/visas";

// Reads an uploaded document (image, or PDF text / scanned pages) with a vision-capable model and
// compares it with the checklist item it was filed under and the client's record. The result is
// advice for the agent: nothing is changed on the case.

const Schema = z.object({
  documentType: z.string(),
  matchesItem: z.enum(["yes", "no", "unsure"]).catch("unsure"),
  readable: z.boolean(),
  nameOnDocument: z.string().nullable(),
  nameMatches: z.enum(["yes", "no", "unsure", "n/a"]).catch("unsure"),
  dateOfBirth: z.string().nullable(),
  documentNumber: z.string().nullable(),
  issueDate: z.string().nullable(),
  expiryDate: z.string().nullable(),
  language: z.string(),
  needsTranslation: z.boolean(),
  certifiedCopy: z.enum(["yes", "no", "unsure"]).catch("unsure"),
  summary: z.string(),
  issues: z.array(z.object({ level: z.enum(["block", "warn", "info"]).catch("warn"), text: z.string() })),
});

const MAX_IMAGE = 4 * 1024 * 1024;
const IMAGE = /^image\/(jpe?g|png|webp|gif)$/i;

/** What the model gets to see: page images and/or extracted text. */
export async function readDocument(bytes: Buffer, mime: string, name: string): Promise<{ text: string | null; images: string[] } | { unsupported: string }> {
  const type = mime || (/\.pdf$/i.test(name) ? "application/pdf" : /\.png$/i.test(name) ? "image/png" : /\.jpe?g$/i.test(name) ? "image/jpeg" : "");
  if (/heic|heif/i.test(type) || /\.hei[cf]$/i.test(name)) return { unsupported: "HEIC photos can't be read yet. Ask for a JPG or PDF." };
  if (IMAGE.test(type)) {
    if (bytes.byteLength > MAX_IMAGE) return { unsupported: "This image is over 4 MB, too large to check." };
    return { text: null, images: [`data:${type.replace("jpg", "jpeg")};base64,${bytes.toString("base64")}`] };
  }
  if (type === "application/pdf") {
    let text = "";
    try {
      const { extractText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(bytes));
      text = ((await extractText(pdf, { mergePages: true })).text as string).replace(/\s+\n/g, "\n").trim();
    } catch (e) {
      console.error("pdf text", e);
    }
    // Scanned PDFs have little or no text: send the embedded page photos (JPEG) instead.
    const images: string[] = [];
    if (text.length < 200) {
      try {
        const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        const jpegs: Uint8Array[] = [];
        for (const [, obj] of doc.context.enumerateIndirectObjects()) {
          if (!(obj instanceof PDFRawStream)) continue;
          if (obj.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;
          if (String(obj.dict.get(PDFName.of("Filter"))) !== "/DCTDecode") continue;
          if (obj.contents.byteLength > 20_000 && obj.contents.byteLength < MAX_IMAGE) jpegs.push(obj.contents);
        }
        for (const j of jpegs.sort((a, b) => b.byteLength - a.byteLength).slice(0, 3)) images.push(`data:image/jpeg;base64,${Buffer.from(j).toString("base64")}`);
      } catch (e) {
        console.error("pdf images", e);
      }
    }
    if (!text && !images.length) return { unsupported: "No readable text or page images in this PDF." };
    return { text: text ? text.slice(0, 15000) : null, images };
  }
  return { unsupported: "Only PDFs and photos (JPG, PNG) can be checked." };
}

const norm = (v?: string | null) => (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Reads and checks one document; stores the result. Returns the stored row. */
export async function runDocCheck(agencyId: string, documentId: string, by?: string | null) {
  const [d] = await db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.id, documentId)));
  if (!d?.storageKey) throw new Error("Document not found.");
  const save = async (v: Partial<typeof s.documentChecks.$inferInsert>) => {
    const values = { agencyId, documentId, matterId: d.matterId, checkedBy: by ?? null, status: "done", verdict: null, result: null, error: null, model: null, ...v, updatedAt: new Date() };
    const [row] = await db.insert(s.documentChecks).values(values).onConflictDoUpdate({ target: s.documentChecks.documentId, set: values }).returning();
    return row;
  };
  const got = await fileBytes(d.storageKey).then((b) => readDocument(b, d.mimeType ?? "", d.name)).catch((e) => ({ unsupported: `Couldn't open the file (${e instanceof Error ? e.message : e}).` }));
  if ("unsupported" in got) return save({ status: "unsupported", error: got.unsupported });

  const [[item], [c], [m]] = await Promise.all([
    d.checklistItemId ? db.select().from(s.checklistItems).where(eq(s.checklistItems.id, d.checklistItemId)) : Promise.resolve([]),
    d.clientId ? db.select().from(s.clients).where(eq(s.clients.id, d.clientId)) : Promise.resolve([]),
    d.matterId ? db.select().from(s.matters).where(eq(s.matters.id, d.matterId)) : Promise.resolve([]),
  ]);
  const visa = m ? visaByCode(m.visaCode) : undefined;
  const out = await analyseDocument(got, {
    item: item ? { label: item.label, category: item.category } : null,
    category: d.category,
    application: visa ? `${visa.name} (subclass ${visa.code})` : (m?.visaCode ?? null),
    client: c ? { fullName: `${c.firstName} ${c.lastName}`, dateOfBirth: c.dateOfBirth, passportNumber: c.passportNumber, passportExpiry: c.passportExpiry, nationality: c.nationality } : null,
    fileName: d.name,
    certified: d.certified,
    translated: d.translated,
  });
  if (!out) return save({ status: "failed", error: "The AI couldn't read this document. Try again later." });
  return save({ status: "done", verdict: out.verdict, result: out.result, model: out.model });
}

type Ctx = { item: { label: string; category: string } | null; category: string | null; application: string | null; client: { fullName: string; dateOfBirth: string | null; passportNumber: string | null; passportExpiry: string | null; nationality: string | null } | null; fileName: string; certified: boolean; translated: boolean };

/** The AI read plus rule checks (dates, record mismatches). Exported for testing. */
export async function analyseDocument(got: { text: string | null; images: string[] }, x: Ctx) {
  const item = x.item;
  const c = x.client;
  const d = { translated: x.translated };
  const context = {
    today: iso(new Date()),
    expectedDocument: item ? { checklistItem: item.label, category: item.category } : { category: x.category ?? "unknown (not filed to a checklist item)" },
    application: x.application,
    clientRecord: c,
    fileName: x.fileName,
    stampedCertified: x.certified,
    alreadyTranslated: x.translated,
  };
  const system = `You check documents uploaded for an Australian visa application, for a registered migration agent.
Read the document and compare it with the expected checklist item and the client's record.
Report only what the document shows; never guess or invent values. Use null when a value isn't on the document.
Dates as YYYY-MM-DD. Names exactly as printed.
matchesItem: is this the kind of document the checklist item asks for?
nameMatches: does the person named match the client (allow different order, middle names, transliteration)? "n/a" if the document names no person.
certifiedCopy: is there a certification stamp/statement by an authorised person?
needsTranslation: true if the document is not in English and has no English translation included.
issues: short, specific, actionable problems with the document itself (e.g. "Bio page is cut off at the bottom", "Photo page is blurred", "Only page 1 of 3 included", "Missing the issuing authority's stamp"). Do NOT list name, date of birth, document number, expiry, certification or translation problems: those are checked separately from your fields.
summary: one sentence describing the document.`;
  const r = await completeJson(Schema, system, `${JSON.stringify(context, null, 1)}${got.text ? `\n\nDocument text:\n${got.text}` : ""}`, { images: got.images, timeoutMs: 120_000, maxTokens: 1500 });
  if (!r) return null;

  // Checks that don't need AI judgment, against today's date and the client record.
  const v = r.value;
  // Name, number, date, certification and translation points come from the rules below, once.
  const ruled = /passport number|document number|date of birth|\bdob\b|expir|certif|translat|\bname\b|client record|checklist item|not a /i;
  const issues = v.issues.filter((i) => !ruled.test(i.text));
  const add = (level: "block" | "warn" | "info", text: string) => !issues.some((i) => i.text.toLowerCase() === text.toLowerCase()) && issues.push({ level, text });
  if (v.matchesItem === "no") {
    // A different document altogether: comparing it with the client record would only add noise.
    issues.unshift({ level: "block", text: `This looks like ${v.documentType}, not ${item?.label ?? "what was expected"}` });
    return { verdict: "wrong_document" as const, result: { ...v, issues, verdict: "wrong_document" } as DocCheck, model: r.model };
  }
  const isPassport = /passport/i.test(`${v.documentType} ${item?.label ?? ""}`);
  if (v.expiryDate && /^\d{4}-\d{2}-\d{2}$/.test(v.expiryDate)) {
    if (v.expiryDate < context.today) add("block", `Expired on ${v.expiryDate}`);
    else if (isPassport && v.expiryDate < iso(new Date(Date.now() + 182 * 864e5))) add("warn", `Passport expires ${v.expiryDate}, within 6 months`);
  }
  if (isPassport && c?.passportNumber && v.documentNumber && norm(c.passportNumber) !== norm(v.documentNumber)) add("warn", `Passport number ${v.documentNumber} differs from the client record (${c.passportNumber})`);
  if (c?.dateOfBirth && v.dateOfBirth && /^\d{4}-\d{2}-\d{2}$/.test(v.dateOfBirth) && v.dateOfBirth !== c.dateOfBirth) add("warn", `Date of birth ${v.dateOfBirth} differs from the client record (${c.dateOfBirth})`);
  if (v.nameMatches === "no") add("warn", `Name on the document (${v.nameOnDocument ?? "?"}) doesn't match ${c?.fullName ?? "the client"}`);
  if (v.needsTranslation && !d.translated) add("warn", `In ${v.language}: needs an English translation by an accredited translator`);
  if (!v.readable) add("block", "Hard to read: ask for a clearer copy");
  const verdict: DocCheck["verdict"] = issues.some((i) => i.level !== "info") ? "needs_attention" : "looks_good";
  return { verdict, result: { ...v, issues, verdict } as DocCheck, model: r.model };
}

/** After an upload: check new documents in the background when the agency has turned this on. */
export async function queueDocChecks(agencyId: string, documentIds: string[]) {
  if (!documentIds.length || !llmEnabled()) return;
  const [p] = await db.select({ on: s.agencyProfile.aiDocsEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  if (!p?.on) return;
  const docs = await db.select({ id: s.documents.id }).from(s.documents).where(and(eq(s.documents.agencyId, agencyId), inArray(s.documents.id, documentIds)));
  const run = async () => {
    for (const x of docs) await runDocCheck(agencyId, x.id).catch((e) => console.error("doc check", x.id, e));
    const { revalidateTag } = await import("next/cache");
    const { agencyTag } = await import("@/lib/data");
    revalidateTag(agencyTag(agencyId), { expire: 0 });
  };
  try {
    after(run);
  } catch {
    void run();
  }
}
