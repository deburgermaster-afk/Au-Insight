import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { ensureMailboxes, mailEnabled, sendMail } from "@/lib/mail";
import { positionLabel } from "@/lib/permissions";

/** Emails an invitation from the agency's shared mailbox, with a link to accept it. */
export async function sendInvite(data: { id: string; email: string; role: string; organization: { id: string; name: string; slug: string }; inviter: { user: { id: string; name: string } } }) {
  if (!mailEnabled() || data.email.endsWith(".test")) return;
  const [pos] = await db.select().from(s.invitePositions).where(eq(s.invitePositions.invitationId, data.id));
  const boxes = await ensureMailboxes({ agencyId: data.organization.id, agencySlug: data.organization.slug, agencyName: data.organization.name, userId: data.inviter.user.id, name: data.inviter.user.name });
  const box = boxes.find((b) => b.kind === "shared") ?? boxes[0];
  if (!box) return;
  const base = process.env.BETTER_AUTH_URL ?? "https://lodgely-alpha.vercel.app";
  const url = `${base}/invite/${data.id}`;
  const as = pos ? positionLabel(pos.position) : data.role;
  await sendMail({
    agencyId: data.organization.id,
    from: { address: box.address, name: data.organization.name },
    to: [data.email],
    subject: `${data.inviter.user.name} invited you to ${data.organization.name} on Lodgely`,
    html: `<p>Hi,</p><p><strong>${data.inviter.user.name}</strong> has invited you to join <strong>${data.organization.name}</strong> as <strong>${as}</strong>.</p>
<p style="margin:24px 0"><a href="${url}" style="background:#18181b;color:#ffffff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:600;display:inline-block">Accept invitation</a></p>
<p style="color:#71717a;font-size:13px">You'll get your own login, mailbox and employee portal. This link expires in 7 days.</p>`,
    footer: `Sent by Lodgely for ${data.organization.name}`,
  });
}
