import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { consentTemplates } from "@/lib/consent-templates";
import { completeJson, llmEnabled } from "@/lib/llm";
import { visaByCode } from "@/lib/visas";

// Which consent forms this case needs now. Rules over the case (stage, visa, compliance gaps,
// checklist gaps, ages, forms already signed or out for signature) pick the candidates; the AI then
// orders them and writes a one-line reason each. Without AI, the rule order and reasons are used.

export type TemplatePick = { key: string; reason: string };

const age = (dob: string | null) => {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  const n = new Date();
  return n.getUTCFullYear() - b.getUTCFullYear() - (n < new Date(Date.UTC(n.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())) ? 1 : 0);
};

export async function recommendFor(agencyId: string, clientId: string, matterId: string | null): Promise<{ picks: TemplatePick[]; done: string[]; method: "ai" | "rules" }> {
  const [[c], matters, deps, signs] = await Promise.all([
    db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, clientId))),
    db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.clientId, clientId))),
    db.select({ dob: s.dependants.dateOfBirth, rel: s.dependants.relationship }).from(s.dependants).where(eq(s.dependants.clientId, clientId)),
    db.select({ key: s.signRequests.templateKey, status: s.signRequests.status, matterId: s.signRequests.matterId }).from(s.signRequests).where(and(eq(s.signRequests.agencyId, agencyId), eq(s.signRequests.clientId, clientId), inArray(s.signRequests.status, ["sent", "viewed", "signed"]))),
  ]);
  if (!c) return { picks: [], done: [], method: "rules" };
  const m = matterId ? matters.find((x) => x.id === matterId) : (matters.find((x) => x.stage !== "closed") ?? matters[0]);
  const items = m ? await db.select({ category: s.checklistItems.category, status: s.checklistItems.status }).from(s.checklistItems).where(eq(s.checklistItems.matterId, m.id)) : [];
  const outstanding = (cat: RegExp) => items.some((i) => cat.test(i.category) && (i.status === "needed" || i.status === "requested"));
  // Forms already signed (for this matter, or client-wide ones) or waiting on the client.
  const clientWide = new Set(["privacy", "electronic-communication", "id-verification", "health-info", "marketing", "interpreter"]);
  const done = [...new Set(signs.filter((x) => x.key && (clientWide.has(x.key) || !m || x.matterId === m.id)).map((x) => x.key!))];

  const out = new Map<string, string>();
  const add = (key: string, reason: string) => !out.has(key) && !done.includes(key) && out.set(key, reason);
  const stage = m?.stage ?? "enquiry";
  const early = ["enquiry", "consultation", "engaged", "documents"].includes(stage);
  if (m && !m.consumerGuideAt) add("consumer-guide", "No Consumer Guide recorded yet: required before giving immigration assistance.");
  if (early) {
    add("authority-to-act", "Appoints the agent and authorises correspondence (pairs with Form 956).");
    add("privacy", "Consent to collect sensitive information before documents come in.");
    if (m && (m.feeProfessional || m.feeGovernment)) add("fee-estimate", "Fees are quoted on this matter; records the client's acknowledgement.");
    add("electronic-communication", "Lets you send notices and documents by email and the portal.");
    add("client-account", "Needed before taking money in advance into the client account.");
  }
  const v = m ? visaByCode(m.visaCode) : undefined;
  for (const t of consentTemplates) if (m && t.suggestFor?.includes(m.visaCode)) add(t.key, `Commonly needed for ${v ? `subclass ${v.code}` : m.visaCode} cases.`);
  if (outstanding(/character/i)) add("police-check", "Police certificates are still outstanding on the checklist.");
  if (outstanding(/skills/i)) add("skills-assessment", "The skills assessment is still outstanding.");
  if (outstanding(/health/i)) add("health-info", "Health examinations are still to be done.");
  const a = age(c.dateOfBirth);
  if ((a != null && a < 18) || deps.some((d) => (age(d.dob) ?? 99) < 18)) add("minor-consent", "A child under 18 is the applicant or included in the application.");
  if (stage === "ready") {
    add("pre-lodgement", "The case is ready to lodge: client sign-off on the final application.");
    add("declaration-accuracy", "Client declaration of complete and truthful information before lodging.");
  }
  if (m?.outcome === "refused" || m?.outcome === "cancelled" || m?.reviewDueAt) add("art-review", "Refused or cancelled decision with a Tribunal review window.");
  if (stage === "closed") {
    add("termination", "The matter is closed: records the end of services and final account.");
    add("documents-receipt", "Confirms original documents were returned.");
  }
  if (c.notes && /interpreter|translat/i.test(c.notes)) add("interpreter", "Client notes mention an interpreter or translation.");
  if (m && /sponsor|employer/i.test(`${m.notes ?? ""}`) && !m.employerId) add("conflict", "Notes mention a sponsor or employer you may also act for.");
  let picks: TemplatePick[] = [...out].map(([key, reason]) => ({ key, reason }));

  if (llmEnabled() && picks.length > 1) {
    const r = await completeJson(
      z.object({ picks: z.array(z.object({ key: z.string(), reason: z.string() })).max(8) }),
      "You help an Australian registered migration agent choose which client consent forms to send now. From the candidate forms given, return the ones this case needs now, most urgent first (at most 6), each with a reason of at most 16 words specific to this case. Only use keys from the candidates.",
      JSON.stringify({
        case: m ? { visa: v ? `${v.name} (${v.code})` : m.visaCode, stage, lodged: Boolean(m.lodgedAt), outcome: m.outcome, consumerGuideGiven: Boolean(m.consumerGuideAt), agreementSigned: Boolean(m.agreementSignedAt), employerSponsored: Boolean(m.employerId) } : null,
        client: { age: a, onshore: c.onshore, nationality: c.nationality, children: deps.filter((d) => (age(d.dob) ?? 99) < 18).length },
        alreadySignedOrSent: done,
        candidates: picks.map((p) => ({ key: p.key, title: consentTemplates.find((t) => t.key === p.key)?.title, ruleReason: p.reason })),
      }),
      { timeoutMs: 20_000, maxTokens: 800 },
    ).catch(() => null);
    const valid = r?.value.picks.filter((p) => out.has(p.key));
    if (valid?.length) {
      picks = [...valid.map((p) => ({ key: p.key, reason: p.reason.slice(0, 140) })), ...picks.filter((p) => !valid.some((x) => x.key === p.key))].slice(0, 8);
      return { picks, done, method: "ai" };
    }
  }
  return { picks: picks.slice(0, 8), done, method: "rules" };
}
