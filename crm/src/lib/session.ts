import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, schema } from "@/db";
import { auth } from "@/lib/auth";

export type Role = "owner" | "admin" | "supervisor" | "agent" | "staff" | "client";

export type Ctx = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  agencyId: string;
  agencyName: string;
  agencySlug: string;
  role: Role;
};

/**
 * The signed-in user, their agency and role. Cached privately (in the browser only) for the
 * session, so every page can call it and navigations stay instant.
 */
export async function getCtx(): Promise<Ctx> {
  "use cache: private";
  return resolveCtx();
}

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
  return {
    userId: session.user.id,
    name: session.user.name,
    email: session.user.email,
    image: session.user.image ?? null,
    agencyId: active.agencyId,
    agencyName: active.name,
    agencySlug: active.slug,
    role: active.role as Role,
  };
}

const rank: Record<Role, number> = { client: 0, staff: 1, agent: 2, supervisor: 3, admin: 4, owner: 5 };

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
