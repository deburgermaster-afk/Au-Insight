import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notifyStaff } from "@/lib/notify";
import { DECISIONS, type DeadlineInput, METHODS, reviewDeadline } from "@/lib/review-deadline";
import { type Ctx, memberCtx } from "@/lib/session";

const nice = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

/** Saves the ART deadline on the matter, diarises a task for the matter's agent and tells them. */
export async function saveReviewDeadline(ctx: Pick<Ctx, "agencyId" | "userId" | "name">, matterId: string, input: DeadlineInput, override?: string | null, quiet = false) {
  const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
  if (!m) throw new Error("Matter not found.");
  const r = reviewDeadline(input);
  const dueOn = override && /^\d{4}-\d{2}-\d{2}$/.test(override) ? override : r.dueOn;
  const label = input.decision === "custom" ? `Custom time limit (${input.customDays} days)` : DECISIONS[input.decision].label;
  await db
    .update(s.matters)
    .set({
      reviewDueAt: dueOn,
      reviewBasis: { decision: label, notifiedOn: input.date, method: METHODS[input.method].label, documentDate: input.method.startsWith("post") ? input.date : null, deemedOn: r.deemedOn, days: r.days, unit: r.unit, explanation: override && override !== r.dueOn ? [...r.explanation, `Set by hand to ${nice(override)} (from the decision letter).`] : r.explanation, override: Boolean(override && override !== r.dueOn) },
    })
    .where(eq(s.matters.id, matterId));
  // One open task per matter for the review application; move it if the date changes.
  const owner = m.assignedTo ?? ctx.userId;
  const due = new Date(`${dueOn}T09:00:00+10:00`);
  const updated = await db
    .update(s.tasks)
    .set({ dueAt: due })
    .where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.matterId, matterId), sql`${s.tasks.title} like 'Apply to the ART:%'`, sql`${s.tasks.status} <> 'done'`))
    .returning({ id: s.tasks.id });
  if (!updated.length) {
    const [c] = await db.select({ first: s.clients.firstName, last: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, m.clientId));
    await db.insert(s.tasks).values({ agencyId: ctx.agencyId, title: `Apply to the ART: ${m.reference} ${c?.first ?? ""} ${c?.last ?? ""}`.trim(), description: `Last day to apply for review: ${nice(dueOn)}. Confirm the date in the decision letter and get the client's instructions.`, priority: "urgent", dueAt: due, assignedTo: owner, clientId: m.clientId, matterId, createdBy: ctx.userId });
  }
  await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m.clientId, matterId, kind: "stage", title: `ART review deadline: ${nice(dueOn)}`, body: r.explanation.join(" "), actorId: ctx.userId, actorName: ctx.name });
  if (!quiet && owner !== ctx.userId) {
    const who = await memberCtx(ctx.agencyId, owner);
    if (who) await notifyStaff([who.email], `ART review deadline: ${m.reference}`, { heading: `Review application due ${nice(dueOn)}`, lines: [`${m.title} was refused or cancelled. ${ctx.name} recorded the tribunal deadline.`, ...r.explanation], cta: { label: "Open the matter", path: `/app/matters/${matterId}` } });
  }
  return dueOn;
}

