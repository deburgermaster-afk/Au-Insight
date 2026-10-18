"use server";

import { and, eq, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { sendAgreement } from "@/lib/agreement-actions";
import { inviteClientToPortal } from "@/lib/client-actions";
import { agencyTag } from "@/lib/data";
import { sendChecklist } from "@/lib/mail-actions";
import { requireRole } from "@/lib/session";
import { createSignDraft, sendSignRequest } from "@/lib/sign-actions";
import { visaByCode } from "@/lib/visas";
import { pickAssignee, workflowFor } from "@/lib/workflow-server";

// "Open a file": everything to start a client's case from the visa library in one go. The client
// (new or existing) and family, the matter with its team, fees and payment arrangement, the checklist
// and task plan, then the outward steps: service agreement, consent forms, document request and portal.

const opt = (max = 200) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")).transform((v) => v || null);

const input = z.object({
  visaCode: z.string().min(2).max(20),
  stream: opt(80),
  client: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("existing"), id: z.string().min(1), email: opt(200), phone: opt(40) }),
    z.object({
      mode: z.literal("new"),
      firstName: z.string().trim().min(1, "Enter the client's first name.").max(80),
      lastName: z.string().trim().min(1, "Enter the client's last name.").max(80),
      email: z.string().trim().email("Enter a valid email.").max(200).optional().nullable().or(z.literal("")).transform((v) => v || null),
      phone: opt(40),
      dateOfBirth: day,
      nationality: opt(80),
      passportNumber: opt(40),
      onshore: z.boolean(),
      currentVisa: opt(20),
      visaExpiry: day,
      occupation: opt(120),
      englishTest: opt(40),
      englishScore: opt(60),
      source: opt(60),
    }),
  ]),
  goals: z.array(z.string().max(60)).max(10),
  instructions: opt(4000),
  family: z.array(z.object({ fullName: z.string().trim().min(2).max(120), relationship: z.string().trim().min(2).max(40), dateOfBirth: day })).max(12),
  includeDependantIds: z.array(z.string()).max(20),
  priority: z.enum(["low", "normal", "high", "urgent"]),
  targetLodge: day,
  employerId: opt(80),
  assignedTo: opt(80),
  supervisorId: opt(80),
  feeProfessional: z.number().min(0).max(1_000_000).nullable(),
  feeGovernment: z.number().min(0).max(1_000_000).nullable(),
  payment: z.object({ plan: z.enum(["upfront", "deposit", "instalments"]), depositPct: z.number().min(5).max(95).optional(), instalments: z.number().int().min(2).max(12).optional() }),
  checklist: z.array(z.object({ category: z.string().max(60), label: z.string().max(300), required: z.boolean() })).max(150),
  tasks: z.array(z.object({ title: z.string().trim().min(2).max(200), dueAt: day, assignee: opt(80) })).max(20),
  send: z.object({ agreement: z.boolean(), consent: z.array(z.string().max(60)).max(12), documents: z.boolean(), documentsDays: z.number().int().min(1).max(90).optional(), portal: z.boolean() }),
});
export type OpenFileInput = z.input<typeof input>;
export type OpenStep = { label: string; ok: boolean; detail?: string };

const planText = (p: z.infer<typeof input>["payment"], total: number | null) => {
  const aud = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
  if (p.plan === "upfront") return `Payment: in full when the agreement is signed${total ? ` (${aud(total)} professional fee + GST)` : ""}.`;
  if (p.plan === "deposit") return `Payment: ${p.depositPct ?? 50}% deposit on signing${total ? ` (${aud((total * (p.depositPct ?? 50)) / 100)})` : ""}, balance before lodgement.`;
  return `Payment: ${p.instalments ?? 3} equal instalments${total ? ` of ${aud(total / (p.instalments ?? 3))}` : ""}, the first on signing.`;
};

export async function openFile(raw: OpenFileInput): Promise<{ ok: true; matterId: string; clientId: string; steps: OpenStep[] } | { ok: false; error: string }> {
  try {
    const ctx = await requireRole("staff");
    const v = input.parse(raw);
    const visa = visaByCode(v.visaCode);
    if (!visa) return { ok: false, error: "Unknown visa." };
    const steps: OpenStep[] = [];
    const members = new Set((await db.select({ id: s.member.userId }).from(s.member).where(eq(s.member.organizationId, ctx.agencyId))).map((m) => m.id));
    const staff = (id: string | null) => (id && members.has(id) ? id : null);

    // ── Client ──
    let clientId: string;
    let clientName: string;
    if (v.client.mode === "existing") {
      const [c] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, ctx.agencyId), eq(s.clients.id, v.client.id)));
      if (!c) return { ok: false, error: "Client not found." };
      clientId = c.id;
      clientName = `${c.firstName} ${c.lastName}`;
      const patch: Partial<typeof s.clients.$inferInsert> = {};
      if (!c.email && v.client.email) patch.email = v.client.email;
      if (!c.phone && v.client.phone) patch.phone = v.client.phone;
      if (c.stage === "lead" || c.stage === "prospect") patch.stage = "active";
      if (Object.keys(patch).length) await db.update(s.clients).set(patch).where(eq(s.clients.id, c.id));
      steps.push({ label: `Client: ${clientName}`, ok: true, detail: "Existing record" });
    } else {
      const n = v.client;
      const [c] = await db
        .insert(s.clients)
        .values({ agencyId: ctx.agencyId, firstName: n.firstName, lastName: n.lastName, email: n.email, phone: n.phone, dateOfBirth: n.dateOfBirth, nationality: n.nationality, passportNumber: n.passportNumber, onshore: n.onshore, currentVisa: n.currentVisa, visaExpiry: n.visaExpiry, occupation: n.occupation, englishTest: n.englishTest, englishScore: n.englishScore, source: n.source, stage: "active", assignedTo: staff(v.assignedTo) ?? ctx.userId })
        .returning({ id: s.clients.id });
      clientId = c.id;
      clientName = `${n.firstName} ${n.lastName}`;
      await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, kind: "system", title: "Client created", actorId: ctx.userId, actorName: ctx.name });
      await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "client", entityId: clientId, detail: { via: "open-file" } });
      steps.push({ label: `Client: ${clientName}`, ok: true, detail: "New record created" });
    }

    // ── Family ──
    if (v.family.length) {
      await db.insert(s.dependants).values(v.family.map((f) => ({ agencyId: ctx.agencyId, clientId, fullName: f.fullName, relationship: f.relationship, dateOfBirth: f.dateOfBirth })));
    }
    const included = [
      ...v.family.map((f) => `${f.fullName} (${f.relationship})`),
      ...(v.includeDependantIds.length ? (await db.select().from(s.dependants).where(and(eq(s.dependants.agencyId, ctx.agencyId), eq(s.dependants.clientId, clientId)))).filter((d) => v.includeDependantIds.includes(d.id)).map((d) => `${d.fullName} (${d.relationship})`) : []),
    ];
    if (included.length) steps.push({ label: `Family included: ${included.length}`, ok: true, detail: included.join(", ") });

    // ── Matter ──
    const wf = await workflowFor(ctx.agencyId);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.matters).where(eq(s.matters.agencyId, ctx.agencyId));
    const reference = `${wf.referencePrefix || "LDG"}-${new Date().getFullYear()}-${String(n + 1).padStart(4, "0")}`;
    const assignee = staff(v.assignedTo) ?? (await pickAssignee(ctx.agencyId, v.visaCode, ctx.userId)).userId;
    const notes = [
      v.goals.length ? `Goals: ${v.goals.join(", ")}.` : "",
      included.length ? `Included in the application: ${included.join(", ")}.` : "",
      planText(v.payment, v.feeProfessional),
      v.instructions ? `Instructions: ${v.instructions}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    const occupation = v.client.mode === "new" ? v.client.occupation : null;
    const [m] = await db
      .insert(s.matters)
      .values({
        agencyId: ctx.agencyId,
        clientId,
        visaCode: v.visaCode,
        reference,
        title: `${visa.name} (${visa.code})${v.stream ? ` · ${v.stream}` : ""}`,
        stream: v.stream,
        stage: "engaged",
        priority: v.priority,
        assignedTo: assignee,
        supervisorId: staff(v.supervisorId),
        employerId: v.employerId,
        dueAt: v.targetLodge,
        feeProfessional: v.feeProfessional != null ? v.feeProfessional.toFixed(2) : null,
        feeGovernment: v.feeGovernment != null ? v.feeGovernment.toFixed(2) : null,
        occupation,
        notes: notes || null,
      })
      .returning({ id: s.matters.id });
    const matterId = m.id;
    if (v.checklist.length) await db.insert(s.checklistItems).values(v.checklist.map((c, i) => ({ agencyId: ctx.agencyId, matterId, category: c.category, label: c.label, required: c.required, sort: i })));
    if (v.tasks.length) await db.insert(s.tasks).values(v.tasks.map((t) => ({ agencyId: ctx.agencyId, title: t.title, dueAt: t.dueAt ? new Date(`${t.dueAt}T09:00:00+10:00`) : null, assignedTo: staff(t.assignee) ?? assignee, clientId, matterId, createdBy: ctx.name })));
    await db.insert(s.activities).values({ agencyId: ctx.agencyId, clientId, matterId, kind: "system", title: `Matter ${reference} opened`, body: notes || `${visa.name} (${visa.code})`, actorId: ctx.userId, actorName: ctx.name });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "create", entity: "matter", entityId: matterId, detail: { visaCode: v.visaCode, via: "open-file" } });
    steps.push({ label: `Matter ${reference} opened`, ok: true, detail: `${v.checklist.length} checklist items · ${v.tasks.length} tasks scheduled` });

    // ── Outward steps: each one independent, so one failing doesn't undo the file ──
    const tryStep = async (label: string, fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, okDetail?: (id?: string) => string) => {
      try {
        const r = await fn();
        steps.push(r.ok ? { label, ok: true, detail: okDetail?.(r.id) } : { label, ok: false, detail: r.error });
        return r.ok;
      } catch (e) {
        steps.push({ label, ok: false, detail: e instanceof Error ? e.message : String(e) });
        return false;
      }
    };
    let reachedClient = false;
    if (v.send.agreement) reachedClient = (await tryStep("Service agreement sent to sign", () => sendAgreement(matterId), (id) => (id === "emailed" ? "Emailed with a sign-in link" : "Ready in the client portal"))) || reachedClient;
    if (v.send.consent.length) {
      reachedClient =
        (await tryStep(
          `Consent forms sent (${v.send.consent.length})`,
          async () => {
            const d = await createSignDraft({ clientId, matterId, origin: "template", templateKeys: v.send.consent, title: v.send.consent.length > 1 ? "New client pack" : undefined });
            if (!d.ok || !d.draft) return d.ok ? { ok: false, error: "Couldn't prepare the forms." } : d;
            return sendSignRequest(d.draft.id, { title: d.draft.title, fields: d.draft.fields, message: `Please read and sign so we can start your ${visa.name} application.` });
          },
          () => "One pack, signed on any device",
        )) || reachedClient;
    }
    if (v.send.documents && v.checklist.length) {
      const items = await db.select({ id: s.checklistItems.id }).from(s.checklistItems).where(eq(s.checklistItems.matterId, matterId));
      const days = v.send.documentsDays ?? 14;
      const due = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
      reachedClient = (await tryStep("Documents requested", () => sendChecklist({ matterId, itemIds: items.map((i) => i.id), dueAt: due, days: 30 }), () => `${items.length} documents, due ${new Date(`${due}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`)) || reachedClient;
    }
    if (v.send.portal && !reachedClient) await tryStep("Client portal invitation", () => inviteClientToPortal(clientId), (id) => (id === "sent" ? "Emailed" : "Portal turned on"));
    else if (v.send.portal) steps.push({ label: "Client portal", ok: true, detail: "Turned on with the first email" });

    updateTag(agencyTag(ctx.agencyId));
    return { ok: true, matterId, clientId, steps };
  } catch (e) {
    return { ok: false, error: e instanceof z.ZodError ? e.issues[0].message : e instanceof Error ? e.message : String(e) };
  }
}
