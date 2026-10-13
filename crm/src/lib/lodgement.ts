import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { visaByCode } from "@/lib/visas";

// The lodgement pack: everything an agent re-types into ImmiAccount, laid out the way the online
// forms ask for it, plus the case's documents in checklist order with ImmiAccount-style names.
// The browser extension fills ImmiAccount pages from the same sheet. Nothing here lodges anything.

export type Field = {
  key: string;
  label: string;
  value: string | null;
  /** Labels ImmiAccount pages use for this field (matched case-insensitively by the extension). */
  match: string[];
  kind: "text" | "date" | "choice";
  required?: boolean;
};
export type SheetSection = { title: string; fields: Field[] };
export type PackDoc = { id: string; order: number; file: string; original: string; evidence: string; category: string; sizeBytes: number | null; mime: string | null; storageKey: string | null; certified: boolean; translated: boolean; issues: string[] };
export type Gap = { level: "block" | "warn"; text: string };
export type Pack = Awaited<ReturnType<typeof buildPack>>;

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** ImmiAccount date fields take "DD Mon YYYY". */
export const immiDate = (d?: string | Date | null) => {
  if (!d) return null;
  const x = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return Number.isNaN(x.getTime()) ? null : `${String(x.getUTCDate()).padStart(2, "0")} ${MON[x.getUTCMonth()]} ${x.getUTCFullYear()}`;
};

const sex = (g?: string | null) => (!g ? null : /^m/i.test(g) ? "Male" : /^f/i.test(g) ? "Female" : "Other");

// Suggested ImmiAccount attachment types, matched on the checklist category and label.
const EVIDENCE: [RegExp, string][] = [
  [/passport photo|photograph/i, "Photograph - Passport"],
  [/passport|travel document/i, "Travel Document"],
  [/national id|identity card|cnic|aadhaar/i, "National Identity Document (other than Passport)"],
  [/birth/i, "Birth or Age, Evidence of"],
  [/change of name|name change|deed poll/i, "Change of Name, Evidence of"],
  [/form 80/i, "Form 80 Personal particulars for character assessment"],
  [/form 1221/i, "Form 1221 Additional personal particulars information"],
  [/police|character|penal/i, "Character, Evidence of"],
  [/health|medical|insurance|oshc/i, "Health, Evidence of"],
  [/english|ielts|pte|toefl|oet|cambridge/i, "Language Ability - English, Evidence of"],
  [/skills assessment|skill assessment|acs|engineers australia|vetassess|tra\b|anmac|ahpra/i, "Skills Assessment, Evidence of"],
  [/invitation|nomination|ita\b/i, "Invitation/Nomination, Evidence of"],
  [/payslip|reference letter|employment|work experience|tax|superannuation|contract/i, "Work Experience, Evidence of"],
  [/degree|transcript|qualification|diploma|certificate|coe|enrolment|academic/i, "Qualifications, Evidence of"],
  [/marriage|relationship|de facto|partner|joint/i, "Relationship - Spouse, De Facto Partner, Evidence of"],
  [/financ|bank|funds|genuine student|gte|gs statement/i, "Financial Capacity, Evidence of"],
  [/sponsor/i, "Sponsorship, Evidence of"],
];
const CATEGORY_ORDER = ["Identity", "Relationship", "Character", "Health", "English", "Skills", "Employment", "Education", "Nomination", "Financial", "Sponsor", "Other"];
const ALLOWED = /\.(pdf|jpe?g|png|gif|tiff?|bmp|docx?|xlsx?|rtf|txt)$/i;
// ImmiAccount's per-file limit (5 MB) and per-application attachment limit (60).
export const IMMI_MAX_BYTES = 5 * 1024 * 1024;
export const IMMI_MAX_FILES = 60;

const ext = (name: string, mime: string | null) => name.match(/\.[a-z0-9]{2,5}$/i)?.[0].toLowerCase() ?? (mime === "application/pdf" ? ".pdf" : mime?.startsWith("image/") ? `.${mime.split("/")[1]}` : "");
const clean = (v: string) => v.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim();

export async function buildPack(agencyId: string, matterId: string) {
  const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.id, matterId)));
  if (!m) return null;
  const [[c], deps, checklist, docs, [employer], [agency]] = await Promise.all([
    db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, m.clientId))),
    db.select().from(s.dependants).where(and(eq(s.dependants.agencyId, agencyId), eq(s.dependants.clientId, m.clientId))),
    db.select().from(s.checklistItems).where(and(eq(s.checklistItems.agencyId, agencyId), eq(s.checklistItems.matterId, matterId))).orderBy(asc(s.checklistItems.sort)),
    db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.matterId, matterId))),
    m.employerId ? db.select().from(s.employers).where(eq(s.employers.id, m.employerId)) : Promise.resolve([]),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  const visa = visaByCode(m.visaCode);
  const f = (key: string, label: string, value: string | null | undefined, match: string[], kind: Field["kind"] = "text", required = false): Field => ({ key, label, value: value?.toString().trim() || null, match, kind, required });

  const sheet: SheetSection[] = [
    {
      title: "Application",
      fields: [
        f("visa", "Visa", visa ? `${visa.name} (subclass ${visa.code})` : m.visaCode, ["Visa", "Subclass"]),
        f("stream", "Stream", m.stream, ["Stream", "Application stream"], "choice"),
        f("location", "Current location", c.onshore ? "Australia" : c.nationality, ["Current location", "Where is the applicant currently located", "Current location of the applicant"], "choice", true),
        f("trn", "Transaction reference (TRN)", m.trn, ["Transaction reference number", "TRN"]),
        f("reference", "Agency reference", m.reference, ["Your reference", "Reference number", "Client reference"]),
      ],
    },
    {
      title: "Applicant",
      fields: [
        f("family", "Family name", c.lastName, ["Family name", "Surname"], "text", true),
        f("given", "Given names", c.firstName, ["Given names", "Given name(s)", "First name"], "text", true),
        f("sex", "Sex", sex(c.gender), ["Sex", "Gender"], "choice", true),
        f("dob", "Date of birth", immiDate(c.dateOfBirth), ["Date of birth"], "date", true),
        f("cob", "Country of birth", c.countryOfBirth, ["Country of birth"], "choice", true),
        f("citizenship", "Country of citizenship", c.nationality, ["Country of citizenship", "Citizenship", "Nationality"], "choice", true),
      ],
    },
    {
      title: "Passport",
      fields: [
        f("passport", "Passport number", c.passportNumber, ["Passport number", "Travel document number", "Document number"], "text", true),
        f("passportCountry", "Country of passport", c.nationality, ["Country of passport", "Issuing country", "Country of issue"], "choice", true),
        f("passportNationality", "Nationality of passport holder", c.nationality, ["Nationality of passport holder"], "choice"),
        f("passportExpiry", "Date of expiry", immiDate(c.passportExpiry), ["Date of expiry", "Expiry date"], "date", true),
      ],
    },
    {
      title: "Contact",
      fields: [
        f("email", "Email address", c.email, ["Email address", "Email"], "text", true),
        f("mobile", "Mobile phone", c.phone, ["Mobile / cell phone", "Mobile phone", "Mobile"], "text"),
        f("address", "Residential address", c.address, ["Residential address", "Address", "Street address"], "text", true),
        f("suburb", "Suburb / town", c.city, ["Suburb / town", "Suburb/Town", "Town / City", "City"], "text"),
        f("addrState", "State or province", c.state, ["State or province", "State"], "choice"),
        f("addrCountry", "Country", c.onshore ? "Australia" : c.nationality, ["Country"], "choice"),
      ],
    },
    {
      title: "Current visa",
      fields: [
        f("currentVisa", "Current visa", c.currentVisa ? `Subclass ${c.currentVisa}` : null, ["Current visa", "Visa held", "Current Australian visa"]),
        f("visaExpiry", "Visa expiry", immiDate(c.visaExpiry), ["Visa expiry date", "Date visa expires"], "date"),
        f("conditions", "Visa conditions", c.visaConditions?.join(", ") ?? null, ["Visa conditions"]),
      ],
    },
    {
      title: "Skills and English",
      fields: [
        f("occupation", "Nominated occupation", m.occupation ?? c.occupation, ["Nominated occupation", "Occupation"], "choice"),
        f("anzsco", "ANZSCO code", m.anzsco ?? c.anzsco, ["ANZSCO code", "ANZSCO"]),
        f("englishTest", "English test", c.englishTest, ["English language test", "Test type", "English test"], "choice"),
        f("englishScore", "English score", c.englishScore, ["Overall score", "Test score"]),
        f("points", "Points claimed", m.pointsClaimed?.toString() ?? null, ["Points", "Points claimed"]),
      ],
    },
    ...(employer
      ? [{ title: "Sponsor", fields: [f("employer", "Business name", employer.name, ["Business name", "Sponsor name", "Legal name of business"]), f("employerAbn", "ABN", employer.abn, ["ABN", "Australian Business Number"])] }]
      : []),
    ...deps.map((d, i) => ({
      title: `Family member ${i + 1}: ${d.relationship}`,
      fields: [
        f(`dep${i}Family`, "Family name", d.fullName.split(" ").slice(-1)[0], ["Family name"]),
        f(`dep${i}Given`, "Given names", d.fullName.split(" ").slice(0, -1).join(" "), ["Given names"]),
        f(`dep${i}Rel`, "Relationship to main applicant", d.relationship, ["Relationship to the main applicant", "Relationship"], "choice"),
        f(`dep${i}Dob`, "Date of birth", immiDate(d.dateOfBirth), ["Date of birth"], "date"),
        f(`dep${i}Passport`, "Passport number", d.passportNumber, ["Passport number"]),
      ],
    })),
    {
      title: "Registered migration agent",
      fields: [
        f("marn", "MARN", agency?.marn, ["Migration Agent Registration Number", "MARN"]),
        f("agentBusiness", "Business name", agency?.legalName, ["Business name", "Organisation name"]),
        f("agentPhone", "Business phone", agency?.phone, ["Business phone", "Office phone"]),
        f("agentEmail", "Business email", agency?.email, ["Email address"]),
      ],
    },
  ];

  // Documents: checklist order first, then anything else on the case.
  const rank = (cat?: string | null) => {
    const i = CATEGORY_ORDER.findIndex((x) => (cat ?? "").toLowerCase().startsWith(x.toLowerCase()));
    return i < 0 ? CATEGORY_ORDER.length : i;
  };
  const itemOf = new Map(checklist.map((it, i) => [it.id, { it, i }]));
  const sorted = [...docs].sort((a, b) => {
    const ia = a.checklistItemId ? itemOf.get(a.checklistItemId) : undefined;
    const ib = b.checklistItemId ? itemOf.get(b.checklistItemId) : undefined;
    const ra = ia ? rank(ia.it.category) * 1000 + ia.i : 900000 + rank(a.category);
    const rb = ib ? rank(ib.it.category) * 1000 + ib.i : 900000 + rank(b.category);
    return ra - rb || a.name.localeCompare(b.name);
  });
  const who = clean(`${c.lastName} ${c.firstName}`);
  const packDocs: PackDoc[] = sorted.map((d, i) => {
    const item = d.checklistItemId ? itemOf.get(d.checklistItemId)?.it : undefined;
    const basis = `${item?.label ?? ""} ${item?.category ?? ""} ${d.category ?? ""} ${d.name}`;
    const evidence = EVIDENCE.find(([re]) => re.test(basis))?.[1] ?? "Other, Evidence of";
    const e = ext(d.name, d.mimeType);
    const title = clean((item?.label ?? d.name.replace(/\.[^.]+$/, "")).replace(/\s*\([^)]*\)/g, "")).slice(0, 60);
    const issues: string[] = [];
    if (d.sizeBytes && d.sizeBytes > IMMI_MAX_BYTES) issues.push(`Over 5 MB (${(d.sizeBytes / 1048576).toFixed(1)} MB): compress or split before attaching`);
    if (e && !ALLOWED.test(e)) issues.push(`${e} files aren't accepted by ImmiAccount`);
    if (d.expiresAt && new Date(d.expiresAt) < new Date()) issues.push("Expired");
    if (!d.storageKey) issues.push("No file stored");
    return { id: d.id, order: i + 1, file: `${String(i + 1).padStart(2, "0")} ${title} - ${who}${e}`, original: d.name, evidence, category: item?.category ?? d.category ?? "Other", sizeBytes: d.sizeBytes, mime: d.mimeType, storageKey: d.storageKey, certified: d.certified, translated: d.translated, issues };
  });

  const gaps: Gap[] = [];
  for (const sec of sheet) for (const fl of sec.fields) if (fl.required && !fl.value) gaps.push({ level: "block", text: `${sec.title}: ${fl.label} is missing` });
  if (c.passportExpiry && new Date(c.passportExpiry) < new Date(Date.now() + 182 * 864e5)) gaps.push({ level: new Date(c.passportExpiry) < new Date() ? "block" : "warn", text: `Passport expires ${immiDate(c.passportExpiry)}` });
  const outstanding = checklist.filter((it) => it.required && !["received", "approved", "waived"].includes(it.status));
  for (const it of outstanding) gaps.push({ level: "block", text: `Checklist: ${it.label} (${it.status === "rejected" ? "rejected, needs a new copy" : it.status})` });
  if (!m.agreementSignedAt) gaps.push({ level: "warn", text: "Service agreement not marked signed" });
  if (!m.consumerGuideAt) gaps.push({ level: "warn", text: "Consumer Guide not marked as given" });
  if (packDocs.length > IMMI_MAX_FILES) gaps.push({ level: "warn", text: `${packDocs.length} documents: ImmiAccount takes up to ${IMMI_MAX_FILES} per applicant` });
  for (const d of packDocs) for (const issue of d.issues) gaps.push({ level: issue === "Expired" ? "warn" : "block", text: `${d.file}: ${issue}` });
  // AI document checks (advice): wrong documents block, other findings are worth a look.
  const aiChecks = await db.select().from(s.documentChecks).where(and(eq(s.documentChecks.agencyId, agencyId), eq(s.documentChecks.matterId, matterId)));
  for (const ck of aiChecks) {
    const d = packDocs.find((x) => x.id === ck.documentId);
    if (!d || !ck.result) continue;
    for (const i of ck.result.issues.filter((x) => x.level !== "info").slice(0, 3)) gaps.push({ level: ck.verdict === "wrong_document" || i.level === "block" ? "block" : "warn", text: `AI check, ${d.file}: ${i.text}` });
  }

  const filled = sheet.flatMap((x) => x.fields).filter((x) => x.value).length;
  const total = sheet.flatMap((x) => x.fields).length;
  const required = checklist.filter((it) => it.required);
  const ready = required.length ? Math.round(((required.length - outstanding.length) / required.length) * 100) : 100;
  return {
    matter: { id: m.id, reference: m.reference, title: m.title, stage: m.stage, visaCode: m.visaCode, visaName: visa?.name ?? m.visaCode, trn: m.trn, lodgedAt: m.lodgedAt, immiUrl: "https://online.immi.gov.au/lusc/login" },
    client: { id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email },
    sheet,
    docs: packDocs,
    gaps,
    score: { fields: { filled, total }, checklist: ready, blocking: gaps.filter((g) => g.level === "block").length },
  };
}

/** Plain-text data sheet (one line per field) for the ZIP and for copying. */
export function sheetText(p: NonNullable<Pack>) {
  const lines = [`Lodgement data sheet: ${p.client.name}`, `${p.matter.visaName} · ${p.matter.reference}`, `Prepared ${immiDate(new Date())}`, ""];
  for (const sec of p.sheet) {
    lines.push(sec.title.toUpperCase());
    for (const fl of sec.fields) lines.push(`  ${fl.label}: ${fl.value ?? "—"}`);
    lines.push("");
  }
  lines.push("DOCUMENTS (attach in this order)");
  for (const d of p.docs) lines.push(`  ${d.file}  →  ${d.evidence}`);
  return lines.join("\n");
}
