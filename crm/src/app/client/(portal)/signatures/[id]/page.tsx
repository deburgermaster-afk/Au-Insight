import { and, eq, ne, sql } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Download, FileSignature, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fileUrl } from "@/components/mail/file-icon";
import { GuidedSigner } from "@/components/sign/guided-signer";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { requireClient } from "@/lib/client-auth";
import { fieldsFor, signersOf } from "@/lib/sign-core";
import { Clock3, CreditCard } from "lucide-react";

export const metadata = { title: "Sign a document" };

export default async function SignPage({ params }: PageProps<"/client/signatures/[id]">) {
  const { id } = await params;
  await connection();
  const c = await requireClient();
  const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.id, id), eq(s.signRequests.clientId, c.client.id), ne(s.signRequests.status, "draft")));
  if (!r) notFound();
  if (r.status === "sent") {
    await db
      .update(s.signRequests)
      .set({ status: "viewed", viewedAt: new Date(), events: sql`${s.signRequests.events} || ${JSON.stringify([{ at: new Date().toISOString(), kind: "viewed", by: `${c.client.firstName} ${c.client.lastName}` }])}::jsonb` })
      .where(and(eq(s.signRequests.id, id), eq(s.signRequests.status, "sent")));
    await db.insert(s.activities).values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "document", title: `Opened to sign: ${r.title}`, actorName: `${c.client.firstName} ${c.client.lastName}` });
  }
  const [doc] = r.documentId ? await db.select({ key: s.documents.storageKey, name: s.documents.name }).from(s.documents).where(eq(s.documents.id, r.documentId)) : [];
  const signers = signersOf(r, `${c.client.firstName} ${c.client.lastName}`);
  const me = signers.find((x) => x.role === "client");
  const waitingOn = signers.filter((x) => x.role !== "client" && x.status !== "signed");
  const count = fieldsFor(r, "client").length;
  const [inv] = r.invoiceId ? await db.select({ id: s.invoices.id, number: s.invoices.number, total: s.invoices.total, paid: s.invoices.paid }).from(s.invoices).where(eq(s.invoices.id, r.invoiceId)) : [];
  const owing = inv ? Math.max(0, Number(inv.total) - Number(inv.paid)) : 0;
  return (
    <div className="grid gap-3">
      <Link href="/client" className="flex items-center gap-1 px-0.5 text-[13px] text-muted-foreground">
        <ArrowLeft className="size-4" /> Home
      </Link>
      <header className="grid gap-1 rounded-2xl border bg-card p-3.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <FileSignature className="size-3.5" /> {c.agency.name}
        </p>
        <h1 className="text-lg leading-snug font-semibold tracking-tight">{r.title}</h1>
        {r.message ? <p className="whitespace-pre-line text-[13px] text-muted-foreground">{r.message}</p> : null}
        {r.status === "sent" || r.status === "viewed" ? (
          <p className="text-[12px] text-muted-foreground">
            {count} place{count === 1 ? "" : "s"} to complete{r.dueAt ? ` · please sign by ${r.dueAt}` : ""}. Tap <b>Start signing</b> and we&apos;ll take you to each one.
          </p>
        ) : null}
      </header>
      {r.status === "signed" ? (
        <section className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Signed and sent</p>
            <p className="text-[12px] text-muted-foreground">
              By {r.signerName} on {r.signedAt?.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })}
            </p>
          </div>
          {doc?.key ? (
            <Button asChild size="sm" variant="outline" className="rounded-full">
              <a href={fileUrl(doc.key, doc.name, true)}>
                <Download /> PDF
              </a>
            </Button>
          ) : null}
        </section>
      ) : r.status === "void" ? (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-500/30 p-3.5">
          <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
          <p className="text-[13px]">This request was withdrawn. Your agent will send a new one if needed.</p>
        </section>
      ) : me?.status === "signed" ? (
        <section className="flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/[0.05] p-3.5">
          <Clock3 className="mt-0.5 size-5 shrink-0 text-sky-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">You&apos;ve signed</p>
            <p className="text-[12px] text-muted-foreground">Waiting for {waitingOn.map((x) => (x.role === "agent" ? `your agent (${x.name})` : `${x.label.toLowerCase()} ${x.name}`)).join(", ")}. You&apos;ll find the signed copy in your documents once everyone has signed.</p>
          </div>
        </section>
      ) : (
        <GuidedSigner
          id={r.id}
          pdfUrl={`/api/sign/${r.id}`}
          fields={r.fields}
          expectedName={`${c.client.firstName} ${c.client.lastName}`}
          others={signers.filter((x) => x.role !== "client").map((x) => ({ label: x.role === "agent" ? "agent" : x.label, fields: fieldsFor(r, x.id) }))}
        />
      )}
      {inv && owing > 0.005 && (r.status === "signed" || me?.status === "signed") ? (
        <Link href={`/client/payments/${inv.id}`} className="flex items-center gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/[0.06] p-3.5 transition active:scale-[.98]">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600">
            <CreditCard className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Next: pay invoice {inv.number}</span>
            <span className="block text-[12px] text-muted-foreground">${owing.toLocaleString("en-AU", { minimumFractionDigits: 2 })} owing · pay by card or bank transfer</span>
          </span>
        </Link>
      ) : null}
    </div>
  );
}
