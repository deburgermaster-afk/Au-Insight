import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

import { type Cap, capsFor, marnCurrent, type Position, type Role } from "@/lib/permissions";

export type { Role };

export type Ctx = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  role: Role;
  position: Position;
  caps: Cap[];
  /** Holds a current MARN (may give immigration assistance). */
  registered: boolean;
};

/** The signed-in user, their agency and role; resolved once per request, however many callers. */
export const getCtx: () => Promise<Ctx> = cache(() => resolveCtx());

/** The same, read fresh: for server actions and route handlers, which must authorise themselves. */
export async function actionCtx(): Promise<Ctx> {
  return resolveCtx();
}

async function resolveCtx(): Promise<Ctx> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/sign-in");
  const memberships = await db
    .select({
      agencyId: schema.member.organizationId,
      role: schema.member.role,
      name: schema.organization.name,
      slug: schema.organization.slug,
    })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .where(eq(schema.member.userId, session.user.id))
    .orderBy(asc(schema.member.createdAt));
  const active = memberships.find((m) => m.agencyId === session.session.activeOrganizationId) ?? memberships[0];
  if (!active) redirect("/onboarding");
  const role = active.role as Role;
  let [profile] = await db
    .select()
    .from(schema.staffProfiles)
    .where(and(eq(schema.staffProfiles.agencyId, active.agencyId), eq(schema.staffProfiles.userId, session.user.id)));
  if (!profile) {
    const position: Position = role === "owner" || role === "admin" ? "principal" : role === "agent" ? "migration_agent" : "consultant";
    const [agencyProfile] = position === "principal" ? await db.select({ marn: schema.agencyProfile.marn }).from(schema.agencyProfile).where(eq(schema.agencyProfile.agencyId, active.agencyId)) : [];
    [profile] = await db
      .insert(schema.staffProfiles)
      .values({ agencyId: active.agencyId, userId: session.user.id, position, marn: agencyProfile?.marn ?? null, title: position === "principal" ? "Principal" : null })
      .returning();
  }
  const position = profile.position as Position;
  const registered = (position === "principal" || position === "migration_agent") && marnCurrent(profile.marn, profile.marnExpiry);
  const caps = capsFor(role, position).filter((c) => c !== "immigration" || registered);
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    agencyId: active.agencyId,
    agencyName: active.name,
    agencySlug: active.slug,
    role,
    position,
    caps,
    registered,
  };
}

const rank: Record<Role, number> = { client: 0, staff: 1, agent: 2, supervisor: 3, admin: 4, owner: 5 };

/** Throws unless the user has a capability. Use in server actions. */
export async function requireCap(cap: Cap, message?: string): Promise<Ctx> {
  const ctx = await actionCtx();
  if (!ctx.caps.includes(cap)) throw new Error(message ?? "Your role doesn't allow that.");
  return ctx;
}

/** Throws unless the user's role is at least [min]. Use in server actions. */
export async function requireRole(min: Role): Promise<Ctx> {
  const ctx = await actionCtx();
  if (rank[ctx.role] < rank[min]) throw new Error("You don't have permission to do that.");
  return ctx;
}

export function canAtLeast(role: Role, min: Role) {
  return rank[role] >= rank[min];
}

/** For server actions: the membership check without the private cache. */
export async function memberOf(agencyId: string, userId: string) {
  const [m] = await db
    .select()
    .from(schema.member)
    .where(and(eq(schema.member.organizationId, agencyId), eq(schema.member.userId, userId)));
  return m ?? null;
}

/** A member's context without a browser session (the ImmiAccount extension uses a bearer token). */
export async function memberCtx(agencyId: string, userId: string): Promise<Ctx | null> {
  const [row] = await db
    .select({ role: schema.member.role, name: schema.organization.name, slug: schema.organization.slug, userName: schema.user.name, email: schema.user.email, image: schema.user.image })
    .from(schema.member)
    .innerJoin(schema.organization, eq(schema.organization.id, schema.member.organizationId))
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(and(eq(schema.member.organizationId, agencyId), eq(schema.member.userId, userId)));
  if (!row) return null;
  const role = row.role as Role;
  const [profile] = await db.select().from(schema.staffProfiles).where(and(eq(schema.staffProfiles.agencyId, agencyId), eq(schema.staffProfiles.userId, userId)));
  const position = (profile?.position ?? (role === "owner" || role === "admin" ? "principal" : role === "agent" ? "migration_agent" : "consultant")) as Position;
  const registered = (position === "principal" || position === "migration_agent") && marnCurrent(profile?.marn ?? null, profile?.marnExpiry ?? null);
  return { userId, name: row.userName, email: row.email, image: row.image ?? null, agencyId, agencyName: row.name, agencySlug: row.slug, role, position, caps: capsFor(role, position).filter((c) => c !== "immigration" || registered), registered };
}
