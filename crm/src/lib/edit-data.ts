import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { marnCurrent } from "@/lib/permissions";
import { getCtx } from "@/lib/session";
import { DEFAULT_LISTS, listOf } from "@/lib/workflow";

export type EditOptions = {
  staff: { value: string; label: string; registered: boolean }[];
  employers: { value: string; label: string }[];
  institutions: { value: string; label: string }[];
  lists: Record<keyof typeof DEFAULT_LISTS, string[]>;
};

/** Everything an edit form's pickers need, once per page. */
export async function getEditOptions(): Promise<EditOptions> {
  const { agencyId } = await getCtx();
  return optionsFor(agencyId);
}

async function optionsFor(agencyId: string): Promise<EditOptions> {
  const [staff, employers, institutions, [p]] = await Promise.all([
    db
      .select({ id: s.user.id, name: s.user.name, position: s.staffProfiles.position, marn: s.staffProfiles.marn, marnExpiry: s.staffProfiles.marnExpiry })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, agencyId)))
      .where(eq(s.member.organizationId, agencyId))
      .orderBy(s.user.name),
    db.select({ id: s.employers.id, name: s.employers.name }).from(s.employers).where(eq(s.employers.agencyId, agencyId)).orderBy(s.employers.name),
    db.select({ id: s.institutions.id, name: s.institutions.name }).from(s.institutions).where(eq(s.institutions.agencyId, agencyId)).orderBy(s.institutions.name),
    db.select({ w: s.agencyProfile.workflow }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  const w = p?.w ?? null;
  return {
    staff: staff.map((x) => ({ value: x.id, label: x.name, registered: (x.position === "principal" || x.position === "migration_agent") && marnCurrent(x.marn, x.marnExpiry) })),
    employers: employers.map((x) => ({ value: x.id, label: x.name })),
    institutions: institutions.map((x) => ({ value: x.id, label: x.name })),
    lists: { sources: listOf(w, "sources"), tags: listOf(w, "tags"), documentCategories: listOf(w, "documentCategories"), outcomes: listOf(w, "outcomes") },
  };
}

/** Change history for one record, newest first, from the audit log. */
export async function recordHistory(entity: string, id: string) {
  const { agencyId } = await getCtx();
  return db
    .select({ id: s.auditLog.id, action: s.auditLog.action, actorName: s.auditLog.actorName, detail: s.auditLog.detail, createdAt: s.auditLog.createdAt, entity: s.auditLog.entity })
    .from(s.auditLog)
    .where(and(eq(s.auditLog.agencyId, agencyId), eq(s.auditLog.entityId, id)))
    .orderBy(desc(s.auditLog.createdAt))
    .limit(entity ? 60 : 60);
}
