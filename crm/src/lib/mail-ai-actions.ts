"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { llmEnabled } from "@/lib/llm";
import { analyzeMessage } from "@/lib/mail-ai";
import { actionCtx, requireRole } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const audit = (ctx: { agencyId: string; userId: string; name: string }, entity: string, entityId: string, detail: unknown) =>
  db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity, entityId, detail });

/** Admin switch for the whole agency, recorded with who agreed and when. */
export async function setAiMail(on: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    if (on && !llmEnabled()) return { ok: false, error: "The AI service isn't configured on this server yet." };
    const set = on ? { aiMailEnabledAt: new Date(), aiMailEnabledBy: ctx.name } : { aiMailEnabledAt: null, aiMailEnabledBy: null };
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, ...set }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set });
    await audit(ctx, "ai_mail", ctx.agencyId, { enabled: on });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Per-matter consent asked when a case moves forward (or from the matter page). */
export async function setMatterTracking(matterId: string, on: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [m] = await db
      .update(s.matters)
      .set({ aiTracking: on, aiTrackingAt: new Date(), aiTrackingBy: ctx.name })
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)))
      .returning({ clientId: s.matters.clientId });
    if (!m) return { ok: false, error: "Matter not found." };
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m.clientId, matterId, kind: "system", title: on ? "AI email tracking turned on" : "AI email tracking declined", actorId: ctx.userId, actorName: ctx.name });
    await audit(ctx, "matter_ai_tracking", matterId, { on });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** "Analyse with AI" on a single email: an explicit, one-off request by a staff member. */
export async function analyzeNow(messageId: string): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const [m] = await db.select({ id: s.messages.id }).from(s.messages).where(and(eq(s.messages.agencyId, ctx.agencyId), eq(s.messages.id, messageId)));
    if (!m) return { ok: false, error: "Email not found." };
    const id = await analyzeMessage(messageId, { force: true });
    if (!id) return { ok: false, error: "Couldn't analyse this email. Check the AI mail assistant is on in Settings." };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

/** Applies the AI's suggestion. Nothing changes until a person clicks this. */
export async function applyInsight(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [i] = await db.select().from(s.mailInsights).where(and(eq(s.mailInsights.agencyId, ctx.agencyId), eq(s.mailInsights.id, id)));
    if (!i) return { ok: false, error: "Not found." };
    if (i.actionStatus !== "open") return { ok: false, error: "Already handled." };
    const today = new Date().toISOString().slice(0, 10);
    const facts = i.facts as Record<string, string | null>;
    if (i.action === "set_stage_decision" || i.action === "set_rfi_due") {
      if (!ctx.caps.includes("immigration")) return { ok: false, error: "Only a registered migration agent can record decisions and RFIs." };
      if (!i.matterId) return { ok: false, error: "Link this email to a matter first." };
      if (i.action === "set_stage_decision") {
        const outcome = i.category === "grant" ? "granted" : i.category === "refusal" ? "refused" : null;
        await db
          .update(s.matters)
          .set({ stage: "decision", outcome, decisionAt: /^\d{4}-\d{2}-\d{2}$/.test(facts.decisionDate ?? "") ? facts.decisionDate : today })
          .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, i.matterId)));
        await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: i.clientId, matterId: i.matterId, kind: "stage", title: `Decision recorded: ${outcome ?? "decision"}${facts.grantNumber ? ` (grant ${facts.grantNumber})` : ""}`, actorId: ctx.userId, actorName: ctx.name });
        // A refusal emailed to someone in Australia: diarise the ART deadline from the email's date.
        if (outcome === "refused") {
          const [c] = i.clientId ? await db.select({ onshore: s.clients.onshore }).from(s.clients).where(eq(s.clients.id, i.clientId)) : [];
          const [msg] = await db.select({ at: s.messages.sentAt, created: s.messages.createdAt }).from(s.messages).where(eq(s.messages.id, i.messageId));
          if (c?.onshore && msg) {
            const { saveReviewDeadline } = await import("@/lib/review");
            const date = new Date(msg.at ?? msg.created).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
            await saveReviewDeadline(ctx, i.matterId, { decision: "onshore", method: "email", date }, null, true);
          }
        }
      } else {
        await db.update(s.matters).set({ stage: "rfi", rfiDueAt: i.actionDue }).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, i.matterId)));
        await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: i.clientId, matterId: i.matterId, kind: "stage", title: `Further information requested${i.actionDue ? `, due ${i.actionDue}` : ""}`, actorId: ctx.userId, actorName: ctx.name });
      }
    } else if (i.action === "create_task") {
      await db.insert(s.tasks).values({
        agencyId: ctx.agencyId,
        title: i.actionLabel ?? i.title,
        description: i.summary,
        priority: i.category === "invitation" || i.category === "health" || i.category === "biometrics" ? "high" : "normal",
        dueAt: i.actionDue ? new Date(`${i.actionDue}T09:00:00+10:00`) : null,
        assignedTo: ctx.userId,
        clientId: i.clientId,
        matterId: i.matterId,
        createdBy: ctx.userId,
      });
    }
    await db.update(s.mailInsights).set({ actionStatus: "applied", actionBy: ctx.name }).where(eq(s.mailInsights.id, id));
    await audit(ctx, "mail_insight", id, { applied: i.action });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function dismissInsight(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    await db.update(s.mailInsights).set({ actionStatus: "dismissed", actionBy: ctx.name }).where(and(eq(s.mailInsights.agencyId, ctx.agencyId), eq(s.mailInsights.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
