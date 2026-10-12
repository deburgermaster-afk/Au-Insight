"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { searchCourses as search } from "@/lib/occupations";
import { requireCap } from "@/lib/session";

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const v = (f: FormData, k: string) => {
  const x = f.get(k);
  const t = typeof x === "string" ? x.trim() : "";
  return t === "" ? null : t;
};
const COMMISSION_BAN = "2026-03-31";

export async function findCourses(q: string, level?: string) {
  await requireCap("education");
  return search(q, level);
}

export async function createInstitution(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const name = v(f, "name");
    if (!name) return { ok: false, error: "Name the institution." };
    const [row] = await db
      .insert(s.institutions)
      .values({ agencyId: ctx.agencyId, name, cricos: v(f, "cricos"), state: v(f, "state"), contactName: v(f, "contactName"), contactEmail: v(f, "contactEmail"), commissionRate: v(f, "commissionRate"), agreementExpiry: v(f, "agreementExpiry") })
      .returning({ id: s.institutions.id });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function createApplication(f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const clientId = v(f, "clientId");
    const course = v(f, "course");
    if (!clientId || !course) return { ok: false, error: "Choose a student and a course." };
    let institutionId = v(f, "institutionId");
    const providerName = v(f, "providerName");
    if (!institutionId && providerName) {
      const [existing] = await db.select({ id: s.institutions.id }).from(s.institutions).where(and(eq(s.institutions.agencyId, ctx.agencyId), eq(s.institutions.name, providerName)));
      institutionId = existing?.id ?? (await db.insert(s.institutions).values({ agencyId: ctx.agencyId, name: providerName, cricos: v(f, "providerCode") }).returning({ id: s.institutions.id }))[0].id;
    }
    const [inst] = institutionId ? await db.select().from(s.institutions).where(eq(s.institutions.id, institutionId)) : [];
    const [row] = await db
      .insert(s.studentApplications)
      .values({
        agencyId: ctx.agencyId,
        clientId,
        institutionId,
        course,
        courseCode: v(f, "courseCode"),
        intake: v(f, "intake"),
        tuitionFee: v(f, "tuitionFee"),
        commissionRate: v(f, "commissionRate") ?? inst?.commissionRate ?? null,
        onshoreTransfer: f.get("onshoreTransfer") === "on",
        assignedTo: ctx.userId,
        notes: v(f, "notes"),
      })
      .returning({ id: s.studentApplications.id });
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: `Study application opened: ${course}`, body: inst?.name ?? null, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Moves an application; acceptance and enrolment decide whether commission can be claimed. */
export async function setApplicationStatus(id: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const [a] = await db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, id)));
    if (!a) return { ok: false, error: "Application not found." };
    const today = new Date().toISOString().slice(0, 10);
    const acceptedAt = status === "accepted" && !a.acceptedAt ? today : a.acceptedAt;
    let commissionStatus = a.commissionStatus;
    const banned = a.onshoreTransfer && (acceptedAt ?? today) > COMMISSION_BAN;
    if (banned) commissionStatus = "ineligible";
    else if (status === "enrolled" && commissionStatus === "not_due") commissionStatus = "claimable";
    await db.update(s.studentApplications).set({ status, acceptedAt, commissionStatus }).where(eq(s.studentApplications.id, id));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: a.clientId, kind: "stage", title: `${a.course}: ${status.replace("_", " ")}`, actorId: ctx.userId, actorName: ctx.name });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCommissionStatus(id: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireCap("education");
    const [a] = await db.select().from(s.studentApplications).where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, id)));
    if (!a) return { ok: false, error: "Application not found." };
    if (a.commissionStatus === "ineligible") return { ok: false, error: "Onshore transfers accepted after 31 March 2026 can't attract commission." };
    await db.update(s.studentApplications).set({ commissionStatus: status }).where(eq(s.studentApplications.id, id));
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
