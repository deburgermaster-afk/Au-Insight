import { and, eq } from "drizzle-orm";
import { ArrowLeft, CheckCircle2, Circle, Clock3, Download, Eye, PenLine } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Pill } from "@/components/app/badges";
import { Guard } from "@/components/app/guard";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { fileUrl } from "@/components/mail/file-icon";
import { GuidedSigner } from "@/components/sign/guided-signer";
import { SignRequestActions } from "@/components/sign/request-actions";
import { SignerLinkButtons } from "@/components/sign/signer-links";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { dmy, time } from "@/lib/format";
import { getCtx } from "@/lib/session";
import { fieldsFor, signersOf } from "@/lib/sign-core";

export const metadata = { title: "Signature request" };

const tone = { draft: "gray", sent: "blue", viewed: "amber", signed: "green", void: "red" } as const;

async function Detail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await connection();
  const ctx = await getCtx();
  const [r] = await db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, id)));
  if (!r) notFound();
  const [[c], [doc]] = await Promise.all([db.select().from(s.clients).where(eq(s.clients.id, r.clientId)), r.documentId ? db.select({ key: s.documents.storageKey, name: s.documents.name }).from(s.documents).where(eq(s.documents.id, r.documentId)) : Promise.resolve([])]);
  const signers = signersOf(r, `${c.firstName} ${c.lastName}`);
  const agent = signers.find((x) => x.role === "agent");
  const canCountersign = agent && agent.status !== "signed" && (r.status === "sent" || r.status === "viewed") && (!agent.userId || agent.userId === ctx.userId || ["admin", "owner"].includes(ctx.role));
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid content-start gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/app/sign" className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground" aria-label="Back">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold tracking-tight">{r.title}</h1>
            <p className="text-[13px] text-muted-foreground">
              <Link href={`/app/clients/${c.id}`} className="hover:underline">
                {c.firstName} {c.lastName}
              </Link>
              {r.bundle?.length ? ` · pack of ${r.bundle.length} forms` : ""} · sent by {r.sentByName ?? "—"}
              {r.dueAt ? ` · due ${dmy(r.dueAt)}` : ""}
            </p>
          </div>
          <Pill t={tone[r.status as keyof typeof tone] ?? "gray"}>{r.status === "viewed" ? "In progress" : r.status[0].toUpperCase() + r.status.slice(1)}</Pill>
          {doc?.key ? (
            <Button asChild size="sm" variant="outline">
              <a href={fileUrl(doc.key, doc.name)} target="_blank" rel="noreferrer">
                <Download /> Signed PDF
              </a>
            </Button>
          ) : null}
          <SignRequestActions id={r.id} status={r.status} />
        </div>
        {canCountersign ? (
          <Section title={<span className="flex items-center gap-1.5"><PenLine className="size-3.5" /> Your countersignature</span>}>
            <GuidedSigner id={r.id} pdfUrl={`/api/sign/${r.id}`} fields={r.fields} expectedName={agent!.name} signer="agent" mode={{ kind: "agent" }} others={signers.filter((x) => x.role !== "agent").map((x) => ({ label: x.label, fields: fieldsFor(r, x.id) }))} doneText="Countersigned." />
          </Section>
        ) : (
          <Section title="Document">
            <p className="mb-3 text-xs text-muted-foreground">{r.status === "signed" ? "Open the signed PDF above for the completed copy with its signing record." : "The document as sent. Open the signed PDF once everyone has signed."}</p>
            <a href={`/api/sign/${r.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
              <Eye className="size-4" /> View the PDF as sent
            </a>
          </Section>
        )}
      </div>
      <div className="grid content-start gap-4">
        <Section title="Signers">
          <ul className="grid gap-3">
            {signers.map((x) => (
              <li key={x.id} className="grid gap-1.5">
                <p className="flex items-center gap-2 text-sm">
                  {x.status === "signed" ? <CheckCircle2 className="size-4 text-[var(--success)]" /> : x.status === "viewed" ? <Clock3 className="size-4 text-amber-500" /> : <Circle className="size-4 text-muted-foreground" />}
                  <span className="font-medium">{x.role === "agent" ? "Agent countersign" : x.label}</span>
                  <span className="truncate text-muted-foreground">{x.name}</span>
                </p>
                <p className="pl-6 text-xs text-muted-foreground">
                  {fieldsFor(r, x.id).length} fields ·{" "}
                  {x.status === "signed" ? `signed ${x.signedAt ? `${dmy(x.signedAt)} ${time(x.signedAt)}` : ""}${x.ip ? ` · IP ${x.ip}` : ""}` : x.status === "viewed" ? "opened, not signed yet" : x.role === "client" ? "waiting in the client portal" : x.role === "agent" ? "waiting for the agent" : `emailed to ${x.email ?? "—"}`}
                </p>
                {x.role === "other" && x.status !== "signed" && (r.status === "sent" || r.status === "viewed") ? (
                  <span className="pl-6">
                    <SignerLinkButtons id={r.id} signerId={x.id} />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
        <Section title="History">
          <ol className="grid gap-2 text-xs">
            {[...r.events].reverse().map((e, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  {dmy(e.at)} {time(e.at)}
                </span>
                <span>
                  <span className="font-medium capitalize">{e.kind}</span>
                  {e.by ? ` · ${e.by}` : ""}
                  {e.detail && e.kind !== "signed" ? <span className="text-muted-foreground"> · {e.detail}</span> : null}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </div>
  );
}

export default function SignDetailPage({ params }: PageProps<"/app/sign/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Detail params={params} />
      </Guard>
    </Suspense>
  );
}
