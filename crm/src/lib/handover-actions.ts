"use server";

import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { HandoverItem } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { applyItem, type PreviewItem, returnHandover, type Scope, SCOPES, staffOf, workOf } from "@/lib/handover";
import { notifyStaff } from "@/lib/notify";
import { requireCap } from "@/lib/session";

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) });

/** What would move: everything the person owns in the chosen areas (and, for a swap, the other person's too). */
export async function previewHandover(fromUserId: string, scopes: Scope[], swapWith?: string | null): Promise<{ ok: true; items: PreviewItem[]; swap: PreviewItem[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireCap("team", "Only admins can hand over other people's work.");
    const valid = scopes.filter((x) => SCOPES.some((y) => y.key === x));
    const items = await workOf(ctx.agencyId, fromUserId, valid);
    const swap = swapWith ? await workOf(ctx.agencyId, swapWith, valid) : [];
    return { ok: true, items, swap };
  } catch (e) {
    return fail(e);
  }
}

type Input = {
  mode: "permanent" | "cover" | "swap";
  from: string;
  to: string | null;
  scopes: Scope[];
  /** Per-item target (record id + field) when it shouldn't go to `to`; null = leave it with them. */
  overrides: Record<string, string | null>;
  returnOn: string | null;
  reason: string;
  note: string;
};

/** Moves the work. Cases that need a registered agent are only given to someone who is one, or who has a registered supervisor. */
export async function runHandover(input: Input): Promise<ActionResult & { moved?: number; skipped?: string[] }> {
  try {
    const ctx = await requireCap("team", "Only admins can hand over other people's work.");
    const staff = await staffOf(ctx.agencyId);
    const person = (id: string | null) => (id ? staff.find((x) => x.id === id) : undefined);
    if (!person(input.from)) return { ok: false, error: "Choose whose work is moving." };
    if (input.mode === "swap" && (!input.to || input.to === input.from)) return { ok: false, error: "Choose who they're swapping with." };
    if (input.mode === "cover" && (!input.returnOn || !/^\d{4}-\d{2}-\d{2}$/.test(input.returnOn))) return { ok: false, error: "Set the date the work comes back." };
    if (input.mode === "cover" && input.returnOn! <= new Date().toISOString().slice(0, 10)) return { ok: false, error: "The return date must be in the future." };
    if (input.to && !person(input.to)) return { ok: false, error: "Choose someone in your agency." };
    const scopes = input.scopes.filter((x) => SCOPES.some((y) => y.key === x));
    if (!scopes.length) return { ok: false, error: "Pick what to hand over." };
    const key = (i: { id: string; field: string }) => `${i.id}:${i.field}`;
    const plan: (PreviewItem & { target: string | null; expect: string | null })[] = [];
    for (const it of await workOf(ctx.agencyId, input.from, scopes)) {
      const target = key(it) in input.overrides ? input.overrides[key(it)] : input.to;
      if (target && target !== input.from) plan.push({ ...it, target, expect: input.from });
    }
    if (input.mode === "swap") for (const it of await workOf(ctx.agencyId, input.to!, scopes)) plan.push({ ...it, target: input.from, expect: input.to });
    // A case can go to someone unregistered if this same handover gives it a registered supervisor.
    const newSupervisor = new Map(plan.filter((x) => x.field === "supervisorId" && person(x.target)?.registered).map((x) => [x.id, x.target]));
    const skipped: string[] = [];
    const done: HandoverItem[] = [];
    plan.sort((a, b) => (a.field === "supervisorId" ? -1 : 0) - (b.field === "supervisorId" ? -1 : 0));
    for (const it of plan) {
      const to = person(it.target)!;
      if (!to) {
        skipped.push(`${it.label}: that person isn't in the agency`);
        continue;
      }
      if (it.field === "supervisorId" && !to.registered) {
        skipped.push(`${it.label}: ${to.name} can't supervise (no current MARN)`);
        continue;
      }
      if (it.entity === "matter" && it.field === "assignedTo" && !to.registered && !it.hasRegisteredSupervisor && !newSupervisor.has(it.id) && it.stage !== "enquiry") {
        skipped.push(`${it.label}: ${to.name} isn't a registered agent and the case has no registered supervisor`);
        continue;
      }
      if (await applyItem(ctx.agencyId, it, to.id, it.expect)) done.push({ entity: it.entity, id: it.id, field: it.field, from: it.expect, to: to.id, label: it.label });
      else skipped.push(`${it.label}: changed by someone else just now`);
    }
    if (!done.length) return { ok: false, error: skipped.length ? `Nothing could move. ${skipped.slice(0, 3).join("; ")}` : "Nothing to hand over." };
    const [h] = await db
      .insert(s.handovers)
      .values({ agencyId: ctx.agencyId, mode: input.mode, fromUserId: input.from, toUserId: input.to, reason: input.reason.trim() || null, note: input.note.trim() || null, returnOn: input.mode === "cover" ? input.returnOn : null, status: input.mode === "cover" ? "active" : "done", items: done, createdBy: ctx.userId, createdByName: ctx.name })
      .returning({ id: s.handovers.id });
    const fromName = person(input.from)!.name;
    const why = input.mode === "cover" ? `cover while ${fromName} is away, until ${input.returnOn}` : input.mode === "swap" ? `swap between ${fromName} and ${person(input.to)?.name}` : `handover from ${fromName}`;
    // Timeline entries on each affected case and client, so the history explains the change.
    const timeline = done
      .filter((d) => d.entity === "matter" || d.entity === "client")
      .map((d) => ({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, clientId: d.entity === "client" ? d.id : null, matterId: d.entity === "matter" ? d.id : null, kind: "note", title: `${d.field === "supervisorId" ? "Supervisor" : "Case officer"} changed (${why})`, body: `Now ${person(d.to)?.name ?? ""}${input.note.trim() ? `\n${input.note.trim()}` : ""}` }));
    if (timeline.length) await db.insert(s.activities).values(timeline);
    const summary = [`${done.length} item${done.length === 1 ? "" : "s"} moved (${why})`, ...(skipped.length ? [`${skipped.length} left in place`] : [])];
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "handover", entity: "handover", entityId: h.id, detail: { summary, note: input.note.trim() || undefined, skipped } });
    // Tell each recipient what they now have.
    const byPerson = new Map<string, HandoverItem[]>();
    for (const d of done) if (d.to) byPerson.set(d.to, [...(byPerson.get(d.to) ?? []), d]);
    for (const [uid, list] of byPerson) {
      const p = person(uid);
      if (!p || uid === ctx.userId) continue;
      await notifyStaff([p.email], input.mode === "cover" ? `You're covering for ${fromName}` : `Work handed to you`, {
        heading: input.mode === "cover" ? `Covering for ${fromName} until ${input.returnOn}` : `${list.length} item${list.length === 1 ? "" : "s"} are now yours`,
        lines: [...list.slice(0, 12).map((x) => `${x.label}${x.field === "supervisorId" ? " (supervisor)" : ""}`), ...(list.length > 12 ? [`and ${list.length - 12} more`] : []), ...(input.note.trim() ? [`Note: ${input.note.trim()}`] : [])],
        cta: { label: "Open Lodgely", path: "/app" },
      }).catch(() => undefined);
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, id: h.id, moved: done.length, skipped };
  } catch (e) {
    return fail(e);
  }
}

/** Ends temporary cover early: everything goes back unless it was changed since. */
export async function endCover(id: string): Promise<ActionResult & { returned?: number; kept?: number }> {
  try {
    const ctx = await requireCap("team");
    const r = await returnHandover(ctx.agencyId, id, { id: ctx.userId, name: ctx.name });
    if (r.error) return { ok: false, error: r.error };
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, returned: r.returned, kept: r.kept };
  } catch (e) {
    return fail(e);
  }
}
