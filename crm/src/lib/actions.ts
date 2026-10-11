"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { agencyTag } from "@/lib/data";
import { actionCtx, type Ctx, requireRole } from "@/lib/session";
import { visaByCode } from "@/lib/visas";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const fail = (e: unknown): ActionResult => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const blank = (v: FormDataEntryValue | null) => {
  const t = typeof v === "string" ? v.trim() : "";
  return t === "" ? null : t;
};

async function log(ctx: Ctx, entry: { clientId?: string | null; matterId?: string | null; kind: string; title: string; body?: string | null }) {
  await db.insert(s.activities).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, ...entry });
}
async function audit(ctx: Ctx, action: string, entity: string, entityId?: string, detail?: unknown) {
  await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action, entity, entityId, detail: detail ?? null });
}
const refresh = (ctx: Ctx) => updateTag(agencyTag(ctx.agencyId));

// ── Clients ───────────────────────────────────────────────────────────────────────────────────

const clientInput = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().nullable(),
  phone: z.string().nullable(),
  dateOfBirth: z.string().nullable(),
  nationality: z.string().nullable(),
  passportNumber: z.string().nullable(),
  passportExpiry: z.string().nullable(),
  currentVisa: z.string().nullable(),
  visaExpiry: z.string().nullable(),
  occupation: z.string().nullable(),
  stage: z.enum(["lead", "prospect", "active", "on_hold", "past", "lost"]),
  source: z.string().nullable(),
  onshore: z.boolean(),
  notes: z.string().nullable(),
});

export async function createClient(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const input = clientInput.parse({
      firstName: blank(form.get("firstName")),
      lastName: blank(form.get("lastName")),
      email: blank(form.get("email")),
      phone: blank(form.get("phone")),
      dateOfBirth: blank(form.get("dateOfBirth")),
      nationality: blank(form.get("nationality")),
      passportNumber: blank(form.get("passportNumber")),
      passportExpiry: blank(form.get("passportExpiry")),
      currentVisa: blank(form.get("currentVisa")),
      visaExpiry: blank(form.get("visaExpiry")),
      occupation: blank(form.get("occupation")),
      stage: blank(form.get("stage")) ?? "lead",
      source: blank(form.get("source")),
      onshore: form.get("onshore") !== "off",
      notes: blank(form.get("notes")),
    });
    const [row] = await db
      .insert(s.clients)
      .values({ ...input, agencyId: ctx.agencyId, assignedTo: blank(form.get("assignedTo")) ?? ctx.userId })
      .returning({ id: s.clients.id });
    await log(ctx, { clientId: row.id, kind: "system", title: "Client created" });
    await audit(ctx, "create", "client", row.id);
    refresh(ctx);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientStage(clientId: string, stage: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    await db
      .update(s.clients)
      .set({ stage: stage as typeof s.clients.$inferInsert.stage })
      .where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, clientId)));
    await log(ctx, { clientId, kind: "stage", title: `Stage changed to ${stage.replace("_", " ")}` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addNote(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    const body = blank(form.get("body"));
    if (!body) return { ok: false, error: "Write something first." };
    const kind = blank(form.get("kind")) ?? "note";
    const titles: Record<string, string> = { note: "Note", call: "Phone call", meeting: "Meeting", email: "Email" };
    await log(ctx, { clientId: blank(form.get("clientId")), matterId: blank(form.get("matterId")), kind, title: titles[kind] ?? "Note", body });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function togglePin(activityId: string, pinned: boolean): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    await db.update(s.activities).set({ pinned }).where(and(eq(s.activities.agencyId, ctx.agencyId), eq(s.activities.id, activityId)));
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Matters ───────────────────────────────────────────────────────────────────────────────────

export async function createMatter(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    const clientId = blank(form.get("clientId"));
    const visaCode = blank(form.get("visaCode"));
    if (!clientId || !visaCode) return { ok: false, error: "Choose a client and a visa." };
    const visa = visaByCode(visaCode);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.matters).where(eq(s.matters.agencyId, ctx.agencyId));
    const reference = `LDG-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}`;
    const [row] = await db
      .insert(s.matters)
      .values({
        agencyId: ctx.agencyId,
        clientId,
        visaCode,
        reference,
        title: blank(form.get("title")) ?? `${visa?.name ?? visaCode} (${visaCode})`,
        stream: blank(form.get("stream")),
        stage: (blank(form.get("stage")) ?? "engaged") as typeof s.matters.$inferInsert.stage,
        priority: (blank(form.get("priority")) ?? "normal") as typeof s.matters.$inferInsert.priority,
        assignedTo: blank(form.get("assignedTo")) ?? ctx.userId,
        employerId: blank(form.get("employerId")),
        dueAt: blank(form.get("dueAt")),
        feeProfessional: blank(form.get("feeProfessional")),
        feeGovernment: blank(form.get("feeGovernment")),
      })
      .returning({ id: s.matters.id });
    if (visa?.checklist.length) {
      await db.insert(s.checklistItems).values(
        visa.checklist.map((c, i) => ({ agencyId: ctx.agencyId, matterId: row.id, category: c.category, label: c.label, required: c.required !== false, sort: i })),
      );
    }
    await db.update(s.clients).set({ stage: "active" }).where(and(eq(s.clients.id, clientId), eq(s.clients.agencyId, ctx.agencyId), sql`${s.clients.stage} in ('lead','prospect')`));
    await log(ctx, { clientId, matterId: row.id, kind: "system", title: `Matter ${reference} opened`, body: visa ? `${visa.name} (${visa.code})` : visaCode });
    await audit(ctx, "create", "matter", row.id, { visaCode });
    refresh(ctx);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function moveMatter(matterId: string, stage: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    const [m] = await db
      .update(s.matters)
      .set({
        stage: stage as typeof s.matters.$inferInsert.stage,
        ...(stage === "lodged" ? { lodgedAt: sql`coalesce(${s.matters.lodgedAt}, current_date)` } : {}),
      })
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)))
      .returning({ clientId: s.matters.clientId, reference: s.matters.reference });
    if (!m) return { ok: false, error: "Matter not found" };
    await log(ctx, { clientId: m.clientId, matterId, kind: "stage", title: `${m.reference} moved to ${stage}` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function updateMatter(matterId: string, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    await db
      .update(s.matters)
      .set({
        trn: blank(form.get("trn")),
        lodgedAt: blank(form.get("lodgedAt")),
        decisionAt: blank(form.get("decisionAt")),
        outcome: blank(form.get("outcome")),
        dueAt: blank(form.get("dueAt")),
        notes: blank(form.get("notes")),
      })
      .where(and(eq(s.matters.agencyId, ctx.agencyId), eq(s.matters.id, matterId)));
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setChecklistStatus(itemId: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [item] = await db
      .update(s.checklistItems)
      .set({ status: status as typeof s.checklistItems.$inferInsert.status })
      .where(and(eq(s.checklistItems.agencyId, ctx.agencyId), eq(s.checklistItems.id, itemId)))
      .returning();
    if (item) await log(ctx, { matterId: item.matterId, kind: "document", title: `${item.label}: ${status}` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function addChecklistItem(matterId: string, form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const label = blank(form.get("label"));
    if (!label) return { ok: false, error: "Name the document." };
    await db.insert(s.checklistItems).values({ agencyId: ctx.agencyId, matterId, label, category: blank(form.get("category")) ?? "Other", sort: 999 });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Tasks and appointments ────────────────────────────────────────────────────────────────────

export async function createTask(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const title = blank(form.get("title"));
    if (!title) return { ok: false, error: "Give the task a title." };
    const due = blank(form.get("dueAt"));
    const [row] = await db
      .insert(s.tasks)
      .values({
        agencyId: ctx.agencyId,
        title,
        description: blank(form.get("description")),
        priority: (blank(form.get("priority")) ?? "normal") as typeof s.tasks.$inferInsert.priority,
        dueAt: due ? new Date(due) : null,
        assignedTo: blank(form.get("assignedTo")) ?? ctx.userId,
        clientId: blank(form.get("clientId")),
        matterId: blank(form.get("matterId")),
        createdBy: ctx.userId,
      })
      .returning({ id: s.tasks.id });
    refresh(ctx);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function setTaskStatus(taskId: string, status: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const [t] = await db
      .update(s.tasks)
      .set({ status: status as typeof s.tasks.$inferInsert.status })
      .where(and(eq(s.tasks.agencyId, ctx.agencyId), eq(s.tasks.id, taskId)))
      .returning();
    if (t && status === "done") await log(ctx, { clientId: t.clientId, matterId: t.matterId, kind: "task", title: `Task done: ${t.title}` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function createAppointment(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const date = blank(form.get("date"));
    const time = blank(form.get("time")) ?? "10:00";
    const minutes = Number(blank(form.get("minutes")) ?? 30);
    if (!date) return { ok: false, error: "Pick a date." };
    const startsAt = new Date(`${date}T${time}:00+10:00`);
    const endsAt = new Date(startsAt.getTime() + minutes * 60_000);
    const clientId = blank(form.get("clientId"));
    await db.insert(s.appointments).values({
      agencyId: ctx.agencyId,
      title: blank(form.get("title")) ?? "Consultation",
      kind: blank(form.get("kind")) ?? "consultation",
      startsAt,
      endsAt,
      location: blank(form.get("location")),
      clientId,
      staffId: blank(form.get("staffId")) ?? ctx.userId,
      fee: blank(form.get("fee")),
    });
    if (clientId) await log(ctx, { clientId, kind: "meeting", title: `Appointment booked for ${date} ${time}` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Billing ───────────────────────────────────────────────────────────────────────────────────

export async function createInvoice(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    const clientId = blank(form.get("clientId"));
    if (!clientId) return { ok: false, error: "Choose a client." };
    const descriptions = form.getAll("description").map(String);
    const amounts = form.getAll("amount").map(Number);
    const gstFlags = form.getAll("gst").map(String);
    const items = descriptions
      .map((d, i) => ({ description: d.trim(), quantity: 1, unitPrice: amounts[i] || 0, gst: gstFlags[i] !== "no", disbursement: gstFlags[i] === "no" }))
      .filter((i) => i.description && i.unitPrice > 0);
    if (!items.length) return { ok: false, error: "Add at least one line." };
    const subtotal = items.reduce((a, i) => a + i.unitPrice * i.quantity, 0);
    const gst = items.filter((i) => i.gst).reduce((a, i) => a + i.unitPrice * i.quantity * 0.1, 0);
    const [profile] = await db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    const prefix = profile?.invoicePrefix ?? "INV";
    const next = profile?.nextInvoiceNumber ?? 1001;
    if (profile) await db.update(s.agencyProfile).set({ nextInvoiceNumber: next + 1 }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    else await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, nextInvoiceNumber: next + 1 });
    const issued = new Date().toISOString().slice(0, 10);
    const due = new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10);
    const [row] = await db
      .insert(s.invoices)
      .values({
        agencyId: ctx.agencyId,
        number: `${prefix}-${next}`,
        clientId,
        matterId: blank(form.get("matterId")),
        status: "sent",
        issuedAt: issued,
        dueAt: blank(form.get("dueAt")) ?? due,
        items,
        subtotal: subtotal.toFixed(2),
        gst: gst.toFixed(2),
        total: (subtotal + gst).toFixed(2),
      })
      .returning({ id: s.invoices.id });
    await log(ctx, { clientId, kind: "invoice", title: `Invoice ${prefix}-${next} issued`, body: `$${(subtotal + gst).toFixed(2)} incl. GST` });
    await audit(ctx, "create", "invoice", row.id);
    refresh(ctx);
    return { ok: true, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function recordPayment(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    const invoiceId = blank(form.get("invoiceId"));
    const amount = Number(blank(form.get("amount")));
    const account = blank(form.get("account")) === "trust" ? "trust" : "office";
    if (!invoiceId || !(amount > 0)) return { ok: false, error: "Enter an amount." };
    const [inv] = await db.select().from(s.invoices).where(and(eq(s.invoices.agencyId, ctx.agencyId), eq(s.invoices.id, invoiceId)));
    if (!inv) return { ok: false, error: "Invoice not found" };
    const paid = Number(inv.paid) + amount;
    await db.insert(s.ledger).values({
      agencyId: ctx.agencyId,
      clientId: inv.clientId,
      invoiceId,
      account,
      kind: "receipt",
      amount: amount.toFixed(2),
      method: blank(form.get("method")) ?? "bank transfer",
      reference: inv.number,
      occurredAt: new Date().toISOString().slice(0, 10),
    });
    await db
      .update(s.invoices)
      .set({ paid: paid.toFixed(2), status: paid >= Number(inv.total) ? "paid" : "partial" })
      .where(eq(s.invoices.id, invoiceId));
    await log(ctx, { clientId: inv.clientId, kind: "invoice", title: `Payment received for ${inv.number}`, body: `$${amount.toFixed(2)} into ${account} account` });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Mail ──────────────────────────────────────────────────────────────────────────────────────

export async function sendMessage(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("staff");
    const to = (blank(form.get("to")) ?? "").split(/[,;\s]+/).filter(Boolean);
    const subject = blank(form.get("subject")) ?? "(no subject)";
    const body = blank(form.get("body")) ?? "";
    if (!to.length) return { ok: false, error: "Add a recipient." };
    const from = `${ctx.name} <${ctx.email}>`;
    let providerId: string | null = null;
    if (process.env.RESEND_API_KEY && process.env.MAIL_FROM_DOMAIN) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${ctx.name} <${ctx.agencySlug}@${process.env.MAIL_FROM_DOMAIN}>`, reply_to: ctx.email, to, subject, text: body }),
      });
      if (!res.ok) return { ok: false, error: `Email provider: ${await res.text()}` };
      providerId = ((await res.json()) as { id?: string }).id ?? null;
    }
    await db.insert(s.messages).values({
      agencyId: ctx.agencyId,
      threadKey: crypto.randomUUID(),
      folder: "sent",
      mailbox: ctx.email,
      fromAddress: ctx.email,
      fromName: ctx.name,
      toAddresses: to,
      subject,
      bodyText: body,
      read: true,
      clientId: blank(form.get("clientId")),
      providerId,
    });
    void from;
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function markMessage(id: string, patch: { read?: boolean; starred?: boolean; folder?: string }): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    await db.update(s.messages).set(patch).where(and(eq(s.messages.agencyId, ctx.agencyId), eq(s.messages.id, id)));
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

// ── Employers, team, settings ─────────────────────────────────────────────────────────────────

export async function createEmployer(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("agent");
    const name = blank(form.get("name"));
    if (!name) return { ok: false, error: "Business name is required." };
    await db.insert(s.employers).values({
      agencyId: ctx.agencyId,
      name,
      abn: blank(form.get("abn")),
      contactName: blank(form.get("contactName")),
      contactEmail: blank(form.get("contactEmail")),
      phone: blank(form.get("phone")),
      industry: blank(form.get("industry")),
      sbsApproved: form.get("sbsApproved") === "on",
      sbsExpiry: blank(form.get("sbsExpiry")),
    });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function saveAgencyProfile(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const values = {
      legalName: blank(form.get("legalName")),
      abn: blank(form.get("abn")),
      marn: blank(form.get("marn")),
      phone: blank(form.get("phone")),
      email: blank(form.get("email")),
      website: blank(form.get("website")),
      address: blank(form.get("address")),
      state: blank(form.get("state")),
      invoicePrefix: blank(form.get("invoicePrefix")) ?? "INV",
      gstRegistered: form.get("gstRegistered") === "on",
    };
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, ...values }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: values });
    await audit(ctx, "update", "agency_profile", ctx.agencyId);
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function changeMemberRole(memberId: string, role: string): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    if (!["admin", "supervisor", "agent", "staff"].includes(role)) return { ok: false, error: "Unknown role" };
    await db.update(s.member).set({ role }).where(and(eq(s.member.organizationId, ctx.agencyId), eq(s.member.id, memberId), sql`${s.member.role} <> 'owner'`));
    await audit(ctx, "update", "member_role", memberId, { role });
    refresh(ctx);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** After sign-up: the agency profile, a welcome note, and (optionally) a demo workspace to explore. */
export async function bootstrapAgency(withDemo: boolean): Promise<ActionResult> {
  try {
    const ctx = await actionCtx();
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, legalName: ctx.agencyName, email: ctx.email }).onConflictDoNothing();
    if (withDemo) {
      const { seedDemo } = await import("@/lib/demo");
      await seedDemo(ctx);
    }
    refresh(ctx);
  } catch (e) {
    return fail(e);
  }
  redirect("/app");
}
