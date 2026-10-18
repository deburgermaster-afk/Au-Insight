"use server";

import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { gatherCase, latestCaseReview } from "@/lib/case-review";
import { completeText, llmEnabled } from "@/lib/llm";
import { requireCap } from "@/lib/session";
import { visaByCode } from "@/lib/visas";

// "Ask this file": questions about one matter answered from its record only (client profile,
// checklist, documents and their AI checks, the latest case review, recent timeline), for the agent.

export async function askFile(matterId: string, history: { role: "user" | "assistant"; content: string }[]): Promise<{ ok: true; answer: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("clients");
    if (!llmEnabled()) return { ok: false, error: "The AI service isn't configured on this server." };
    const [p] = await db.select({ on: s.agencyProfile.aiDocsEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    if (!p?.on) return { ok: false, error: "Turn on AI document checks and drafting in Settings → AI assistant first." };
    const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    if (!m) return { ok: false, error: "Matter not found." };
    const msgs = history.filter((h) => h.content.trim()).slice(-10).map((h) => ({ role: h.role, content: h.content.slice(0, 4000) }));
    if (!msgs.length || msgs[msgs.length - 1].role !== "user") return { ok: false, error: "Ask a question." };
    const [g, review, acts] = await Promise.all([
      gatherCase(ctx.agencyId, m.clientId, m.id),
      latestCaseReview(ctx.agencyId, m.clientId, m.id),
      db.select({ at: s.activities.createdAt, title: s.activities.title, body: s.activities.body }).from(s.activities).where(and(eq(s.activities.agencyId, ctx.agencyId), eq(s.activities.matterId, m.id))).orderBy(desc(s.activities.createdAt)).limit(25),
    ]);
    const v = visaByCode(m.visaCode);
    const c = g.client;
    const file = {
      today: new Date().toISOString().slice(0, 10),
      matter: { reference: m.reference, visa: v ? `${v.name} (subclass ${v.code})` : m.visaCode, stream: m.stream, stage: m.stage, lodgedAt: m.lodgedAt, trn: m.trn, decisionAt: m.decisionAt, outcome: m.outcome, rfiDueAt: m.rfiDueAt, reviewDueAt: m.reviewDueAt, occupation: m.occupation, anzsco: m.anzsco, pointsClaimed: m.pointsClaimed, agreementSigned: m.agreementSignedAt, consumerGuide: m.consumerGuideAt, fees: { professional: m.feeProfessional, government: m.feeGovernment }, notes: m.notes?.slice(0, 1500) },
      visaRequirements: v?.requirements,
      client: { name: `${c.firstName} ${c.lastName}`, dateOfBirth: c.dateOfBirth, nationality: c.nationality, countryOfBirth: c.countryOfBirth, passport: c.passportNumber, passportExpiry: c.passportExpiry, onshore: c.onshore, currentVisa: c.currentVisa, visaExpiry: c.visaExpiry, visaConditions: c.visaConditions, english: [c.englishTest, c.englishScore].filter(Boolean).join(" "), occupation: c.occupation, email: c.email, phone: c.phone, notes: c.notes?.slice(0, 1500) },
      family: g.deps.map((d) => ({ name: d.fullName, relationship: d.relationship, dateOfBirth: d.dateOfBirth })),
      checklist: g.items.map((i) => ({ item: i.label, category: i.category, required: i.required, status: i.status, note: i.note })),
      documents: g.docs.slice(0, 60).map(({ d, check }) => ({ name: d.name, category: d.category, uploaded: d.createdAt.toISOString().slice(0, 10), aiCheck: check?.result ? { type: check.result.documentType, verdict: check.result.verdict, summary: check.result.summary, nameOnDocument: check.result.nameOnDocument, expiry: check.result.expiryDate, issues: check.result.issues.map((x) => x.text) } : null })),
      awaitingSignature: g.signs,
      latestReview: review?.result ? { at: review.finishedAt, profileScore: review.result.profileScore, documentScore: review.result.documentScore, readiness: review.result.readiness, flags: review.result.flags.slice(0, 20).map((f) => `${f.level}: ${f.title}`) } : null,
      recentTimeline: acts.map((a) => `${a.at.toISOString().slice(0, 10)} ${a.title}${a.body ? `: ${a.body.slice(0, 160)}` : ""}`),
    };
    const system = `You are an assistant for an Australian registered migration agent, answering questions about ONE client file. Answer only from the file below; if the file doesn't say, say so plainly and suggest how to find out. Be brief and practical: short paragraphs or bullet points, dates as d Mon yyyy. When you cite a document or checklist item, name it. Never invent facts, legal provisions or processing times. If asked to draft (an email, a cover letter paragraph, a response), draft it in plain Australian English for the agent to review.

THE FILE (JSON):
${JSON.stringify(file)}`;
    const r = await completeText(system, msgs, { timeoutMs: 60_000, maxTokens: 1400 });
    if (!r) return { ok: false, error: "The AI didn't answer. Try again in a moment." };
    return { ok: true, answer: r.text };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
