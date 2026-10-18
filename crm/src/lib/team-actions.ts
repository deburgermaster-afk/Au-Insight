"use server";

import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { auth } from "@/lib/auth";
import { agencyTag } from "@/lib/data";
import { sendInvite } from "@/lib/invite-mail";
import { createWorkMailbox, local, workDomain } from "@/lib/mail";
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
    const roleId = String(f.get("roleId") ?? "").trim() || null;
    if (roleId) {
      const [r] = await db.select({ id: s.agencyRoles.id }).from(s.agencyRoles).where(and(eq(s.agencyRoles.agencyId, ctx.agencyId), eq(s.agencyRoles.id, roleId)));
      if (!r) return { ok: false, error: "That access role no longer exists." };
    }
    // The part before @ for their work mailbox; empty means no work address.
    const workEmail = f.get("workEmail") == null ? null : String(f.get("workEmail")).trim().toLowerCase().replace(/@.*$/, "").replace(/[^a-z0-9._-]/g, "") || null;
    const [already] = await db.select({ id: s.member.id }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.user.email, email)));
    if (already) return { ok: false, error: "They're already on the team." };
    await db.update(s.invitation).set({ status: "canceled" }).where(and(eq(s.invitation.organizationId, ctx.agencyId), eq(s.invitation.email, email), eq(s.invitation.status, "pending")));
    const [inv] = await db
      .insert(s.invitation)
      .values({ id: crypto.randomUUID(), organizationId: ctx.agencyId, email, role: roleFor[position], status: "pending", expiresAt: new Date(Date.now() + 7 * 864e5), inviterId: ctx.userId })
      .returning();
    await db.insert(s.invitePositions).values({ invitationId: inv.id, agencyId: ctx.agencyId, position, marn, roleId, workEmail }).onConflictDoUpdate({ target: s.invitePositions.invitationId, set: { position, marn, roleId, workEmail } });
    const [org] = await db.select().from(s.organization).where(eq(s.organization.id, ctx.agencyId));
    await sendInvite({ id: inv.id, email, role: roleFor[position], organization: org, inviter: { user: { id: ctx.userId, name: ctx.name } } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "invitation", entityId: inv.id, detail: { email, position, roleId, workEmail } });
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
      await db.insert(s.staffProfiles).values({ agencyId: inv.organizationId, userId: session.user.id, position: pos.position, marn: pos.marn, roleId: pos.roleId, startDate: new Date().toISOString().slice(0, 10) });
    }
    // Their work mailbox (name@agency domain), chosen when they were invited.
    if (pos?.workEmail) {
      const [org] = await db.select({ slug: s.organization.slug }).from(s.organization).where(eq(s.organization.id, inv.organizationId));
      if (org) await createWorkMailbox({ agencyId: inv.organizationId, slug: org.slug, userId: session.user.id, name: session.user.name, wanted: pos.workEmail }).catch(() => null);
    }
    await db.update(s.session).set({ activeOrganizationId: inv.organizationId }).where(eq(s.session.id, session.session.id));
    await db.insert(s.auditLog).values({ agencyId: inv.organizationId, actorId: session.user.id, actorName: session.user.name, action: "create", entity: "member", entityId: session.user.id, detail: { joined: true, via: "invitation" } });
    updateTag(agencyTag(inv.organizationId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Admin: give an existing member a work mailbox (name@agency domain). */
export async function addWorkEmail(userId: string, wanted: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team");
    const [m] = await db.select({ name: s.user.name }).from(s.member).innerJoin(s.user, eq(s.user.id, s.member.userId)).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.userId, userId)));
    if (!m) return { ok: false, error: "Not on your team." };
    const address = await createWorkMailbox({ agencyId: ctx.agencyId, slug: ctx.agencySlug, userId, name: m.name, wanted: wanted.replace(/@.*$/, "") || null });
    if (!address) return { ok: false, error: "Email isn't set up yet. Add your domain in Settings → Email & domain." };
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "mailbox", entityId: address, detail: { for: m.name } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: address };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** What a new work address would look like (for the invite form preview). */
export async function previewWorkEmail(name: string): Promise<{ address: string | null; own: boolean }> {
  const ctx = await requireCap("team");
  const d = await workDomain(ctx.agencyId, ctx.agencySlug);
  return d ? { address: d.address(local(name) || "name"), own: d.own } : { address: null, own: false };
}
