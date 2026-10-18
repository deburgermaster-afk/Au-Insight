import { eq, sql } from "drizzle-orm";
import { CheckCircle2, FileSignature, XCircle } from "lucide-react";
import { connection } from "next/server";
import { GuidedSigner } from "@/components/sign/guided-signer";
import { db, schema as s } from "@/db";
import { ev, fieldsFor, hashToken, signersOf } from "@/lib/sign-core";

export const metadata = { title: "Sign a document", robots: { index: false, follow: false } };

/** Another signer (sponsor, second parent…) opens their personal link: no account, guided signing. */
export default async function LinkSignPage({ params }: PageProps<"/sign/[token]">) {
  const { token } = await params;
  await connection();
  const h = hashToken(token);
  const [r] = await db.select().from(s.signRequests).where(sql`${s.signRequests.signers} @> ${JSON.stringify([{ tokenHash: h }])}::jsonb`);
  const signers = r ? signersOf(r) : [];
  const me = signers.find((x) => x.tokenHash === h);
  const [org] = r ? await db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, r.agencyId)) : [];
  const [c] = r ? await db.select({ f: s.clients.firstName, l: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, r.clientId)) : [];
  if (r && me && me.status === "pending" && (r.status === "sent" || r.status === "viewed")) {
    const now = new Date().toISOString();
    await db
      .update(s.signRequests)
      .set({ signers: signers.map((x) => (x.id === me.id ? { ...x, status: "viewed" as const, viewedAt: now } : x)), events: sql`${s.signRequests.events} || ${JSON.stringify([ev("viewed", `${me.name} (${me.label})`)])}::jsonb` })
      .where(eq(s.signRequests.id, r.id));
  }
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur-xl">
        <div className="mx-auto flex h-12 max-w-2xl items-center gap-2.5 px-3">
          <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
            <FileSignature className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] leading-tight font-semibold">{org?.name ?? "Lodgely"}</span>
            <span className="block truncate text-[10px] leading-tight text-muted-foreground">Secure e-signing</span>
          </span>
        </div>
      </header>
      <main className="mx-auto grid w-full max-w-2xl gap-3 px-3 pt-3 pb-32">
        {!r || !me || r.status === "draft" ? (
          <section className="flex items-start gap-3 rounded-2xl border p-4">
            <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            <p className="text-sm">This signing link isn&apos;t valid any more. Ask the agency to send you a new one.</p>
          </section>
        ) : r.status === "void" ? (
          <section className="flex items-start gap-3 rounded-2xl border p-4">
            <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
            <p className="text-sm">This request was withdrawn by {org?.name}.</p>
          </section>
        ) : me.status === "signed" || r.status === "signed" ? (
          <section className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
            <div>
              <p className="text-sm font-semibold">Thank you, you&apos;ve signed</p>
              <p className="text-[12px] text-muted-foreground">{org?.name} has your signature. You can close this page.</p>
            </div>
          </section>
        ) : (
          <>
            <header className="grid gap-1 rounded-2xl border bg-card p-3.5">
              <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {me.label} · for {c?.f} {c?.l}
              </p>
              <h1 className="text-lg leading-snug font-semibold tracking-tight">{r.title}</h1>
              <p className="text-[12px] text-muted-foreground">
                {fieldsFor(r, me.id).length} places for you to complete{r.dueAt ? ` · please sign by ${r.dueAt}` : ""}. Tap <b>Start signing</b> and we&apos;ll take you to each one.
              </p>
            </header>
            <GuidedSigner id={r.id} pdfUrl={`/api/sign/link/${token}`} fields={r.fields} expectedName={me.name} signer={me.id} mode={{ kind: "link", token }} others={signers.filter((x) => x.id !== me.id).map((x) => ({ label: x.role === "agent" ? "agent" : x.label, fields: fieldsFor(r, x.id) }))} />
          </>
        )}
      </main>
    </div>
  );
}
