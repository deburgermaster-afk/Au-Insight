import { and, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Download, FileSignature, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { fileUrl } from "@/components/mail/file-icon";
import { SignAgreement } from "@/components/portal/sign-agreement";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { requireClient } from "@/lib/client-auth";

export const metadata = { title: "Service agreement" };

const aud = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function AgreementPage({ params }: PageProps<"/client/agreements/[id]">) {
  const { id } = await params;
  await connection();
  const c = await requireClient();
  const [a] = await db.select().from(s.serviceAgreements).where(and(eq(s.serviceAgreements.id, id), eq(s.serviceAgreements.clientId, c.client.id)));
  if (!a) notFound();
  if (a.status === "sent") await db.update(s.serviceAgreements).set({ status: "viewed", viewedAt: new Date() }).where(and(eq(s.serviceAgreements.id, id), eq(s.serviceAgreements.status, "sent")));
  const [doc] = a.documentId ? await db.select({ key: s.documents.storageKey, name: s.documents.name }).from(s.documents).where(eq(s.documents.id, a.documentId)) : [];
  const d = a.content;
  const total = d.fees.reduce((t, f) => t + f.amount, 0);
  return (
    <div className="grid gap-3">
      <Link href="/client" className="flex items-center gap-1 px-0.5 text-[13px] text-muted-foreground">
        <ArrowLeft className="size-4" /> Home
      </Link>

      {a.status === "signed" ? (
        <section className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-3.5">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Signed</p>
            <p className="text-[12px] text-muted-foreground">
              By {a.signerName} on {a.signedAt?.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })}
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
      ) : a.status === "void" ? (
        <section className="flex items-start gap-3 rounded-2xl border border-rose-500/30 p-3.5">
          <XCircle className="mt-0.5 size-5 shrink-0 text-rose-500" />
          <p className="text-[13px]">This agreement was withdrawn. Your agent will send you a new one if needed.</p>
        </section>
      ) : null}

      <article className="grid gap-4 rounded-2xl border bg-card p-4">
        <header className="grid gap-1">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <FileSignature className="size-3.5" /> {d.agency.legalName ?? d.agency.name}
          </p>
          <h1 className="text-lg leading-snug font-semibold tracking-tight">{d.title}</h1>
          <p className="text-[12px] text-muted-foreground">
            {d.matter.reference} · prepared {d.preparedOn}
          </p>
        </header>

        <dl className="grid gap-1.5 rounded-xl bg-muted/40 p-3 text-[13px]">
          {[
            ["Client", d.client.name],
            ["Agency", [d.agency.legalName ?? d.agency.name, d.agency.abn ? `ABN ${d.agency.abn}` : null].filter(Boolean).join(" · ")],
            ["Registered agent", `${d.agency.agent}${d.agency.agentMarn ? ` · MARN ${d.agency.agentMarn}` : ""}`],
            ["Application", `${d.matter.visa}${d.matter.stream ? `, ${d.matter.stream}` : ""}`],
          ].map(([k, v]) => (
            <div key={k} className="grid grid-cols-[38%_1fr] gap-2">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="min-w-0">{v}</dd>
            </div>
          ))}
        </dl>

        <section className="grid gap-1.5">
          <h2 className="text-sm font-semibold">Fee estimate</h2>
          <ul className="grid gap-1 text-[13px]">
            {d.fees.map((f) => (
              <li key={f.label} className="flex justify-between gap-3">
                <span>
                  {f.label}
                  {f.note ? <span className="text-muted-foreground"> ({f.note})</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">{aud(f.amount)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 border-t pt-1.5 font-semibold">
              <span>Total estimate</span>
              <span className="tabular-nums">{aud(total)}</span>
            </li>
          </ul>
        </section>

        {d.sections.map((sec) => (
          <section key={sec.heading} className="grid gap-1.5">
            <h2 className="text-sm font-semibold">{sec.heading}</h2>
            {sec.body.map((p, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-foreground/90">
                {p}
              </p>
            ))}
          </section>
        ))}
      </article>

      {a.status === "sent" || a.status === "viewed" ? <SignAgreement id={a.id} expectedName={`${c.client.firstName} ${c.client.lastName}`} /> : null}
    </div>
  );
}
