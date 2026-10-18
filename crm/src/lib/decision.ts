import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { createMagicLink } from "@/lib/client-auth";
import { mailEnabled, sendMail } from "@/lib/mail";
import type { Ctx } from "@/lib/session";
import { predictTimeline } from "@/lib/visa-timeline";
import { visaByCode } from "@/lib/visas";

// When a decision is recorded on a matter: the timeline, the stage, what happens next, and the client.
//  - granted: stage → decision, a "what's next" email (the next milestone on the pathway, e.g. 801
//    eligibility, the 191, citizenship), a task to send the grant letter and close the file;
//  - refused: for onshore clients the Tribunal review deadline is diarised from the decision date,
//    an urgent task for the agent to advise on review options, and a careful email to the client.

export async function onDecision(ctx: Pick<Ctx, "agencyId" | "userId" | "name" | "agencyName">, matterId: string, outcome: string, decisionAt: string | null) {
  const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
  if (!m) return;
  const [c] = await db.select().from(s.clients).where(eq(s.clients.id, m.clientId));
  const visa = visaByCode(m.visaCode);
  const visaName = visa ? `${visa.name} (subclass ${visa.code})` : m.visaCode;
  const day = decisionAt ?? new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const o = outcome.toLowerCase();
  const granted = o.startsWith("grant");
  const refused = o.startsWith("refus");
  if (!granted && !refused) {
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m.clientId, matterId, kind: "stage", title: `Decision recorded: ${outcome}`, actorId: ctx.userId, actorName: ctx.name });
    return;
  }
  await db.update(s.matters).set({ stage: "decision", decisionAt: day }).where(eq(s.matters.id, matterId));
  const next = granted ? predictTimeline({ ...m, decisionAt: day, outcome: "granted", stage: "decision" }).find((x) => x.key.startsWith("post:")) : null;
  let reviewDue: string | null = null;
  if (refused && c?.onshore && !m.reviewDueAt) {
    try {
      const { saveReviewDeadline } = await import("@/lib/review");
      await saveReviewDeadline(ctx, matterId, { decision: "onshore", method: "email", date: day }, null, true);
      const [u] = await db.select({ due: s.matters.reviewDueAt }).from(s.matters).where(eq(s.matters.id, matterId));
      reviewDue = u?.due ?? null;
    } catch (e) {
      console.error("review deadline", e);
    }
  }
  await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: m.clientId, matterId, kind: "stage", title: granted ? `Visa granted: ${visaName}` : `Visa refused: ${visaName}`, body: granted ? (next ? `Next on the pathway: ${next.label} (about ${next.date}).` : null) : reviewDue ? `Tribunal review deadline diarised: ${reviewDue}.` : "Check the decision letter for review rights and time limits.", actorId: ctx.userId, actorName: ctx.name });
  await db.insert(s.tasks).values({
    agencyId: ctx.agencyId,
    title: granted ? `Send grant letter and close the file (${m.reference})` : `Advise ${c?.firstName ?? "client"} on review options${reviewDue ? ` before ${reviewDue}` : ""} (${m.reference})`,
    description: granted ? "Send the grant notice and conditions, explain the visa's conditions and the next step on the pathway, then close the matter." : "Read the decision record, assess review prospects (ART, ministerial intervention, a new application) and advise in writing before the time limit.",
    priority: granted ? "normal" : "urgent",
    dueAt: new Date(Date.now() + (granted ? 5 : 2) * 864e5),
    assignedTo: m.assignedTo ?? ctx.userId,
    clientId: m.clientId,
    matterId,
    createdBy: ctx.userId,
  });
  // Tell the client.
  if (!c?.email || c.email.endsWith(".test") || !mailEnabled()) return;
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared")));
  if (!box) return;
  const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
  const url = await createMagicLink(c.id, ctx.agencyId, ctx.userId, `/client/cases/${matterId}`, 72 * 60);
  const btn = `<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Open my case</a></p>`;
  await sendMail({
    agencyId: ctx.agencyId,
    from: { address: box.address, name: ctx.agencyName },
    to: [c.email],
    subject: granted ? `Congratulations, your ${visa?.code ?? ""} visa has been granted`.replace("  ", " ") : `About your ${visa?.code ?? ""} visa application`.replace("  ", " "),
    html: granted
      ? `<p>Hi ${esc(c.firstName)},</p><p>Great news: the Department of Home Affairs has granted your <b>${esc(visaName)}</b>.</p><p>We'll send you the grant notice and explain your visa conditions.${next ? ` The next step on your pathway is <b>${esc(next.label)}</b>: ${esc(next.detail)}` : ""}</p>${btn}<p>Congratulations from all of us,<br/>${esc(ctx.name)}</p>`
      : `<p>Hi ${esc(c.firstName)},</p><p>The Department of Home Affairs has made a decision on your <b>${esc(visaName)}</b> application, and unfortunately it was not successful.</p><p>Please don't worry yet: there may be options, such as a review by the Administrative Review Tribunal${reviewDue ? `, which has a strict deadline (<b>${esc(reviewDue)}</b>)` : ", which has strict time limits"}. ${esc(ctx.name)} will contact you shortly to go through the decision and your options.</p>${btn}<p>${esc(ctx.agencyName)}</p>`,
    clientId: c.id,
    matterId,
    footer: `Sent by ${ctx.agencyName} via Lodgely`,
  });
}
