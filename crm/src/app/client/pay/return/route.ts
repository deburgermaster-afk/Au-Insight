import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { db, schema as s } from "@/db";
import { clientSession } from "@/lib/client-auth";
import { agencyTag } from "@/lib/data";
import { confirmAttempt } from "@/lib/payments";

// The card provider sends the client back here. We ask the provider (server to server) whether it
// was paid before recording anything; the URL alone proves nothing.
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("attempt") ?? "";
  const [a] = id ? await db.select().from(s.paymentAttempts).where(eq(s.paymentAttempts.id, id)) : [];
  if (!a) return NextResponse.redirect(new URL("/client/payments", req.url));
  let status = a.status;
  try {
    status = await confirmAttempt(a);
  } catch (e) {
    console.error("confirm payment", e);
  }
  revalidateTag(agencyTag(a.agencyId), { expire: 0 });
  const c = await clientSession();
  const back = new URL(c && c.client.id === a.clientId ? `/client/payments/${a.invoiceId}` : "/client/sign-in", req.url);
  back.searchParams.set("pay", status === "paid" ? "paid" : "pending");
  return NextResponse.redirect(back);
}
