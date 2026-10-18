import "server-only";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { CaseFlag, CaseReviewResult } from "@/db/crm-schema";
import { completeJson, llmEnabled } from "@/lib/llm";
import { visaByCode } from "@/lib/visas";

// The AI case review: a broad, brief read of a client's profile and documents for the agent.
// Rule checks (missing details, expiring passports, age limits, checklist gaps, document check
// findings, compliance) always run; the AI then weighs everything and writes the summary, extra
// flags and next steps. Nothing on the case is changed.

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysTo = (d: string) => Math.round((new Date(`${d}T00:00:00Z`).getTime() - Date.now()) / 864e5);
const ageOn = (dob: string, on = new Date()) => {
  const b = new Date(`${dob}T00:00:00Z`);
  let a = on.getUTCFullYear() - b.getUTCFullYear();
  if (on.getUTCMonth() < b.getUTCMonth() || (on.getUTCMonth() === b.getUTCMonth() && on.getUTCDate() < b.getUTCDate())) a--;
  return a;
};
const AGE_LIMIT: Record<string, [number, string]> = { "189": [45, "invitation"], "190": [45, "invitation"], "491": [45, "invitation"], "186": [45, "application (Direct Entry)"], "494": [45, "application"], "485": [35, "application (most streams)"], "417": [31, "application (35 for some countries)"], "462": [31, "application (35 for some countries)"], "476": [31, "application"] };

export async function gatherCase(agencyId: string, clientId: string, matterId: string | null) {
  const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, clientId)));
  if (!c) throw new Error("Client not found.");
  const matterRows = await db
    .select()
    .from(s.matters)
    .where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.clientId, clientId), matterId ? eq(s.matters.id, matterId) : ne(s.matters.stage, "closed")))
    .orderBy(desc(s.matters.createdAt));
  const ids = matterRows.map((m) => m.id);
  const [items, docs, deps, signs] = await Promise.all([
    ids.length ? db.select().from(s.checklistItems).where(and(eq(s.checklistItems.agencyId, agencyId), inArray(s.checklistItems.matterId, ids))) : Promise.resolve([]),
    db
      .select({ d: s.documents, check: s.documentChecks })
      .from(s.documents)
      .leftJoin(s.documentChecks, eq(s.documentChecks.documentId, s.documents.id))
      .where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.clientId, clientId)))
      .orderBy(desc(s.documents.createdAt))
      .limit(200),
    db.select().from(s.dependants).where(eq(s.dependants.clientId, clientId)),
    db.select({ title: s.signRequests.title, status: s.signRequests.status, dueAt: s.signRequests.dueAt }).from(s.signRequests).where(and(eq(s.signRequests.agencyId, agencyId), eq(s.signRequests.clientId, clientId), inArray(s.signRequests.status, ["sent", "viewed"]))),
  ]);
  const scopedDocs = matterId ? docs.filter((x) => !x.d.matterId || x.d.matterId === matterId) : docs;
  return { client: c, matters: matterRows, items, docs: scopedDocs, deps, signs };
}

type Gathered = Awaited<ReturnType<typeof gatherCase>>;

/** Rule checks and scores, without AI. */
export function ruleReview(g: Gathered): CaseReviewResult {
  const { client: c, matters, items, docs, deps, signs } = g;
  const flags: CaseFlag[] = [];
  const strengths: string[] = [];
  const missing: string[] = [];
  const flag = (level: CaseFlag["level"], area: string, title: string, detail: string, fix?: string, document?: string | null) => flags.push({ level, area, title, detail, fix, document: document ?? null });
  const codes = matters.map((m) => m.visaCode);
  const skilled = codes.some((v) => ["189", "190", "491", "186", "482", "494", "485", "476", "887", "191"].includes(v));
  const needsEnglish = skilled || codes.some((v) => ["500", "485", "CIT"].includes(v));

  // Profile completeness
  const profileChecks: [string, unknown, boolean][] = [
    ["Date of birth", c.dateOfBirth, true],
    ["Email", c.email, true],
    ["Phone", c.phone, true],
    ["Nationality", c.nationality, true],
    ["Country of birth", c.countryOfBirth, false],
    ["Passport number", c.passportNumber, true],
    ["Passport expiry", c.passportExpiry, true],
    ["Residential address", c.address, false],
    ["Current visa", c.onshore ? c.currentVisa : "n/a", Boolean(c.onshore)],
    ["Visa expiry", c.onshore ? c.visaExpiry : "n/a", Boolean(c.onshore)],
    ["Occupation / ANZSCO", skilled ? c.anzsco || c.occupation || matters.find((m) => m.anzsco || m.occupation)?.anzsco : "n/a", skilled],
    ["English test and score", needsEnglish ? c.englishTest && c.englishScore : "n/a", needsEnglish],
  ];
  const have = profileChecks.filter(([, v]) => Boolean(v)).length;
  for (const [k, v, important] of profileChecks) {
    if (v) continue;
    missing.push(k);
    if (important) flag("warning", "Profile", `${k} missing`, `The client record has no ${k.toLowerCase()}; forms, consent letters and AI checks rely on it.`, "Ask the client or fill it in from their documents.");
  }
  if (have === profileChecks.length) strengths.push("Client profile is complete.");

  // Passport and visa dates
  if (c.passportExpiry) {
    const d = daysTo(c.passportExpiry);
    if (d < 0) flag("critical", "Identity", "Passport has expired", `Expired ${-d} days ago (${c.passportExpiry}).`, "Get the new passport and update ImmiAccount and the client record.");
    else if (d < 183) flag("warning", "Identity", "Passport expires within 6 months", `Expires ${c.passportExpiry}; many visas are granted only to the passport's validity.`, "Advise renewal before lodging, or plan to update the Department after renewal.");
  }
  if (c.onshore && c.visaExpiry) {
    const d = daysTo(c.visaExpiry);
    const lodged = matters.some((m) => m.lodgedAt);
    if (d < 0 && !lodged) flag("critical", "Status", "Current visa has expired", `The client's visa expired ${-d} days ago and nothing is lodged; they may be unlawful.`, "Urgent: assess Bridging E or lodge a valid application.");
    else if (d < 45 && !lodged) flag("critical", "Status", `Current visa expires in ${d} days`, `Lodge a valid application before ${c.visaExpiry} to get a bridging visa and avoid 'no further stay' or unlawful status.`, "Prioritise lodgement or plan departure.");
    else if (d < 120 && !lodged) flag("warning", "Status", "Current visa expires soon", `Expires ${c.visaExpiry} (${d} days).`, "Plan the lodgement date with a buffer.");
  }
  if (c.visaConditions && /8503/.test(String(c.visaConditions))) flag("critical", "Status", "Condition 8503 (No Further Stay)", "Most onshore applications are barred unless the condition is waived.", "Consider a waiver request or an offshore application.");

  // Age limits
  if (c.dateOfBirth) {
    const age = ageOn(c.dateOfBirth);
    for (const m of matters) {
      const lim = AGE_LIMIT[m.visaCode];
      if (!lim) continue;
      if (age >= lim[0]) flag("critical", "Eligibility", `Over the age limit for subclass ${m.visaCode}`, `Client is ${age}; the limit is under ${lim[0]} at ${lim[1]}. Check exemptions.`, "Confirm an exemption applies or consider another pathway.");
      else if (age >= lim[0] - 1) flag("warning", "Eligibility", `Close to the age limit for subclass ${m.visaCode}`, `Client is ${age} and turns ${lim[0]} soon; the limit applies at ${lim[1]}.`, "Move quickly; check the date of the next birthday against invitation/lodgement timing.");
    }
  }

  // Checklist coverage
  const req = items.filter((i) => i.required && i.status !== "waived");
  const okItems = req.filter((i) => i.status === "received" || i.status === "approved");
  const rejected = items.filter((i) => i.status === "rejected");
  for (const i of rejected) flag("critical", i.category, `Rejected: ${i.label}`, i.note || "This checklist item was marked rejected.", "Request a replacement from the client.");
  const outstanding = req.filter((i) => i.status === "needed" || i.status === "requested");
  if (req.length && !outstanding.length && !rejected.length) strengths.push("Every required checklist item is in.");
  else if (outstanding.length) {
    const byCat = Object.entries(outstanding.reduce<Record<string, string[]>>((a, i) => ((a[i.category] ??= []).push(i.label), a), {}));
    flag(outstanding.length > 5 ? "warning" : "info", "Checklist", `${outstanding.length} required document${outstanding.length === 1 ? "" : "s"} outstanding`, byCat.map(([k, v]) => `${k}: ${v.slice(0, 3).join("; ")}${v.length > 3 ? ` (+${v.length - 3})` : ""}`).join(" · "), "Send the checklist to the client from the matter.");
    missing.push(...outstanding.slice(0, 12).map((i) => i.label));
  }

  // Document checks
  const checked = docs.filter((x) => x.check?.status === "done");
  let good = 0;
  for (const { d, check } of docs) {
    const r = check?.result;
    if (!r) continue;
    if (r.verdict === "looks_good") good++;
    if (r.verdict === "wrong_document") flag("critical", "Documents", `Wrong document: ${d.name}`, r.issues[0]?.text ?? `Looks like ${r.documentType}.`, "Ask for the right document and refile.", d.name);
    for (const i of r.issues.filter((x) => x.level !== "info").slice(0, 3)) {
      if (r.verdict === "wrong_document") break;
      flag(i.level === "block" ? "critical" : "warning", "Documents", i.text.length > 70 ? `${i.text.slice(0, 67)}…` : i.text, `${d.name}: ${r.summary}`, undefined, d.name);
    }
  }
  const unread = docs.filter((x) => !x.check || x.check.status === "failed");
  if (unread.length) flag("info", "Documents", `${unread.length} document${unread.length === 1 ? "" : "s"} not yet checked`, unread.slice(0, 4).map((x) => x.d.name).join(", "), "Press Refresh to have the AI read them.");
  const unfiled = docs.filter((x) => !x.d.checklistItemId && x.d.category !== "Signed" && x.d.category !== "Agreement");
  if (unfiled.length > 2) flag("info", "Documents", `${unfiled.length} documents not filed to a checklist item`, unfiled.slice(0, 4).map((x) => x.d.name).join(", "), "File them so coverage and checks are accurate.");
  if (checked.length && good === checked.length) strengths.push(`All ${checked.length} checked documents look good.`);

  // Compliance and deadlines
  for (const m of matters) {
    if (!m.agreementSignedAt && !["enquiry", "consultation"].includes(m.stage)) flag("warning", "Compliance", `No signed service agreement (${m.reference})`, "The Code of Conduct requires a written agreement before work starts.", "Send the agreement from the matter page.");
    if (!m.consumerGuideAt && !["enquiry"].includes(m.stage)) flag("warning", "Compliance", `Consumer Guide not recorded (${m.reference})`, "Give the OMARA Consumer Guide before giving immigration assistance.", "Send the Consumer Guide acknowledgement from E-sign.");
    if (m.rfiDueAt && !m.decisionAt) {
      const d = daysTo(m.rfiDueAt);
      flag(d <= 7 ? "critical" : "warning", "Deadlines", `Further information due ${d < 0 ? `${-d} days ago` : `in ${d} days`}`, `${m.reference}: respond by ${m.rfiDueAt}.`, "Prepare and upload the response in ImmiAccount.");
    }
    if (m.reviewDueAt && !m.reviewLodgedAt) {
      const d = daysTo(m.reviewDueAt);
      if (d >= -1) flag(d <= 7 ? "critical" : "warning", "Deadlines", `ART review deadline in ${d} days`, `${m.reference}: the Tribunal can't accept a late application.`, "Lodge the review application.");
    }
    if (m.agreementSignedAt && m.consumerGuideAt) strengths.push(`Compliance documents in place for ${m.reference}.`);
  }
  for (const sg of signs) if (sg.dueAt && daysTo(sg.dueAt) < 0) flag("warning", "Signatures", `Overdue signature: ${sg.title}`, `Was due ${sg.dueAt}.`, "Send a reminder from E-sign.");
  const partnerVisa = codes.some((v) => ["820/801", "309/100", "300"].includes(v));
  if (partnerVisa && !deps.some((d) => /partner|spouse|husband|wife|de facto/i.test(d.relationship ?? ""))) flag("info", "Profile", "Partner not recorded", "Partner visas need the sponsor/partner's details on file.", "Add the partner as a related person.");

  // Scores
  const profileScore = Math.max(0, Math.min(100, Math.round((have / profileChecks.length) * 100) - flags.filter((f) => ["Identity", "Status", "Eligibility"].includes(f.area)).reduce((t, f) => t + (f.level === "critical" ? 18 : 6), 0)));
  const coverage = req.length ? okItems.length / req.length : docs.length ? 0.5 : 0;
  const quality = checked.length ? good / checked.length : 0.7;
  const docPenalty = flags.filter((f) => f.area === "Documents" || rejected.some((r) => r.category === f.area)).reduce((t, f) => t + (f.level === "critical" ? 8 : f.level === "warning" ? 3 : 0), 0);
  const documentScore = Math.max(0, Math.min(100, Math.round(coverage * 70 + quality * 30) - docPenalty));
  const crit = flags.filter((f) => f.level === "critical").length;
  const avg = (profileScore + documentScore) / 2;
  const readiness: CaseReviewResult["readiness"] = crit ? (avg > 70 ? "needs_work" : "not_ready") : avg >= 88 ? "ready" : avg >= 70 ? "nearly_ready" : avg >= 45 ? "needs_work" : "not_ready";
  const order = { critical: 0, warning: 1, info: 2 } as const;
  return {
    profileScore,
    documentScore,
    readiness,
    summary: `${crit ? `${crit} critical issue${crit === 1 ? "" : "s"} to resolve. ` : ""}${okItems.length}/${req.length || 0} required documents in; ${checked.length} of ${docs.length} documents checked.`,
    strengths,
    flags: flags.sort((a, b) => order[a.level] - order[b.level]).slice(0, 40),
    missing: [...new Set(missing)].slice(0, 20),
    nextSteps: flags.filter((f) => f.fix && f.level !== "info").slice(0, 5).map((f) => f.fix!),
    documentsRead: checked.length,
    documentsChecked: docs.slice(0, 40).map((x) => ({ name: x.d.name, verdict: x.check?.verdict ?? null })),
  };
}

const AiSchema = z.object({
  summary: z.string(),
  profileScore: z.number().min(0).max(100),
  documentScore: z.number().min(0).max(100),
  readiness: z.enum(["not_ready", "needs_work", "nearly_ready", "ready"]).catch("needs_work"),
  strengths: z.array(z.string()).max(8),
  flags: z
    .array(
      z.object({
        level: z.enum(["critical", "warning", "info"]).catch("warning"),
        area: z.string(),
        title: z.string(),
        detail: z.string(),
        fix: z.string().optional(),
      }),
    )
    .max(12),
  nextSteps: z.array(z.string()).max(6),
});

/** AI pass over the gathered facts and rule findings. Returns the merged result. */
export async function aiReview(g: Gathered, base: CaseReviewResult): Promise<{ result: CaseReviewResult; model: string | null }> {
  if (!llmEnabled()) return { result: base, model: null };
  const c = g.client;
  const facts = {
    today: iso(new Date()),
    client: {
      age: c.dateOfBirth ? ageOn(c.dateOfBirth) : null,
      nationality: c.nationality,
      onshore: c.onshore,
      currentVisa: c.currentVisa,
      visaExpiry: c.visaExpiry,
      visaConditions: c.visaConditions,
      passportExpiry: c.passportExpiry,
      englishTest: c.englishTest,
      englishScore: c.englishScore,
      occupation: c.occupation,
      anzsco: c.anzsco,
      relatedPeople: g.deps.map((d) => ({ relationship: d.relationship, age: d.dateOfBirth ? ageOn(d.dateOfBirth) : null })),
      notes: c.notes?.slice(0, 1500) ?? null,
    },
    matters: g.matters.map((m) => {
      const v = visaByCode(m.visaCode);
      return { reference: m.reference, visa: v ? `${v.name} (${v.code})` : m.visaCode, requirements: v?.requirements, stream: m.stream, stage: m.stage, lodgedAt: m.lodgedAt, pointsClaimed: m.pointsClaimed, occupation: m.occupation, anzsco: m.anzsco, rfiDueAt: m.rfiDueAt, notes: m.notes?.slice(0, 800) ?? null };
    }),
    checklist: g.items.map((i) => ({ item: i.label, category: i.category, required: i.required, status: i.status })),
    documents: g.docs.slice(0, 60).map(({ d, check }) => ({ name: d.name, category: d.category, filedAs: g.items.find((i) => i.id === d.checklistItemId)?.label ?? null, certified: d.certified, translated: d.translated, check: check?.result ? { type: check.result.documentType, verdict: check.result.verdict, summary: check.result.summary, expiry: check.result.expiryDate, issues: check.result.issues.map((x) => x.text) } : check?.status ?? "not checked" })),
    ruleFindings: base.flags.map((f) => `${f.level}: ${f.title}`),
    ruleScores: { profile: base.profileScore, documents: base.documentScore },
  };
  const r = await completeJson(
    AiSchema,
    `You are a senior Australian registered migration agent reviewing a client file for a colleague. Be broad but brief.
Assess (1) profile strength: eligibility against the visa requirements given (age, English, occupation, points, status, character/health risks visible in the file), and (2) document strength: coverage of the checklist and the quality of what's been checked.
flags: ONLY problems NOT already in ruleFindings — inconsistencies across documents (names, dates, employment periods, relationship timeline), eligibility risks, missing evidence for claims, things a case officer would query. Each flag: short title (max 9 words), one-sentence detail, one-sentence fix. Never invent facts; reason only from the data.
strengths: up to 4 short points. nextSteps: up to 5 concrete actions in priority order.
Scores: start from ruleScores and adjust by at most 15 points with reason in your summary. summary: 2 sentences max.`,
    JSON.stringify(facts),
    { timeoutMs: 75_000, maxTokens: 2500 },
  );
  if (!r) return { result: base, model: null };
  const v = r.value;
  const clampAdj = (ai: number, rule: number) => Math.round(Math.max(rule - 15, Math.min(rule + 15, ai)));
  const seen = new Set(base.flags.map((f) => f.title.toLowerCase()));
  const extra: CaseFlag[] = v.flags.filter((f) => !seen.has(f.title.toLowerCase())).map((f) => ({ ...f, area: f.area.slice(0, 30), document: null, source: "ai" as const }));
  const order = { critical: 0, warning: 1, info: 2 } as const;
  const hasCritical = [...base.flags, ...extra].some((f) => f.level === "critical");
  return {
    model: r.model,
    result: {
      ...base,
      profileScore: clampAdj(v.profileScore, base.profileScore),
      documentScore: clampAdj(v.documentScore, base.documentScore),
      readiness: hasCritical && v.readiness === "ready" ? "needs_work" : v.readiness,
      summary: v.summary,
      strengths: [...new Set([...base.strengths, ...v.strengths])].slice(0, 6),
      flags: [...base.flags, ...extra].sort((a, b) => order[a.level] - order[b.level]).slice(0, 45),
      nextSteps: v.nextSteps.length ? v.nextSteps : base.nextSteps,
    },
  };
}

/** The latest finished review for a client (and matter, when given). */
export async function latestCaseReview(agencyId: string, clientId: string, matterId: string | null) {
  const [row] = await db
    .select()
    .from(s.caseReviews)
    .where(and(eq(s.caseReviews.agencyId, agencyId), eq(s.caseReviews.clientId, clientId), matterId ? eq(s.caseReviews.matterId, matterId) : isNull(s.caseReviews.matterId), eq(s.caseReviews.status, "done")))
    .orderBy(desc(s.caseReviews.createdAt))
    .limit(1);
  return row ?? null;
}
