"use server";

import { and, eq, lt } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import { z } from "zod";
import type { CaseFlag, CaseReviewResult } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { aiReview, gatherCase, ruleReview } from "@/lib/case-review";
import { agencyTag } from "@/lib/data";
import { runDocCheck } from "@/lib/doc-check";
import { llmEnabled } from "@/lib/llm";
import { requireCap } from "@/lib/session";

// The review runs as a few short steps driven by the agent's browser (start → read each unread
// document → finish), so each request stays short on Workers and the screen can show what the AI is
// reading right now.

const MAX_DOCS = 8;
type Started = { ok: true; id: string; docs: { id: string; name: string }[]; ai: boolean } | { ok: false; error: string };

async function aiDocsOn(agencyId: string) {
  if (!llmEnabled()) return false;
  const [p] = await db.select({ on: s.agencyProfile.aiDocsEnabledAt }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  return Boolean(p?.on);
}

/** Staff: start a review. Returns the documents the AI will read first (not yet checked, or failed). */
export async function startCaseReview(clientId: string, matterId: string | null): Promise<Started> {
  try {
    const ctx = await requireCap("clients");
    const g = await gatherCase(ctx.agencyId, clientId, matterId);
    const ai = await aiDocsOn(ctx.agencyId);
    // Close stale runs (browser closed mid-review).
    await db.update(s.caseReviews).set({ status: "failed", error: "Stopped before it finished." }).where(and(eq(s.caseReviews.agencyId, ctx.agencyId), eq(s.caseReviews.clientId, clientId), eq(s.caseReviews.status, "running"), lt(s.caseReviews.createdAt, new Date(Date.now() - 10 * 60_000))));
    const [row] = await db.insert(s.caseReviews).values({ agencyId: ctx.agencyId, clientId, matterId, status: "running", stage: "Gathering the file", requestedBy: ctx.userId, requestedByName: ctx.name }).returning({ id: s.caseReviews.id });
    const docs = ai ? g.docs.filter((x) => !x.check || x.check.status === "failed").slice(0, MAX_DOCS).map((x) => ({ id: x.d.id, name: x.d.name })) : [];
    return { ok: true, id: row.id, docs, ai };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Staff: one step: the AI reads one document. */
export async function reviewReadDocument(reviewId: string, documentId: string): Promise<{ ok: boolean; verdict?: string | null; error?: string }> {
  try {
    const ctx = await requireCap("clients");
    const [r] = await db.select({ clientId: s.caseReviews.clientId }).from(s.caseReviews).where(and(eq(s.caseReviews.agencyId, ctx.agencyId), eq(s.caseReviews.id, reviewId), eq(s.caseReviews.status, "running")));
    if (!r) return { ok: false, error: "Review not running." };
    const [d] = await db.select({ name: s.documents.name, clientId: s.documents.clientId }).from(s.documents).where(and(eq(s.documents.agencyId, ctx.agencyId), eq(s.documents.id, documentId)));
    if (!d || d.clientId !== r.clientId) return { ok: false, error: "Document not found." };
    await db.update(s.caseReviews).set({ stage: `Reading ${d.name}` }).where(eq(s.caseReviews.id, reviewId));
    const row = await runDocCheck(ctx.agencyId, documentId, ctx.userId);
    return { ok: true, verdict: row.verdict };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Staff: final step: rule checks, then the AI's overall read. */
export async function finishCaseReview(reviewId: string): Promise<{ ok: true; result: CaseReviewResult } | { ok: false; error: string }> {
  const ctx = await requireCap("clients").catch(() => null);
  if (!ctx) return { ok: false, error: "Your role doesn't allow that." };
  const [r] = await db.select().from(s.caseReviews).where(and(eq(s.caseReviews.agencyId, ctx.agencyId), eq(s.caseReviews.id, reviewId)));
  if (!r) return { ok: false, error: "Review not found." };
  try {
    await db.update(s.caseReviews).set({ stage: "Weighing profile and documents" }).where(eq(s.caseReviews.id, reviewId));
    const g = await gatherCase(ctx.agencyId, r.clientId, r.matterId);
    const base = ruleReview(g);
    const { result, model } = (await aiDocsOn(ctx.agencyId)) ? await aiReview(g, base) : { result: base, model: null };
    await db.update(s.caseReviews).set({ status: "done", stage: null, result, model, finishedAt: new Date() }).where(eq(s.caseReviews.id, reviewId));
    const crit = result.flags.filter((f) => f.level === "critical").length;
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "system", title: "AI case review", body: `Profile ${result.profileScore}/100 · documents ${result.documentScore}/100 · ${crit} critical, ${result.flags.length - crit} other flags.`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await db.update(s.caseReviews).set({ status: "failed", stage: null, error: msg.slice(0, 500), finishedAt: new Date() }).where(eq(s.caseReviews.id, reviewId));
    return { ok: false, error: msg };
  }
}

const flagSchema = z.object({ level: z.enum(["critical", "warning", "info"]), area: z.string().max(60), title: z.string().max(200), detail: z.string().max(1000), fix: z.string().max(500).optional() });

/** Staff: turn an AI review flag into a task on the case (assigned to the matter's agent). */
export async function flagToTask(clientId: string, matterId: string | null, flag: CaseFlag): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const f = flagSchema.parse(flag);
    const [c] = await db.select({ id: s.clients.id, assignedTo: s.clients.assignedTo }).from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c) return { ok: false, error: "Client not found." };
    const [m] = matterId ? await db.select({ assignedTo: s.matters.assignedTo }).from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId))) : [];
    const days = f.level === "critical" ? 2 : f.level === "warning" ? 7 : 14;
    const due = new Date(Date.now() + days * 864e5);
    const [t] = await db
      .insert(s.tasks)
      .values({ agencyId: ctx.agencyId, title: (f.fix ? `${f.title}: ${f.fix}` : f.title).slice(0, 200), description: `${f.area} · from the AI case review\n\n${f.detail}${f.fix ? `\n\nFix: ${f.fix}` : ""}`, priority: f.level === "critical" ? "urgent" : f.level === "warning" ? "high" : "normal", dueAt: due, assignedTo: m?.assignedTo ?? c.assignedTo ?? ctx.userId, clientId, matterId, createdBy: ctx.userId })
      .returning({ id: s.tasks.id });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, matterId, kind: "task", title: `Task from AI review: ${f.title}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: t.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Staff: email the client asking for what a flag needs (with a portal sign-in link). */
export async function askClientAboutFlag(clientId: string, matterId: string | null, flag: CaseFlag, note: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("clients");
    const f = flagSchema.parse(flag);
    const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    if (!c?.email) return { ok: false, error: "Add the client's email first." };
    const { mailEnabled, sendMail } = await import("@/lib/mail");
    const [box] = mailEnabled() ? await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared"))) : [];
    if (!box) return { ok: false, error: "Email isn't set up for this agency yet (Settings → Email)." };
    const { createMagicLink } = await import("@/lib/client-auth");
    const url = await createMagicLink(c.id, ctx.agencyId, ctx.userId, "/client", 72 * 60);
    const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
    const ask = note.trim() || f.fix || f.title;
    await sendMail({
      agencyId: ctx.agencyId,
      from: { address: box.address, name: ctx.agencyName },
      to: [c.email],
      subject: `We need something from you: ${f.title}`.slice(0, 140),
      html: `<p>Hi ${esc(c.firstName)},</p><p>To keep your application moving, we need your help with one thing:</p><p style="padding:12px 14px;border-left:3px solid #18181b;background:#f4f4f5"><b>${esc(f.title)}</b><br/>${esc(ask)}</p><p>You can upload documents or reply in your client portal.</p><p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Open my portal</a></p><p>Thanks,<br/>${esc(ctx.name)}</p>`,
      clientId: c.id,
      matterId: matterId ?? undefined,
      footer: `Sent by ${ctx.agencyName} via Lodgely`,
    });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, matterId, kind: "email", title: `Asked the client: ${f.title}`, body: ask, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
