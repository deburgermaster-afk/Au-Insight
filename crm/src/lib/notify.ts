import "server-only";
import { emailShell, mailDomain, mailEnabled, resend } from "@/lib/mail";

const base = () => process.env.BETTER_AUTH_URL ?? "https://lodgely.mapcn.workers.dev";

/** A short system email to staff (sign-offs, deadlines). Sent from Lodgely, not from the agency's mailboxes. */
export async function notifyStaff(to: string[], subject: string, body: { heading: string; lines: string[]; cta?: { label: string; path: string } }) {
  if (!mailEnabled() || !to.length) return;
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
  const html = `<h1 style="margin:0 0 12px;font-size:19px">${esc(body.heading)}</h1>${body.lines.map((l) => `<p style="margin:0 0 10px">${esc(l)}</p>`).join("")}${
    body.cta ? `<p style="margin-top:20px"><a href="${base()}${body.cta.path}" style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;padding:10px 16px;border-radius:99px;font-size:14px">${esc(body.cta.label)}</a></p>` : ""
  }`;
  await resend("/emails", { method: "POST", body: JSON.stringify({ from: `Lodgely <notifications@${mailDomain()}>`, to, subject, html: emailShell(html, "Sent by Lodgely to staff of your agency."), text: [body.heading, ...body.lines, body.cta ? `${base()}${body.cta.path}` : ""].join("\n\n") }) }).catch((e) => console.error("notify", e));
}
