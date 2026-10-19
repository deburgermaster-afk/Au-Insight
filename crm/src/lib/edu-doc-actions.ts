"use server";

import { and, eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import type { MailAttachment } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { agencyTag } from "@/lib/data";
import { requireCap } from "@/lib/session";

const attachment = z.object({ name: z.string(), size: z.number(), type: z.string(), key: z.string() });
const esc = (v: string) => v.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

export type AppDocKind = "offer" | "conditional_offer" | "coe" | "other";
const CATEGORY: Record<AppDocKind, string> = { offer: "Offer letter", conditional_offer: "Offer letter", coe: "CoE", other: "Education" };

/**
 * Files an offer letter or CoE against a study application: the document goes on the student's
 * record (so it shows in their portal), the application moves on (offer, conditional or CoE, with
 * the CoE number), and the student can be emailed a link to open it.
 */
export async function fileApplicationDocuments(
  applicationId: string,
  files: MailAttachment[],
  input: { kind: AppDocKind; coeNumber?: string | null; notify: boolean },
): Promise<ActionResult & { emailed?: boolean }> {
  try {
    const ctx = await requireCap("education");
    const list = z.array(attachment).min(1, "Choose a file.").parse(files);
    if (list.some((f) => !f.key.startsWith(`agency/${ctx.agencyId}/`))) return { ok: false, error: "File not found." };
    const kind = z.enum(["offer", "conditional_offer", "coe", "other"]).parse(input.kind);
    const coeNumber = input.coeNumber?.trim() || null;
    if (coeNumber && !/^[A-Za-z0-9-]{4,20}$/.test(coeNumber)) return { ok: false, error: "CoE numbers are letters and digits only." };
    const [a] = await db
      .select({ a: s.studentApplications, inst: s.institutions.name, first: s.clients.firstName, email: s.clients.email })
      .from(s.studentApplications)
      .innerJoin(s.clients, eq(s.clients.id, s.studentApplications.clientId))
      .leftJoin(s.institutions, eq(s.institutions.id, s.studentApplications.institutionId))
      .where(and(eq(s.studentApplications.agencyId, ctx.agencyId), eq(s.studentApplications.id, applicationId)));
    if (!a) return { ok: false, error: "Application not found." };
    const app = a.a;

    await db.insert(s.documents).values(
      list.map((f) => ({
        agencyId: ctx.agencyId,
        clientId: app.clientId,
        applicationId: app.id,
        name: f.name,
        category: CATEGORY[kind],
        mimeType: f.type,
        sizeBytes: f.size,
        storageKey: f.key,
        uploadedBy: ctx.name,
        source: "upload",
      })),
    );

    // Move the application on, never backwards.
    const order = ["preparing", "submitted", "offer", "conditional", "accepted", "coe", "enrolled"];
    const today = new Date().toISOString().slice(0, 10);
    const next = kind === "coe" ? "coe" : kind === "offer" ? "offer" : kind === "conditional_offer" ? "conditional" : null;
    const set: Partial<typeof s.studentApplications.$inferInsert> = { updatedAt: new Date() };
    if (next && order.indexOf(next) > order.indexOf(app.status)) set.status = next;
    if (kind === "coe") {
      if (coeNumber) set.coeNumber = coeNumber;
      if (!app.coeIssuedAt) set.coeIssuedAt = today;
    }
    await db.update(s.studentApplications).set(set).where(eq(s.studentApplications.id, app.id));

    const what = kind === "coe" ? "Confirmation of Enrolment (CoE)" : kind === "conditional_offer" ? "Conditional offer letter" : kind === "offer" ? "Offer letter" : "Document";
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: app.clientId, kind: "document", title: `${what}: ${app.course}`, body: [a.inst, coeNumber ? `CoE ${coeNumber}` : null, list.map((f) => f.name).join(", ")].filter(Boolean).join(" · "), actorId: ctx.userId, actorName: ctx.name });

    let emailed = false;
    if (input.notify && a.email) {
      const { mailEnabled, sendMail } = await import("@/lib/mail");
      const [box] = mailEnabled() ? await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, ctx.agencyId), eq(s.mailboxes.kind, "shared"))) : [];
      if (box) {
        const { createMagicLink } = await import("@/lib/client-auth");
        const url = await createMagicLink(app.clientId, ctx.agencyId, ctx.userId, "/client/documents", 72 * 60);
        const next =
          kind === "coe"
            ? "Keep it safe: you'll need the CoE number for your student visa application. We'll be in touch about the next step."
            : kind === "conditional_offer"
              ? "The offer has conditions. Check them and let us know if you have any questions before accepting."
              : "Read it carefully, then tell us if you'd like to accept. We'll guide you through the next steps.";
        await sendMail({
          agencyId: ctx.agencyId,
          from: { address: box.address, name: ctx.agencyName },
          to: [a.email],
          subject: `Your ${what.toLowerCase()} from ${a.inst ?? "your institution"}`.slice(0, 140),
          html: `<p>Hi ${esc(a.first)},</p><p>Good news: your <b>${esc(what.toLowerCase())}</b> for <b>${esc(app.course)}</b>${a.inst ? ` at ${esc(a.inst)}` : ""} has arrived.${coeNumber ? ` Your CoE number is <b>${esc(coeNumber)}</b>.` : ""}</p><p>${esc(next)}</p><p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Open my documents</a></p><p>Kind regards,<br/>${esc(ctx.name)}</p>`,
          clientId: app.clientId,
          footer: `Sent by ${ctx.agencyName} via Lodgely`,
        });
        emailed = true;
        await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId: app.clientId, kind: "email", title: `Student told: ${what.toLowerCase()} is in their portal`, actorId: ctx.userId, actorName: ctx.name });
      }
    }
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, emailed };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check the upload." };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
