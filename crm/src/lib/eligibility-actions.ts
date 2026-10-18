"use server";

import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { EligResult } from "@/lib/eligibility";
import { completeText } from "@/lib/llm";
import { newsFor } from "@/lib/news";
import { requireCap } from "@/lib/session";
import { visaByCode } from "@/lib/visas";

/** Plain-English explanation of an eligibility result, with next steps and recent changes that apply. */
export async function explainEligibility(clientId: string, result: EligResult): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("clients");
    const [c] = await db.select({ firstName: s.clients.firstName }).from(s.clients).where(and(eq(s.clients.id, clientId), eq(s.clients.agencyId, ctx.agencyId)));
    if (!c) return { ok: false, error: "Client not found." };
    const v = visaByCode(result.code);
    const news = newsFor(result.code).map((n) => `- ${n.title} (${n.status}${n.effective ? `, from ${n.effective}` : ""}): ${n.summary}`);
    const lines = result.checks.map((x) => `- [${x.status}] ${x.label}: ${x.detail}`);
    const out = await completeText(
      "You are a senior Australian registered migration agent reviewing a screening result for a colleague. Be concise and practical: 4-7 short bullet points, then one line 'Next step:'. Say what blocks the visa, what is still unknown and how to confirm it, and mention any recent change listed that affects it. Don't invent criteria not shown, don't give legal certainty, Australian English, no markdown headings.",
      [{ role: "user", content: `Client: ${c.firstName}. Visa: ${result.code} ${v?.name ?? ""}.\nVerdict: ${result.verdict}.${result.points ? ` Points: ${result.points.total}${result.points.complete ? "" : " (incomplete)"}.` : ""}\nChecks:\n${lines.join("\n")}\n${news.length ? `Recent changes:\n${news.join("\n")}` : ""}` }],
      { maxTokens: 500, timeoutMs: 25000 },
    );
    if (!out) return { ok: false, error: "AI isn't available right now." };
    return { ok: true, text: out.text.trim() };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
