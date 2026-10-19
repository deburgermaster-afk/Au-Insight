"use server";

import { and, eq, gte, sql } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { appBase, bookingAgency, googleCalendarUrl, hashToken, newToken, openSlots, pickStaff, videoRoom } from "@/lib/booking";
import { agencyTag } from "@/lib/data";
import { aud, dmy, time } from "@/lib/format";
import { notifyStaff } from "@/lib/notify";

// Public (no sign-in): the booking page and the client's manage link call these.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

async function typeFor(agencySlug: string, typeSlug: string) {
  const a = await bookingAgency(agencySlug);
  const type = a?.types.find((t) => t.slug === typeSlug);
  return a && type ? { a, type } : null;
}

/** Open times for a week (or two) from a date. */
export async function bookingSlots(agencySlug: string, typeSlug: string, from: string): Promise<Result<{ days: { date: string; slots: string[] }[] }>> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) return { ok: false, error: "Bad date." };
  const t = await typeFor(agencySlug, typeSlug);
  if (!t) return { ok: false, error: "This booking page isn't available." };
  const { days } = await openSlots(t.a.org.id, t.a.hours, t.type, from, 7);
  return { ok: true, days };
}

const bookInput = z.object({
  startsAt: z.string().datetime(),
  name: z.string().trim().min(2, "Enter your name.").max(100),
  email: z.string().trim().email("Enter a valid email."),
  phone: z.string().trim().max(30).optional(),
  note: z.string().trim().max(2000).optional(),
  mode: z.enum(["office", "phone", "video"]).optional(),
  /** Honeypot: people never fill this. */
  website: z.string().max(0).optional(),
});

async function sharedMailbox(agencyId: string) {
  const { mailEnabled } = await import("@/lib/mail");
  if (!mailEnabled()) return null;
  const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, agencyId), eq(s.mailboxes.kind, "shared")));
  return box ?? null;
}

const whereText = (mode: string, videoUrl: string | null, address: string | null, phone: string | null) =>
  mode === "video" ? `Video call: ${videoUrl}` : mode === "phone" ? `Phone call: we'll call you${phone ? ` on ${phone}` : ""}` : `In person${address ? `: ${address}` : ""}`;

async function emailClient(opts: { agencyId: string; agencyName: string; to: string; clientId: string; subject: string; html: string }) {
  const box = await sharedMailbox(opts.agencyId);
  if (!box) return;
  const { sendMail } = await import("@/lib/mail");
  await sendMail({ agencyId: opts.agencyId, from: { address: box.address, name: opts.agencyName }, to: [opts.to], subject: opts.subject, html: opts.html, clientId: opts.clientId, footer: `Sent by ${opts.agencyName} via Lodgely` }).catch((e) => console.error("booking email", e));
}

function confirmationHtml(p: { first: string; typeName: string; start: Date; end: Date; where: string; staff: string; manageUrl: string; icsUrl: string; gcalUrl: string; feeLine: string | null; note: string | null }) {
  const btn = (href: string, label: string, dark = false) => `<a href="${href}" style="display:inline-block;margin:4px 6px 4px 0;padding:10px 16px;border-radius:999px;text-decoration:none;font-weight:600;font-size:14px;${dark ? "background:#18181b;color:#fff" : "border:1px solid #d4d4d8;color:#18181b"}">${label}</a>`;
  return `<p>Hi ${esc(p.first)},</p><p>You're booked in. Here are the details:</p>
<table style="border-collapse:collapse;margin:12px 0;font-size:15px">
<tr><td style="padding:4px 16px 4px 0;color:#71717a">What</td><td>${esc(p.typeName)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#71717a">When</td><td><b>${esc(dmy(p.start))}, ${esc(time(p.start))} to ${esc(time(p.end))}</b> (Sydney time)</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#71717a">Where</td><td>${esc(p.where)}</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#71717a">With</td><td>${esc(p.staff)}</td></tr>
${p.feeLine ? `<tr><td style="padding:4px 16px 4px 0;color:#71717a">Fee</td><td>${esc(p.feeLine)}</td></tr>` : ""}
</table>
${p.note ? `<p style="color:#52525b">Your note: ${esc(p.note)}</p>` : ""}
<p>${btn(p.gcalUrl, "Add to Google Calendar")}${btn(p.icsUrl, "Add to Outlook / Apple")}</p>
<p>Need to change it? ${btn(p.manageUrl, "Reschedule or cancel", true)}</p>`;
}

/** Books a time: matches or creates the client (as a lead), assigns a free agent, and emails both sides. */
export async function bookAppointment(agencySlug: string, typeSlug: string, raw: z.input<typeof bookInput>): Promise<Result<{ manage: string }>> {
  try {
    const v = bookInput.parse(raw);
    const t = await typeFor(agencySlug, typeSlug);
    if (!t) return { ok: false, error: "This booking page isn't available." };
    const { a, type } = t;
    const agencyId = a.org.id;
    const startsAt = new Date(v.startsAt);
    const endsAt = new Date(startsAt.getTime() + type.minutes * 60_000);
    // The time must still be open (someone else may have just taken it).
    const day = new Date(startsAt.getTime() + 10 * 3600_000).toISOString().slice(0, 10);
    const { days } = await openSlots(agencyId, a.hours, type, day, 1);
    if (!days.some((d) => d.slots.includes(startsAt.toISOString()))) return { ok: false, error: "That time was just taken. Pick another one." };
    const email = v.email.toLowerCase();
    // A few bookings a day per email at most, to stop abuse of a public form.
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(s.appointments).innerJoin(s.clients, eq(s.clients.id, s.appointments.clientId)).where(and(eq(s.appointments.agencyId, agencyId), eq(s.clients.email, email), gte(s.appointments.createdAt, new Date(Date.now() - 864e5))));
    if (n >= 3) return { ok: false, error: "You've already made several bookings today. Contact the agency directly to book more." };
    const staff = await pickStaff(agencyId, type, startsAt);
    if (!staff) return { ok: false, error: "That time was just taken. Pick another one." };

    const [first, ...rest] = v.name.split(/\s+/);
    let [client] = await db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.email, email)));
    if (!client) {
      [client] = await db
        .insert(s.clients)
        .values({ agencyId, firstName: first, lastName: rest.join(" ") || "-", email, phone: v.phone || null, stage: "lead", source: "Online booking", assignedTo: staff.id, notes: v.note || null })
        .returning();
    }
    const mode = type.mode === "choice" ? (v.mode ?? "video") : type.mode;
    const videoUrl = mode === "video" ? (type.videoLink || videoRoom()) : null;
    const token = newToken();
    await db
      .insert(s.appointments)
      .values({
        agencyId,
        title: `${type.name}: ${v.name}`,
        kind: "consultation",
        startsAt,
        endsAt,
        location: mode === "video" ? "Video" : mode === "phone" ? "Phone" : "Office",
        clientId: client.id,
        staffId: staff.id,
        fee: type.fee,
        notes: v.note || null,
        source: "online",
        bookingTypeId: type.id,
        videoUrl,
        manageTokenHash: hashToken(token),
      });

    let feeLine: string | null = null;
    if (type.fee && Number(type.fee) > 0) {
      feeLine = `${aud(type.fee, 2)}${a.profile.gstRegistered ? " incl. GST" : ""}`;
      if (type.invoiceOnBooking) {
        const total = Number(type.fee);
        const ex = a.profile.gstRegistered ? total / 1.1 : total;
        const next = a.profile.nextInvoiceNumber ?? 1001;
        await db.update(s.agencyProfile).set({ nextInvoiceNumber: next + 1 }).where(eq(s.agencyProfile.agencyId, agencyId));
        await db.insert(s.invoices).values({
          agencyId,
          number: `${a.profile.invoicePrefix ?? "INV"}-${next}`,
          clientId: client.id,
          status: "sent",
          issuedAt: new Date().toISOString().slice(0, 10),
          dueAt: day,
          items: [{ description: `${type.name} on ${dmy(startsAt)}`, quantity: 1, unitPrice: Number(ex.toFixed(2)), gst: a.profile.gstRegistered }],
          subtotal: ex.toFixed(2),
          gst: (total - ex).toFixed(2),
          total: total.toFixed(2),
        });
        feeLine += ". An invoice is in your client portal.";
      }
    }
    await db.insert(s.activities).values({ agencyId, clientId: client.id, kind: "meeting", title: `Booked online: ${type.name}`, body: `${dmy(startsAt)} ${time(startsAt)} with ${staff.name}${v.note ? `\n${v.note}` : ""}` });

    const manageUrl = `${appBase()}/book/manage/${token}`;
    const where = whereText(mode, videoUrl, a.profile.address, v.phone ?? null);
    await emailClient({
      agencyId,
      agencyName: a.org.name,
      to: email,
      clientId: client.id,
      subject: `Booked: ${type.name} on ${dmy(startsAt)} at ${time(startsAt)}`,
      html: confirmationHtml({ first, typeName: type.name, start: startsAt, end: endsAt, where, staff: staff.name, manageUrl, icsUrl: `${appBase()}/api/book/ics/${token}`, gcalUrl: googleCalendarUrl({ start: startsAt, end: endsAt, title: `${type.name} with ${a.org.name}`, details: `${where}\n\nReschedule or cancel: ${manageUrl}`, location: videoUrl ?? a.profile.address }), feeLine, note: v.note ?? null }),
    });
    await notifyStaff([staff.email], `New booking: ${v.name}, ${dmy(startsAt)} ${time(startsAt)}`, {
      heading: `${v.name} booked a ${type.name.toLowerCase()}`,
      lines: [`${dmy(startsAt)}, ${time(startsAt)} to ${time(endsAt)} (Sydney time).`, where, `${email}${v.phone ? ` · ${v.phone}` : ""}`, ...(v.note ? [`Note: ${v.note}`] : [])],
      cta: { label: "Open the client", path: `/app/clients/${client.id}` },
    });
    updateTag(agencyTag(agencyId));
    return { ok: true, manage: `/book/manage/${token}` };
  } catch (e) {
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Check your details." };
    console.error("booking", e);
    return { ok: false, error: "Couldn't book that time. Please try again." };
  }
}

async function apptByToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [r] = await db
    .select({ a: s.appointments, type: s.bookingTypes, agency: s.organization, client: s.clients, staffName: s.user.name, staffEmail: s.user.email })
    .from(s.appointments)
    .innerJoin(s.organization, eq(s.organization.id, s.appointments.agencyId))
    .leftJoin(s.bookingTypes, eq(s.bookingTypes.id, s.appointments.bookingTypeId))
    .leftJoin(s.clients, eq(s.clients.id, s.appointments.clientId))
    .leftJoin(s.user, eq(s.user.id, s.appointments.staffId))
    .where(eq(s.appointments.manageTokenHash, hashToken(token)));
  return r ?? null;
}

/** The client cancels from their manage link. */
export async function cancelBooking(token: string): Promise<Result> {
  const r = await apptByToken(token);
  if (!r) return { ok: false, error: "This link isn't valid any more." };
  if (r.a.status === "cancelled") return { ok: true };
  if (r.a.startsAt.getTime() < Date.now()) return { ok: false, error: "This appointment has already happened." };
  await db.update(s.appointments).set({ status: "cancelled", updatedAt: new Date() }).where(eq(s.appointments.id, r.a.id));
  if (r.a.clientId) await db.insert(s.activities).values({ agencyId: r.a.agencyId, clientId: r.a.clientId, kind: "meeting", title: "Client cancelled their booking", body: `${dmy(r.a.startsAt)} ${time(r.a.startsAt)}` });
  if (r.staffEmail) await notifyStaff([r.staffEmail], `Cancelled: ${r.a.title}`, { heading: "A client cancelled their booking", lines: [`${r.a.title}`, `${dmy(r.a.startsAt)}, ${time(r.a.startsAt)}`], cta: r.a.clientId ? { label: "Open the client", path: `/app/clients/${r.a.clientId}` } : undefined });
  updateTag(agencyTag(r.a.agencyId));
  return { ok: true };
}

/** The client moves their booking to another open time. */
export async function rescheduleBooking(token: string, startsAtIso: string): Promise<Result> {
  try {
    const r = await apptByToken(token);
    if (!r || !r.type) return { ok: false, error: "This link isn't valid any more." };
    if (r.a.status === "cancelled") return { ok: false, error: "This booking was cancelled. Make a new booking instead." };
    const a = await bookingAgency(r.agency.slug);
    if (!a) return { ok: false, error: "Online booking is switched off for this agency." };
    const startsAt = new Date(z.string().datetime().parse(startsAtIso));
    const day = new Date(startsAt.getTime() + 10 * 3600_000).toISOString().slice(0, 10);
    // Free the current time while checking, so a small move is possible.
    await db.update(s.appointments).set({ status: "cancelled" }).where(eq(s.appointments.id, r.a.id));
    const { days } = await openSlots(r.a.agencyId, a.hours, r.type, day, 1);
    const staff = days.some((d) => d.slots.includes(startsAt.toISOString())) ? await pickStaff(r.a.agencyId, r.type, startsAt) : null;
    if (!staff) {
      await db.update(s.appointments).set({ status: "booked" }).where(eq(s.appointments.id, r.a.id));
      return { ok: false, error: "That time was just taken. Pick another one." };
    }
    const endsAt = new Date(startsAt.getTime() + r.type.minutes * 60_000);
    await db.update(s.appointments).set({ status: "booked", startsAt, endsAt, staffId: staff.id, reminderSentAt: null, updatedAt: new Date() }).where(eq(s.appointments.id, r.a.id));
    if (r.a.clientId) await db.insert(s.activities).values({ agencyId: r.a.agencyId, clientId: r.a.clientId, kind: "meeting", title: "Client moved their booking", body: `${dmy(r.a.startsAt)} ${time(r.a.startsAt)} → ${dmy(startsAt)} ${time(startsAt)}` });
    await notifyStaff([staff.email], `Moved: ${r.a.title}`, { heading: "A client moved their booking", lines: [r.a.title, `Now ${dmy(startsAt)}, ${time(startsAt)} (was ${dmy(r.a.startsAt)}, ${time(r.a.startsAt)})`], cta: r.a.clientId ? { label: "Open the client", path: `/app/clients/${r.a.clientId}` } : undefined });
    if (r.client?.email) {
      const manageUrl = `${appBase()}/book/manage/${token}`;
      await emailClient({
        agencyId: r.a.agencyId,
        agencyName: r.agency.name,
        to: r.client.email,
        clientId: r.client.id,
        subject: `Moved: ${r.type.name} is now ${dmy(startsAt)} at ${time(startsAt)}`,
        html: confirmationHtml({ first: r.client.firstName, typeName: r.type.name, start: startsAt, end: endsAt, where: whereText(r.a.location === "Video" ? "video" : r.a.location === "Phone" ? "phone" : "office", r.a.videoUrl, a.profile.address, r.client.phone), staff: staff.name, manageUrl, icsUrl: `${appBase()}/api/book/ics/${token}`, gcalUrl: googleCalendarUrl({ start: startsAt, end: endsAt, title: `${r.type.name} with ${r.agency.name}`, location: r.a.videoUrl ?? a.profile.address }), feeLine: null, note: null }),
      });
    }
    updateTag(agencyTag(r.a.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
