import { revalidateTag } from "next/cache";
import { agencyTag } from "@/lib/data";
import { ingestReceived, updateDelivery, verifyWebhook } from "@/lib/mail";

// Resend posts inbound mail and delivery events here (signed with Svix).
export async function POST(req: Request) {
  const body = await req.text();
  if (!verifyWebhook(body, req.headers)) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(body) as { type: string; data: { email_id?: string; id?: string } };
  const id = event.data.email_id ?? event.data.id;
  if (!id) return Response.json({ ok: true });
  const agencies = event.type === "email.received" ? await ingestReceived(id) : await updateDelivery(event.type, id);
  for (const a of agencies) revalidateTag(agencyTag(a), { expire: 0 });
  return Response.json({ ok: true, agencies: agencies.length });
}
