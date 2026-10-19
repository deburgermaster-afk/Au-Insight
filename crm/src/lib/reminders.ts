import "server-only";
import { and, eq, gt, isNull, lte, ne } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { appBase, hashToken, manageToken } from "@/lib/booking";
import { dmy, time } from "@/lib/format";

// Appointment reminders: the day before, each client gets an email (and a text message when the agency
// has SMS set up) with the time, how to join, and their reschedule / cancel link.

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const smsEnabled = () => Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM);

/** Australian mobiles to E.164 (04xx xxx xxx → +614xxxxxxxx); anything else is left alone if it already starts with +. */
export function e164(phone: string | null) {
  if (!phone) return null;
  const d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) return d.length >= 10 ? d : null;
  if (/^04\d{8}$/.test(d)) return `+61${d.slice(1)}`;
  if (/^614\d{8}$/.test(d)) return `+${d}`;
  return null;
}

export async function sendSms(to: string, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID!;
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ To: to, From: process.env.TWILIO_FROM!, Body: body }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`SMS: ${(await r.text()).slice(0, 200)}`);
}

/** Reminders for appointments starting in the next 24 hours that were booked more than 2 hours ago. */
export async function sendDueReminders() {
  const { mailEnabled, sendMail } = await import("@/lib/mail");
  // No way to reach anyone: leave appointments unmarked so they're reminded once sending works.
  if (!mailEnabled() && !smsEnabled()) return { due: 0, emailed: 0, texted: 0, skipped: "Email and SMS are both off." };
  const now = Date.now();
  const rows = await db
    .select({ a: s.appointments, first: s.clients.firstName, email: s.clients.email, phone: s.clients.phone, agency: s.organization.name, staff: s.user.name, address: s.agencyProfile.address })
    .from(s.appointments)
    .innerJoin(s.clients, eq(s.clients.id, s.appointments.clientId))
    .innerJoin(s.organization, eq(s.organization.id, s.appointments.agencyId))
    .leftJoin(s.user, eq(s.user.id, s.appointments.staffId))
    .leftJoin(s.agencyProfile, eq(s.agencyProfile.agencyId, s.appointments.agencyId))
    .where(and(ne(s.appointments.status, "cancelled"), isNull(s.appointments.reminderSentAt), gt(s.appointments.startsAt, new Date(now + 60 * 60_000)), lte(s.appointments.startsAt, new Date(now + 24 * 3600_000)), lte(s.appointments.createdAt, new Date(now - 2 * 3600_000))))
    .limit(100);
  let emailed = 0;
  let texted = 0;
  for (const r of rows) {
    const a = r.a;
    // Mark first so a slow send never sends twice.
    await db.update(s.appointments).set({ reminderSentAt: new Date() }).where(eq(s.appointments.id, a.id));
    const token = manageToken(a.id);
    if (!a.manageTokenHash) await db.update(s.appointments).set({ manageTokenHash: hashToken(token) }).where(eq(s.appointments.id, a.id));
    const manage = `${appBase()}/book/manage/${token}`;
    let sentEmail = false;
    let sentSms = false;
    const where = a.videoUrl ? `Video call: ${a.videoUrl}` : a.location === "Phone" ? "Phone call: we'll call you" : `In person${r.address ? ` at ${r.address}` : ""}`;
    if (r.email && mailEnabled()) {
      const [box] = await db.select().from(s.mailboxes).where(and(eq(s.mailboxes.agencyId, a.agencyId), eq(s.mailboxes.kind, "shared")));
      if (box) {
        await sendMail({
          agencyId: a.agencyId,
          from: { address: box.address, name: r.agency },
          to: [r.email],
          subject: `Reminder: your appointment on ${dmy(a.startsAt)} at ${time(a.startsAt)}`,
          html: `<p>Hi ${esc(r.first)},</p><p>A reminder of your appointment with ${esc(r.agency)}:</p><p><b>${esc(dmy(a.startsAt))}, ${esc(time(a.startsAt))}</b> (Sydney time)${r.staff ? ` with ${esc(r.staff)}` : ""}<br/>${esc(where)}</p>${a.videoUrl ? `<p><a href="${a.videoUrl}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-weight:600">Join the video call</a></p>` : ""}<p>Can't make it? <a href="${manage}">Reschedule or cancel</a>.</p>`,
          clientId: a.clientId,
          footer: `Sent by ${r.agency} via Lodgely`,
        })
          .then(() => {
            sentEmail = true;
            emailed++;
          })
          .catch((e) => console.error("reminder email", e));
      }
    }
    const to = e164(r.phone);
    if (to && smsEnabled()) {
      await sendSms(to, `Reminder: ${r.agency} appointment ${dmy(a.startsAt)} ${time(a.startsAt)}. ${a.videoUrl ? `Join: ${a.videoUrl} ` : ""}Change: ${manage}`).then(() => {
        sentSms = true;
        texted++;
      }).catch((e) => console.error("reminder sms", e));
    }
    const via = [sentEmail ? "email" : null, sentSms ? "text message" : null].filter(Boolean);
    if (a.clientId && via.length) await db.insert(s.activities).values({ agencyId: a.agencyId, clientId: a.clientId, kind: "meeting", title: `Reminder sent by ${via.join(" and ")} for ${dmy(a.startsAt)} ${time(a.startsAt)}` });
  }
  return { due: rows.length, emailed, texted };
}
