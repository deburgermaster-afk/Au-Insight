"use server";

import { and, count, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { actionCtx, requireRole } from "@/lib/session";
import { inviteStaff } from "@/lib/team-actions";

const v = (f: FormData, k: string) => {
  const x = f.get(k);
  const t = typeof x === "string" ? x.trim() : "";
  return t === "" ? null : t;
};
const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

async function profileRow(agencyId: string, userId: string) {
  const [p] = await db.select({ id: s.staffProfiles.id }).from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, agencyId), eq(s.staffProfiles.userId, userId)));
  return p?.id ?? null;
}

// ── Agency setup (owner / admin) ───────────────────────────────────────────────────────────────

/** Saves one step of the agency setup wizard. Each step sends only its own fields. */
export async function saveSetupStep(step: string, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const set: Partial<typeof s.agencyProfile.$inferInsert> = {};
    if (step === "practice") {
      const abn = v(f, "abn")?.replace(/\s/g, "");
      if (abn && !/^\d{11}$/.test(abn)) return { ok: false, error: "An ABN has 11 digits." };
      const marn = v(f, "marn");
      if (marn && !/^\d{7}$/.test(marn)) return { ok: false, error: "A MARN has 7 digits." };
      Object.assign(set, { legalName: v(f, "legalName"), abn: abn ? abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4") : null, marn, phone: v(f, "phone"), email: v(f, "email"), website: v(f, "website"), address: v(f, "address"), state: v(f, "state") });
      const pid = await profileRow(ctx.agencyId, ctx.userId);
      if (pid) await db.update(s.staffProfiles).set({ marn, marnExpiry: v(f, "marnExpiry"), position: "principal", title: "Principal migration agent" }).where(eq(s.staffProfiles.id, pid));
    } else if (step === "services") {
      set.services = f.getAll("services").map(String);
      set.teamSize = v(f, "teamSize");
    } else if (step === "brand") {
      const c = v(f, "brandColor");
      if (c && !/^#[0-9a-f]{6}$/i.test(c)) return { ok: false, error: "Pick a colour." };
      set.brandColor = c;
    } else if (step === "payments") {
      Object.assign(set, { bankName: v(f, "bankName"), bankAccountName: v(f, "bankAccountName"), bankBsb: v(f, "bankBsb"), bankAccount: v(f, "bankAccount"), gstRegistered: f.get("gstRegistered") === "on" });
    } else return { ok: false, error: "Unknown step." };
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, ...set }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Invites each row from the team step; returns how many went out. */
export async function inviteTeam(rows: { email: string; position: string }[]): Promise<ActionResult> {
  try {
    await requireRole("admin");
    let sent = 0;
    const errors: string[] = [];
    for (const r of rows.filter((x) => x.email.trim())) {
      const f = new FormData();
      f.set("email", r.email);
      f.set("position", r.position);
      const res = await inviteStaff(f);
      if (res.ok) sent++;
      else errors.push(`${r.email}: ${res.error}`);
    }
    if (errors.length && !sent) return { ok: false, error: errors.join("; ") };
    return { ok: true, id: String(sent) };
  } catch (e) {
    return fail(e);
  }
}

/** Last step: optionally fill a demo workspace, then mark setup done. */
export async function finishSetup(withDemo: boolean): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    if (withDemo) {
      const [{ n }] = await db.select({ n: count() }).from(s.clients).where(eq(s.clients.agencyId, ctx.agencyId));
      if (n === 0) {
        const { seedDemo } = await import("@/lib/demo");
        await seedDemo(ctx);
      }
    }
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, onboardedAt: new Date() }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { onboardedAt: new Date() } });
    const pid = await profileRow(ctx.agencyId, ctx.userId);
    if (pid) await db.update(s.staffProfiles).set({ onboardedAt: new Date() }).where(eq(s.staffProfiles.id, pid));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agency_setup", entityId: ctx.agencyId, detail: { finished: true, demo: withDemo } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Employee welcome (any staff member) ────────────────────────────────────────────────────────

export async function saveWelcomeStep(step: string, f: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const pid = await profileRow(ctx.agencyId, ctx.userId);
    if (!pid) return { ok: false, error: "Your staff record isn't ready yet. Refresh and try again." };
    const set: Partial<typeof s.staffProfiles.$inferInsert> = {};
    if (step === "about") {
      const name = v(f, "name");
      if (name) await db.update(s.user).set({ name }).where(eq(s.user.id, ctx.userId));
      Object.assign(set, { phone: v(f, "phone"), title: v(f, "title"), emergencyName: v(f, "emergencyName"), emergencyPhone: v(f, "emergencyPhone") });
    } else if (step === "registration") {
      const marn = v(f, "marn");
      if (marn && !/^\d{7}$/.test(marn)) return { ok: false, error: "A MARN has 7 digits." };
      Object.assign(set, { marn, marnExpiry: v(f, "marnExpiry"), qeac: v(f, "qeac") });
    } else if (step === "pay") {
      const bsb = v(f, "bankBsb")?.replace(/\D/g, "");
      if (bsb && bsb.length !== 6) return { ok: false, error: "A BSB has 6 digits." };
      Object.assign(set, { bankBsb: bsb ? `${bsb.slice(0, 3)}-${bsb.slice(3)}` : null, bankAccount: v(f, "bankAccount"), superFund: v(f, "superFund"), taxFreeThreshold: f.get("taxFreeThreshold") === "on" });
    } else if (step === "policies") {
      const need = ["privacy", "confidentiality", ...(f.get("needsCode") ? ["code"] : [])];
      if (need.some((k) => f.get(k) !== "on")) return { ok: false, error: "Please tick each item to continue." };
      Object.assign(set, { policiesAcceptedAt: new Date(), onboardedAt: new Date() });
    } else return { ok: false, error: "Unknown step." };
    await db.update(s.staffProfiles).set(set).where(eq(s.staffProfiles.id, pid));
    if (step === "policies") await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "staff_onboarding", entityId: ctx.userId, detail: { policies: true } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
