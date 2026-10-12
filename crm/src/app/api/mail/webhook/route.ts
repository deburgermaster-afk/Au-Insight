import { revalidateTag } from "next/cache";
import { agencyTag } from "@/lib/data";
import { after } from "next/server";
import { ingestReceived, updateDelivery, verifyWebhook } from "@/lib/mail";
import { analyzeMessage } from "@/lib/mail-ai";
import { resendToken } from "@/lib/resend-connect";
import { decrypt } from "@/lib/secure";
import { db, schema as s } from "@/db";
import { eq } from "drizzle-orm";

// Resend posts inbound mail and delivery events here (signed with Svix). Lodgely's own account
// uses RESEND_WEBHOOK_SECRET; an agency's connected account posts to ?c=<connector> with its own secret.
export async function POST(req: Request) {
  const body = await req.text();
  const cid = new URL(req.url).searchParams.get("c");
  let via: { token: string; agencyId: string } | undefined;
  if (cid) {
    const [c] = await db.select().from(s.connectors).where(eq(s.connectors.id, cid));
    if (!c?.webhookSecret || !verifyWebhook(body, req.headers, decrypt(c.webhookSecret))) return new Response("bad signature", { status: 401 });
    via = { token: await resendToken(c), agencyId: c.agencyId };
  } else if (!verifyWebhook(body, req.headers)) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(body) as { type: string; data: { email_id?: string; id?: string } };
  const id = event.data.email_id ?? event.data.id;
  if (!id) return Response.json({ ok: true });
  if (event.type !== "email.received") {
    const agencies = await updateDelivery(event.type, id);
    for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
    return Response.json({ ok: true, agencies: agencies.length });
  }
  const { agencies, messages } = await ingestReceived(id, via);
  for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
  // Understand new mail after replying, so Resend isn't kept waiting on the AI.
  if (messages.length)
    after(async () => {
      for (const m of messages) await analyzeMessage(m).catch((e) => console.error("mail-ai", m, e));
      for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
    });
  return Response.json({ ok: true, agencies: agencies.length });
}
