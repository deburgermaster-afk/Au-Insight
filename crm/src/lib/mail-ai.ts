import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { completeJson, llmEnabled } from "@/lib/llm";

// ── Who counts as an authority ────────────────────────────────────────────────────────────────
// Mail from these senders is about a client's case even when it doesn't come from the client.
export const AUTHORITIES: { domain: string; name: string }[] = [
  { domain: "homeaffairs.gov.au", name: "Department of Home Affairs" },
  { domain: "border.gov.au", name: "Department of Home Affairs" },
  { domain: "immi.gov.au", name: "Department of Home Affairs" },
  { domain: "mara.gov.au", name: "OMARA" },
  { domain: "art.gov.au", name: "Administrative Review Tribunal" },
  { domain: "acs.org.au", name: "ACS" },
  { domain: "engineersaustralia.org.au", name: "Engineers Australia" },
  { domain: "vetassess.com.au", name: "VETASSESS" },
  { domain: "anmac.org.au", name: "ANMAC" },
  { domain: "ahpra.gov.au", name: "AHPRA" },
  { domain: "tradesrecognitionaustralia.gov.au", name: "TRA" },
  { domain: "aitsl.edu.au", name: "AITSL" },
  { domain: "cpaaustralia.com.au", name: "CPA Australia" },
  { domain: "charteredaccountantsanz.com", name: "CA ANZ" },
  { domain: "publicaccountants.org.au", name: "IPA" },
  { domain: "naati.com.au", name: "NAATI" },
  { domain: "pearson.com", name: "Pearson PTE" },
  { domain: "ielts.org", name: "IELTS" },
  { domain: "bupamvs.com.au", name: "Bupa Medical Visa Services" },
  { domain: "nsw.gov.au", name: "NSW nomination" },
  { domain: "liveinmelbourne.vic.gov.au", name: "VIC nomination" },
  { domain: "migration.qld.gov.au", name: "QLD nomination" },
  { domain: "migration.wa.gov.au", name: "WA nomination" },
  { domain: "migration.sa.gov.au", name: "SA nomination" },
  { domain: "act.gov.au", name: "ACT nomination" },
  { domain: "migration.tas.gov.au", name: "TAS nomination" },
  { domain: "theterritory.com.au", name: "NT nomination" },
  { domain: "edu.au", name: "Education provider" },
];
export function authorityOf(address: string) {
  const domain = address.split("@")[1]?.toLowerCase() ?? "";
  return AUTHORITIES.find((a) => domain === a.domain || domain.endsWith(`.${a.domain}`)) ?? null;
}

// ── Matching an email to a client, without AI ──────────────────────────────────────────────────
type Match = { clientId: string; matterId: string | null; by: string };

export async function matchClient(agencyId: string, text: string, fromAddress?: string): Promise<Match | null> {
  const hay = text.toLowerCase();
  const [clients, matters] = await Promise.all([
    db.select({ id: s.clients.id, first: s.clients.firstName, last: s.clients.lastName, email: s.clients.email, passport: s.clients.passportNumber }).from(s.clients).where(eq(s.clients.agencyId, agencyId)),
    db.select({ id: s.matters.id, clientId: s.matters.clientId, reference: s.matters.reference, trn: s.matters.trn, stage: s.matters.stage }).from(s.matters).where(eq(s.matters.agencyId, agencyId)),
  ]);
  const byMatter = (m: (typeof matters)[number], by: string): Match => ({ clientId: m.clientId, matterId: m.id, by });
  for (const m of matters) if (m.trn && m.trn.length >= 6 && hay.includes(m.trn.toLowerCase())) return byMatter(m, "trn");
  for (const m of matters) if (hay.includes(m.reference.toLowerCase())) return byMatter(m, "reference");
  const live = (clientId: string) => matters.filter((m) => m.clientId === clientId && m.stage !== "closed").sort((a, b) => ["lodged", "rfi", "decision"].indexOf(b.stage) - ["lodged", "rfi", "decision"].indexOf(a.stage))[0]?.id ?? null;
  for (const c of clients) if (c.email && fromAddress && c.email.toLowerCase() === fromAddress.toLowerCase()) return { clientId: c.id, matterId: live(c.id), by: "email" };
  for (const c of clients) if (c.passport && c.passport.length >= 6 && hay.includes(c.passport.toLowerCase())) return { clientId: c.id, matterId: live(c.id), by: "passport" };
  const named = clients.filter((c) => new RegExp(`\\b${`${c.first} ${c.last}`.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay) || new RegExp(`\\b${`${c.last}, ${c.first}`.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay));
  if (named.length === 1) return { clientId: named[0].id, matterId: live(named[0].id), by: "name" };
  return null;
}

// ── What the AI returns ────────────────────────────────────────────────────────────────────────
const categories = ["grant", "refusal", "rfi", "acknowledgement", "health", "biometrics", "bridging", "skills_outcome", "invitation", "nomination", "offer", "coe", "payment", "client_message", "other", "unrelated"] as const;
export const InsightSchema = z.object({
  category: z.enum(categories).describe("What kind of email this is. 'unrelated' for newsletters, marketing or anything not about a client's case."),
  title: z.string().describe("Under 8 words, e.g. 'Subclass 190 visa granted'"),
  summary: z.string().describe("1-2 sentences for the migration agent"),
  facts: z
    .object({
      visa: z.string().nullable().describe("Visa subclass, e.g. '190'"),
      trn: z.string().nullable(),
      grantNumber: z.string().nullable(),
      decisionDate: z.string().nullable().describe("YYYY-MM-DD"),
      dueDate: z.string().nullable().describe("Deadline to respond or act, YYYY-MM-DD"),
      applicantName: z.string().nullable(),
      conditions: z.string().nullable().describe("Visa conditions or requirements mentioned"),
      outcome: z.string().nullable().describe("Skills assessment, nomination or application outcome in a few words"),
    })
    .describe("Only facts stated in the email; null when not stated"),
  action: z.enum(["set_stage_decision", "set_rfi_due", "create_task", "none"]).describe("The one thing the agent should do in the CRM"),
  actionLabel: z.string().nullable().describe("Button text for the action, e.g. 'Record the grant'"),
  actionDue: z.string().nullable().describe("YYYY-MM-DD for tasks and RFI deadlines"),
  confidence: z.enum(["low", "medium", "high"]),
});
export type Insight = z.infer<typeof InsightSchema>;

const SYSTEM = `You read emails received by an Australian migration agency and tell a registered migration agent what each one means for the client's case.
You never write replies. You only classify the email, pull out facts that are actually stated, and suggest one CRM action.
Grants and refusals: action set_stage_decision. Requests for more information (s56), health, biometrics or documents with a deadline: set_rfi_due with the deadline. Skills outcomes, invitations, nominations, offers, CoEs and anything else needing follow-up: create_task. Marketing and unrelated mail: category unrelated, action none.
Dates in YYYY-MM-DD. If a date is relative ("within 28 days"), compute it from the email date.`;

/**
 * Understands one stored email. Runs only when the agency has the AI mail assistant on, and the
 * email is from an authority, matches a client whose matter has AI tracking on, or force is set
 * (a person clicked "Analyse"). Returns the insight id, or null when skipped.
 */
export async function analyzeMessage(messageId: string, opts: { force?: boolean } = {}) {
  if (!llmEnabled()) return null;
  const [m] = await db.select().from(s.messages).where(eq(s.messages.id, messageId));
  if (!m) return null;
  const [agency] = await db.select({ on: s.agencyProfile.aiMailEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, m.agencyId));
  if (!agency?.on) return null;
  const [existing] = await db.select({ id: s.mailInsights.id }).from(s.mailInsights).where(eq(s.mailInsights.messageId, messageId));
  if (existing && !opts.force) return existing.id;

  const text = `${m.subject}\n${m.bodyText ?? ""}`;
  let match: Match | null = m.clientId ? { clientId: m.clientId, matterId: m.matterId, by: "email" } : await matchClient(m.agencyId, text, m.fromAddress);
  if (match && !match.matterId) match.matterId = (await matchClient(m.agencyId, text))?.matterId ?? null;
  const authority = authorityOf(m.fromAddress);
  const tracked = match
    ? (await db.select({ id: s.matters.id }).from(s.matters).where(and(eq(s.matters.clientId, match.clientId), eq(s.matters.aiTracking, true)))).length > 0
    : false;
  if (!opts.force && !authority && !tracked) return null;

  const matter = match?.matterId ? (await db.select({ visa: s.matters.visaCode, stage: s.matters.stage }).from(s.matters).where(eq(s.matters.id, match.matterId)))[0] : null;
  const prompt = [
    `From: ${m.fromName ?? ""} <${m.fromAddress}>${authority ? ` (${authority.name})` : ""}`,
    `Date: ${m.sentAt.toISOString().slice(0, 10)}`,
    `Subject: ${m.subject}`,
    m.attachments.length ? `Attachments: ${m.attachments.map((a) => a.name).join(", ")}` : null,
    matter ? `Linked case: subclass ${matter.visa}, currently at stage "${matter.stage}"` : null,
    "",
    (m.bodyText ?? "").slice(0, 12000),
  ]
    .filter((x) => x !== null)
    .join("\n");
  const r = await completeJson(InsightSchema, SYSTEM, prompt, { timeoutMs: 60_000 });
  if (!r) return null;
  const v = r.value;
  // The AI may surface identifiers (TRN, applicant name) the first pass missed; match locally again.
  if (!match) {
    const again = await matchClient(m.agencyId, [v.facts.trn, v.facts.applicantName].filter(Boolean).join(" "));
    if (again) match = { ...again, by: `ai+${again.by}` };
  }
  const due = /^\d{4}-\d{2}-\d{2}$/.test(v.actionDue ?? "") ? v.actionDue : /^\d{4}-\d{2}-\d{2}$/.test(v.facts.dueDate ?? "") ? v.facts.dueDate : null;
  const values = {
    agencyId: m.agencyId,
    messageId,
    clientId: match?.clientId ?? null,
    matterId: match?.matterId ?? null,
    category: v.category,
    title: v.title,
    summary: v.summary,
    facts: v.facts,
    action: v.category === "unrelated" ? "none" : v.action,
    actionLabel: v.actionLabel,
    actionDue: due,
    actionStatus: v.category === "unrelated" || v.action === "none" ? "dismissed" : "open",
    confidence: v.confidence,
    matchedBy: match?.by ?? null,
    model: r.model,
  };
  if (existing) await db.delete(s.mailInsights).where(eq(s.mailInsights.id, existing.id));
  const [row] = await db.insert(s.mailInsights).values(values).returning({ id: s.mailInsights.id });
  if (match && (!m.clientId || !m.matterId)) await db.update(s.messages).set({ clientId: match.clientId, matterId: m.matterId ?? match.matterId }).where(eq(s.messages.id, messageId));
  if (match && v.category !== "unrelated") {
    await db.insert(s.activities).values({ agencyId: m.agencyId, clientId: match.clientId, matterId: match.matterId, kind: "email", title: `AI: ${v.title}`, body: v.summary, actorName: authority?.name ?? m.fromName ?? m.fromAddress });
  }
  return row.id;
}

/** Latest insights for a client (open first), for the alert strip and the Emails tab. */
export async function clientInsights(agencyId: string, clientId: string) {
  return db.select().from(s.mailInsights).where(and(eq(s.mailInsights.agencyId, agencyId), eq(s.mailInsights.clientId, clientId))).orderBy(desc(s.mailInsights.createdAt));
}
