import { revalidateTag } from "next/cache";
import { agencyTag } from "@/lib/data";
import { after } from "next/server";
import { ingestReceived, updateDelivery, verifyWebhook } from "@/lib/mail";
import { analyzeMessage } from "@/lib/mail-ai";

// Resend posts inbound mail and delivery events here (signed with Svix).
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyWebhook(body, req.headers)) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(body) as { type: string; data: { email_id?: string; id?: string } };
  const id = event.data.email_id ?? event.data.id;
  if (!id) return Response.json({ ok: true });
  if (event.type !== "email.received") {
    const agencies = await updateDelivery(event.type, id);
    for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
    return Response.json({ ok: true, agencies: agencies.length });
  }
  const { agencies, messages } = await ingestReceived(id);
  for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
  // Understand new mail after replying, so Resend isn't kept waiting on the AI.
  if (messages.length)
    after(async () => {
      for (const m of messages) await analyzeMessage(m).catch((e) => console.error("mail-ai", m, e));
      for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
    });
  return Response.json({ ok: true, agencies: agencies.length });
}
