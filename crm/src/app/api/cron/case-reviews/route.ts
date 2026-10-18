import { and, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { aiReview, gatherCase, ruleReview } from "@/lib/case-review";
import { llmEnabled } from "@/lib/llm";

// Overnight case reviews, every 10 minutes while Sydney sleeps (the worker's cron calls this between
// midnight and 6am): re-reviews active matters whose latest review is over 20 hours old, a few at a
// time, and records which critical flags are new since the last review. The dashboard shows them.
const BATCH = 12;
const AI_PER_RUN = 3;

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const cutoff = new Date(Date.now() - 20 * 3600_000);
  const active = await db
    .select({ id: s.matters.id, agencyId: s.matters.agencyId, clientId: s.matters.clientId })
    .from(s.matters)
    .where(and(notInArray(s.matters.stage, ["closed", "enquiry"]), isNotNull(s.matters.clientId)))
    .limit(2000);
  if (!active.length) return Response.json({ reviewed: 0 });
  const latest = await db
    .selectDistinctOn([s.caseReviews.matterId], { matterId: s.caseReviews.matterId, createdAt: s.caseReviews.createdAt, result: s.caseReviews.result })
    .from(s.caseReviews)
    .where(and(inArray(s.caseReviews.matterId, active.map((m) => m.id)), eq(s.caseReviews.status, "done")))
    .orderBy(s.caseReviews.matterId, desc(s.caseReviews.createdAt));
  const last = new Map(latest.map((r) => [r.matterId!, r]));
  const due = active.filter((m) => !last.get(m.id) || last.get(m.id)!.createdAt < cutoff).slice(0, BATCH);
  const aiAgencies = new Set(llmEnabled() ? (await db.select({ a: s.agencyProfile.agencyId }).from(s.agencyProfile).where(isNotNull(s.agencyProfile.aiDocsEnabledAt))).map((x) => x.a) : []);
  let ai = 0;
  let reviewed = 0;
  for (const m of due) {
    try {
      const g = await gatherCase(m.agencyId, m.clientId, m.id);
      let result = ruleReview(g);
      let model: string | null = null;
      if (aiAgencies.has(m.agencyId) && ai < AI_PER_RUN) {
        ai++;
        ({ result, model } = await aiReview(g, result));
      }
      const before = new Set((last.get(m.id)?.result?.flags ?? []).filter((f) => f.level === "critical").map((f) => f.title));
      result.newCritical = last.get(m.id) ? result.flags.filter((f) => f.level === "critical" && !before.has(f.title)).map((f) => f.title) : [];
      await db.insert(s.caseReviews).values({ agencyId: m.agencyId, clientId: m.clientId, matterId: m.id, status: "done", result, model, requestedByName: "Overnight review", finishedAt: new Date() });
      reviewed++;
    } catch (e) {
      console.error("overnight review", m.id, e);
    }
  }
  return Response.json({ due: due.length, reviewed, ai });
}
