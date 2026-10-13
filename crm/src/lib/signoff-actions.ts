"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { buildPack } from "@/lib/lodgement";
import { notifyStaff } from "@/lib/notify";
import { actionCtx, memberCtx, requireRole } from "@/lib/session";
import { packFingerprint, registeredAgents } from "@/lib/signoff";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const tomorrow9 = () => {
  const d = new Date(Date.now() + 864e5);
  return new Date(`${d.toISOString().slice(0, 10)}T09:00:00+10:00`);
};

/** Asks a registered agent to review the lodgement pack. Creates a task for them and emails them. */
export async function requestSignoff(matterId: string, reviewerId: string, note: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const pack = await buildPack(ctx.agencyId, matterId);
    if (!pack) return { ok: false, error: "Matter not found." };
    const reviewer = await memberCtx(ctx.agencyId, reviewerId);
    if (!reviewer?.registered) return { ok: false, error: "The reviewer needs a current MARN." };
    if (reviewerId === ctx.userId) {
      const agents = await registeredAgents(ctx.agencyId);
      if (agents.some((a) => a.id !== ctx.userId)) return { ok: false, error: "Ask another registered agent to review your own lodgement." };
    }
    await db.update(s.lodgementSignoffs).set({ status: "withdrawn", decidedAt: new Date() }).where(and(eq(s.lodgementSignoffs.agencyId, ctx.agencyId), eq(s.lodgementSignoffs.matterId, matterId), eq(s.lodgementSignoffs.status, "pending")));
    const blocking = pack.gaps.filter((g) => g.level === "block").length;
    const [row] = await db
      .insert(s.lodgementSignoffs)
      .values({ agencyId: ctx.agencyId, matterId, requestedBy: ctx.userId, requestedByName: ctx.name, reviewerId, reviewerName: reviewer.name, requestNote: note.trim() || null, fingerprint: packFingerprint(pack), blockingAtRequest: blocking })
      .returning({ id: s.lodgementSignoffs.id });
    const self = reviewerId === ctx.userId;
    if (!self) {
      await db.insert(s.tasks).values({ agencyId: ctx.agencyId, title: `Sign off lodgement: ${pack.matter.reference} ${pack.client.name}`, description: `Requested by ${ctx.name}.${note.trim() ? ` "${note.trim()}"` : ""} Open the lodgement pack to approve or request changes.`, priority: "high", dueAt: tomorrow9(), assignedTo: reviewerId, clientId: pack.client.id, matterId, createdBy: ctx.userId });
      await notifyStaff([reviewer.email], `Sign-off requested: ${pack.client.name} (${pack.matter.reference})`, {
        heading: `${ctx.name} asked you to sign off a lodgement`,
        lines: [`${pack.matter.visaName} for ${pack.client.name}.`, ...(note.trim() ? [`Their note: "${note.trim()}"`] : []), blocking ? `${blocking} item${blocking === 1 ? "" : "s"} still marked to fix.` : "Nothing is marked to fix."],
        cta: { label: "Review the lodgement pack", path: `/app/matters/${matterId}/lodge?tab=signoff` },
      });
    }
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: pack.client.id, matterId, kind: "note", title: self ? "Self-review started (only registered agent in the agency)" : `Sign-off requested from ${reviewer.name}`, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "lodgement_signoff", entityId: row.id, detail: { reviewerId } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** The reviewer approves (recording exactly what they saw) or sends it back with a note. */
export async function decideSignoff(id: string, decision: "approved" | "changes", note: string): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const [so] = await db.select().from(s.lodgementSignoffs).where(and(eq(s.lodgementSignoffs.agencyId, ctx.agencyId), eq(s.lodgementSignoffs.id, id)));
    if (!so || so.status !== "pending") return { ok: false, error: "This request is no longer open." };
    if (so.reviewerId !== ctx.userId) return { ok: false, error: `Only ${so.reviewerName} can decide this request.` };
    if (!ctx.registered) return { ok: false, error: "Signing off needs a current MARN." };
    if (decision === "changes" && !note.trim()) return { ok: false, error: "Say what needs changing." };
    const pack = await buildPack(ctx.agencyId, so.matterId);
    if (!pack) return { ok: false, error: "Matter not found." };
    await db.update(s.lodgementSignoffs).set({ status: decision, decisionNote: note.trim() || null, fingerprint: packFingerprint(pack), decidedAt: new Date() }).where(eq(s.lodgementSignoffs.id, id));
    await db
      .update(s.tasks)
      .set({ status: "done" })
      .where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, so.matterId), eq(s.tasks.assignedTo, ctx.userId), sql`${s.tasks.title} like 'Sign off lodgement:%'`, sql`${s.tasks.status} <> 'done'`));
    const approved = decision === "approved";
    if (so.requestedBy !== ctx.userId) {
      if (!approved)
        await db.insert(s.tasks).values({ agencyId: ctx.agencyId, title: `Changes requested: ${pack.matter.reference} ${pack.client.name}`, description: `${ctx.name}: ${note.trim()}`, priority: "high", dueAt: tomorrow9(), assignedTo: so.requestedBy, clientId: pack.client.id, matterId: so.matterId, createdBy: ctx.userId });
      const requester = await memberCtx(ctx.agencyId, so.requestedBy);
      if (requester)
        await notifyStaff([requester.email], `${approved ? "Signed off" : "Changes requested"}: ${pack.client.name} (${pack.matter.reference})`, {
          heading: approved ? `${ctx.name} signed off the lodgement` : `${ctx.name} asked for changes before lodging`,
          lines: [`${pack.matter.visaName} for ${pack.client.name}.`, ...(note.trim() ? [`"${note.trim()}"`] : []), approved ? "You can lodge now. If the data or documents change, it will need signing off again." : "Make the changes, then request sign-off again."],
          cta: { label: "Open the lodgement pack", path: `/app/matters/${so.matterId}/lodge?tab=signoff` },
        });
    }
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: pack.client.id, matterId: so.matterId, kind: "note", title: approved ? `Lodgement signed off by ${ctx.name}` : `Changes requested by ${ctx.name}`, body: note.trim() || null, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "lodgement_signoff", entityId: id, detail: { decision } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function withdrawSignoff(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [so] = await db.select().from(s.lodgementSignoffs).where(and(eq(s.lodgementSignoffs.agencyId, ctx.agencyId), eq(s.lodgementSignoffs.id, id)));
    if (!so || so.status !== "pending") return { ok: true };
    await db.update(s.lodgementSignoffs).set({ status: "withdrawn", decidedAt: new Date() }).where(eq(s.lodgementSignoffs.id, id));
    await db.update(s.tasks).set({ status: "done" }).where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, so.matterId), eq(s.tasks.assignedTo, so.reviewerId), sql`${s.tasks.title} like 'Sign off lodgement:%'`, sql`${s.tasks.status} <> 'done'`));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Owner setting: whether lodging needs a sign-off. */
export async function setRequireSignoff(on: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("owner");
    await db.update(s.agencyProfile).set({ requireSignoff: on }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agency_profile", entityId: ctx.agencyId, detail: { requireSignoff: on } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
