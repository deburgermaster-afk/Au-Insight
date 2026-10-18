"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { allCaps, type Cap } from "@/lib/permissions";
import { requireCap, requireRole } from "@/lib/session";

const roleInput = z.object({
  name: z.string().trim().min(2, "Name the role.").max(40),
  description: z.string().trim().max(200).optional().default(""),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).default("#6d5efc"),
  caps: z.array(z.string()).max(20),
});
export type RoleInput = z.input<typeof roleInput>;

/** Admin: create ("new") or update a custom access role. People with the role get its features on their next page load. */
export async function saveRole(id: string, input: RoleInput): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const v = roleInput.parse(input);
    const caps = v.caps.filter((c): c is Cap => allCaps.includes(c as Cap));
    if (!caps.length) return { ok: false, error: "Turn on at least one feature." };
    let rid = id;
    if (id === "new") {
      const [r] = await db.insert(s.agencyRoles).values({ agencyId: ctx.agencyId, name: v.name, description: v.description || null, color: v.color, caps, createdByName: ctx.name }).returning({ id: s.agencyRoles.id });
      rid = r.id;
    } else {
      const [r] = await db.update(s.agencyRoles).set({ name: v.name, description: v.description || null, color: v.color, caps, updatedAt: new Date() }).where(and(eq(s.agencyRoles.agencyId, ctx.agencyId), eq(s.agencyRoles.id, id))).returning({ id: s.agencyRoles.id });
      if (!r) return { ok: false, error: "Role not found." };
    }
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: id === "new" ? "create" : "update", entity: "agency_role", entityId: rid, detail: { name: v.name, caps } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: rid };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e) };
  }
}

/** Admin: delete a role. Its people go back to their position's default features. */
export async function deleteRole(id: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.update(s.staffProfiles).set({ roleId: null }).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.roleId, id)));
    const [r] = await db.delete(s.agencyRoles).where(and(eq(s.agencyRoles.agencyId, ctx.agencyId), eq(s.agencyRoles.id, id))).returning({ name: s.agencyRoles.name });
    if (r) await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "delete", entity: "agency_role", entityId: id, detail: { name: r.name } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Admin: give a member a custom role, or null for their position's defaults. */
export async function assignRole(userId: string, roleId: string | null): Promise<ActionResult> {
  try {
    const ctx = await requireCap("team");
    if (roleId) {
      const [r] = await db.select({ id: s.agencyRoles.id }).from(s.agencyRoles).where(and(eq(s.agencyRoles.agencyId, ctx.agencyId), eq(s.agencyRoles.id, roleId)));
      if (!r) return { ok: false, error: "Role not found." };
    }
    const [m] = await db.select({ role: s.member.role }).from(s.member).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.userId, userId)));
    if (!m) return { ok: false, error: "Not on your team." };
    if (m.role === "owner") return { ok: false, error: "The owner always has every feature." };
    const [p] = await db.update(s.staffProfiles).set({ roleId }).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, userId))).returning({ id: s.staffProfiles.id });
    if (!p) await db.insert(s.staffProfiles).values({ agencyId: ctx.agencyId, userId, roleId });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "member_access", entityId: userId, detail: { roleId } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
