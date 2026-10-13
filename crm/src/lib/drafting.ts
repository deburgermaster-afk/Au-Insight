import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { completeJson } from "@/lib/llm";
import { visaByCode } from "@/lib/visas";

// AI drafting for registered migration agents. Drafts are written from the case file only; anything
// the file doesn't say becomes a [[placeholder]] instead of an invented fact. The agent edits and
// takes responsibility for every word before it's used.

export const DRAFT_KINDS = {
  cover_letter: { title: "Cover letter to the Department", blurb: "Introduces the application and lists the evidence attached, in order." },
  submission: { title: "Submission on the visa criteria", blurb: "Addresses each criterion with the evidence that meets it." },
  gs_statement: { title: "Genuine Student statement (client draft)", blurb: "A first-person outline for the client to rewrite in their own words." },
  s56_response: { title: "Response to a request for information", blurb: "Answers the Department's request point by point, with the documents provided." },
  employer_reference: { title: "Employment reference template", blurb: "What the employer's reference letter must state, ready to send to them." },
} as const;
export type DraftKind = keyof typeof DRAFT_KINDS;

/** Which drafts make sense for this matter. */
export function kindsFor(visaCode: string, stage: string, hasRfi: boolean): DraftKind[] {
  const v = visaByCode(visaCode);
  const out: DraftKind[] = ["cover_letter", "submission"];
  if (v?.category === "Student" || ["500", "590"].includes(visaCode)) out.push("gs_statement");
  if (hasRfi || stage === "rfi") out.push("s56_response");
  if (!v || ["Skilled", "Employer", "Graduate"].includes(v.category)) out.push("employer_reference");
  return out;
}

const Schema = z.object({
  title: z.string(),
  body: z.string().describe("The draft. Plain text; headings on their own line starting with '## '. Use [[double brackets]] for anything to fill in."),
  checks: z.array(z.string()).describe("Things the agent must verify or add before using this draft."),
});

const GUIDE: Record<DraftKind, string> = {
  cover_letter:
    "A formal cover letter from the registered migration agent to the Department of Home Affairs: agent and client details, the visa and stream, a short statement of what is being applied for, then an 'Evidence provided' index listing the documents on file in checklist order (use their names), noting anything still to come. Close with the agent's signature block including the MARN.",
  submission:
    "A legal-style submission by the registered migration agent addressing each criterion of the visa in turn (use the requirements listed), stating how the applicant meets it and citing the specific documents on file as evidence. Where evidence is missing, say so in a [[placeholder]] rather than claiming it. No guarantees of outcome.",
  gs_statement:
    "A first-person Genuine Student statement OUTLINE for the client to rewrite in their own words (the Department expects the applicant's own words). Cover: their circumstances and ties at home, study and work history, why this course and provider, why Australia rather than home or another country, how the course fits their career, and their plans after study. Use only facts from the file; leave clear [[prompts]] for the client to complete. Begin with a note that this is a guide to be rewritten by the student.",
  s56_response:
    "A response from the registered migration agent to the Department's request for further information. Quote or summarise each item requested (from the request details), answer each one, and list the documents provided for it. If the request details are missing, use [[placeholders]] for the items. Include the TRN and response due date if known.",
  employer_reference:
    "A template employment reference letter for the client's employer to put on company letterhead and sign: it must state the employer's details and ABN or registration, the employee's full name, position title, dates of employment, hours per week, salary, and a list of duties that reflect the nominated occupation (ANZSCO). Include a short covering note to the employer explaining what's needed.",
};

/** Builds the case context and asks the model for a draft. */
export async function generateDraft(agencyId: string, matterId: string, kind: DraftKind, instructions: string, author: string) {
  const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.id, matterId)));
  if (!m) throw new Error("Matter not found.");
  const [[c], [p], [org], checklist, docs, checks, insights, studies, [employer]] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.id, m.clientId)),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
    db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, agencyId)),
    db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, matterId)).orderBy(s.checklistItems.sort),
    db.select().from(s.documents).where(and(eq(s.documents.agencyId, agencyId), eq(s.documents.matterId, matterId))),
    db.select().from(s.documentChecks).where(and(eq(s.documentChecks.agencyId, agencyId), eq(s.documentChecks.matterId, matterId))),
    db.select().from(s.mailInsights).where(and(eq(s.mailInsights.agencyId, agencyId), eq(s.mailInsights.matterId, matterId))).orderBy(desc(s.mailInsights.createdAt)).limit(5),
    db.select({ course: s.studentApplications.course, intake: s.studentApplications.intake, status: s.studentApplications.status, institution: s.institutions.name }).from(s.studentApplications).leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId)).where(eq(s.studentApplications.clientId, m.clientId)),
    m.employerId ? db.select().from(s.employers).where(eq(s.employers.id, m.employerId)) : Promise.resolve([]),
  ]);
  let agent = { name: p?.legalName ?? org?.name ?? "", marn: p?.marn ?? null };
  if (m.assignedTo) {
    const [u] = await db.select({ name: s.user.name, marn: s.staffProfiles.marn }).from(s.user).leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.user.id), eq(s.staffProfiles.agencyId, agencyId))).where(eq(s.user.id, m.assignedTo));
    if (u?.marn) agent = { name: u.name, marn: u.marn };
  }
  const visa = visaByCode(m.visaCode);
  const checkOf = new Map(checks.map((x) => [x.documentId, x]));
  const context = {
    today: new Date().toISOString().slice(0, 10),
    agency: { name: p?.legalName ?? org?.name, abn: p?.abn, phone: p?.phone, email: p?.email, address: p?.address },
    agent,
    client: { name: `${c.firstName} ${c.lastName}`, dateOfBirth: c.dateOfBirth, nationality: c.nationality, countryOfBirth: c.countryOfBirth, inAustralia: c.onshore, currentVisa: c.currentVisa, visaExpiry: c.visaExpiry, occupation: c.occupation, anzsco: c.anzsco, englishTest: c.englishTest, englishScore: c.englishScore, notes: c.notes },
    application: { reference: m.reference, trn: m.trn, visa: visa ? `${visa.name} (subclass ${visa.code})` : m.visaCode, stream: m.stream, requirements: visa?.requirements ?? [], occupation: m.occupation, anzsco: m.anzsco, pointsClaimed: m.pointsClaimed, rfiDue: m.rfiDueAt, notes: m.notes },
    sponsor: employer ? { name: employer.name, abn: employer.abn, industry: employer.industry } : null,
    studies: studies.length ? studies : null,
    checklist: checklist.map((i) => ({ item: i.label, category: i.category, status: i.status })),
    documentsOnFile: docs.map((d) => {
      const ck = checkOf.get(d.id)?.result;
      return { name: d.name, category: d.category, ...(ck ? { reads: ck.summary, aiConcerns: ck.issues.map((x) => x.text) } : {}) };
    }),
    departmentCorrespondence: insights.map((i) => ({ category: i.category, title: i.title, summary: i.summary, facts: i.facts, due: i.actionDue })),
  };
  const system = `You draft documents for an Australian registered migration agent. Write in formal Australian English.
Use ONLY facts in the case file below. Never invent names, dates, numbers, employers, courses or evidence: write [[what to add]] instead.
Do not promise outcomes. Do not include the client's passport number or date of birth unless the document needs them.
Task: ${GUIDE[kind]}`;
  const r = await completeJson(Schema, system, `Case file:\n${JSON.stringify(context, null, 1)}${instructions.trim() ? `\n\nAgent's instructions: ${instructions.trim()}` : ""}`, { timeoutMs: 150_000, maxTokens: 5000 });
  if (!r) throw new Error("The AI couldn't write this draft just now. Try again in a minute.");
  return { ...r.value, model: r.model, author };
}
