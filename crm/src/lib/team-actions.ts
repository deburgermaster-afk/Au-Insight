"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { agencyTag } from "@/lib/data";
import { sendInvite } from "@/lib/invite-mail";
import { type Position, positions } from "@/lib/permissions";
import { requireCap } from "@/lib/session";

/** Login level that suits each position; admins can still change it later. */
const roleFor: Record<Position, "admin" | "supervisor" | "agent" | "staff"> = {
  principal: "admin",
  migration_agent: "agent",
  education_agent: "agent",
  consultant: "staff",
  reception: "staff",
  accounts: "staff",
  hr: "admin",
};

export async function inviteStaff(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team");
    const email = String(f.get("email") ?? "").trim().toLowerCase();
    const position = String(f.get("position") ?? "consultant") as Position;
    if (!email.includes("@")) return { ok: false, error: "Enter their email." };
    if (!positions.some((p) => p.key === position)) return { ok: false, error: "Choose a position." };
    const marn = String(f.get("marn") ?? "").trim() || null;
    const [already] = await db.select({ id: s.member.id }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.user.email, email)));
    if (already) return { ok: false, error: "They're already on the team." };
    await db.update(s.invitation).set({ status: "canceled" }).where(and(eq(s.invitation.organizationId, ctx.agencyId), eq(s.invitation.email, email), eq(s.invitation.status, "pending")));
    const [inv] = await db
      .insert(s.invitation)
      .values({ id: crypto.randomUUID(), organizationId: ctx.agencyId, email, role: roleFor[position], status: "pending", expiresAt: new Date(Date.now() + 7 * 864e5), inviterId: ctx.userId })
      .returning();
    await db.insert(s.invitePositions).values({ invitationId: inv.id, agencyId: ctx.agencyId, position, marn }).onConflictDoUpdate({ target: s.invitePositions.invitationId, set: { position, marn } });
    const [org] = await db.select().from(s.organization).where(eq(s.organization.id, ctx.agencyId));
    await sendInvite({ id: inv.id, email, role: roleFor[position], organization: org, inviter: { user: { id: ctx.userId, name: ctx.name } } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "invitation", entityId: inv.id, detail: { email, position } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function cancelInvite(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team");
    await db.update(s.invitation).set({ status: "canceled" }).where(and(eq(s.invitation.organizationId, ctx.agencyId), eq(s.invitation.id, id)));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Joins the signed-in user to the agency that invited them (their email must match). */
export async function acceptInvite(id: string): Promise<ActionResult> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) return { ok: false, error: "Sign in first." };
    const [inv] = await db.select().from(s.invitation).where(eq(s.invitation.id, id));
    if (!inv || inv.status !== "pending") return { ok: false, error: "This invitation is no longer valid." };
    if (inv.expiresAt < new Date()) return { ok: false, error: "This invitation has expired. Ask for a new one." };
    if (inv.email.toLowerCase() !== session.user.email.toLowerCase()) return { ok: false, error: `This invitation is for ${inv.email}.` };
    const [m] = await db.select({ id: s.member.id }).from(s.member).where(and(eq(s.member.organizationId, inv.organizationId), eq(s.member.userId, session.user.id)));
    if (!m) await db.insert(s.member).values({ id: crypto.randomUUID(), organizationId: inv.organizationId, userId: session.user.id, role: inv.role ?? "staff", createdAt: new Date() });
    await db.update(s.invitation).set({ status: "accepted" }).where(eq(s.invitation.id, id));
    const [pos] = await db.select().from(s.invitePositions).where(eq(s.invitePositions.invitationId, id));
    const [profile] = await db.select({ id: s.staffProfiles.id }).from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, inv.organizationId), eq(s.staffProfiles.userId, session.user.id)));
    if (pos && !profile) {
      await db.insert(s.staffProfiles).values({ agencyId: inv.organizationId, userId: session.user.id, position: pos.position, marn: pos.marn, startDate: new Date().toISOString().slice(0, 10) });
    }
    await db.update(s.session).set({ activeOrganizationId: inv.organizationId }).where(eq(s.session.id, session.session.id));
    await db.insert(s.auditLog).values({ agencyId: inv.organizationId, actorId: session.user.id, actorName: session.user.name, action: "create", entity: "member", entityId: session.user.id, detail: { joined: true, via: "invitation" } });
    updateTag(agencyTag(inv.organizationId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
