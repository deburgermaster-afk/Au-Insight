import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { FilePlus2, PenLine, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { SignList } from "@/components/sign/sign-list";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { TemplatePicker } from "@/components/sign/template-picker";
import { getCtx } from "@/lib/session";
import { agencyTemplates } from "@/lib/agency-templates";

export const metadata = { title: "E-sign" };

async function SignView({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const ctx = await getCtx();
  const [templates, toCountersign] = await Promise.all([
    agencyTemplates(ctx.agencyId),
    db
      .select({ id: s.signRequests.id, title: s.signRequests.title, signers: s.signRequests.signers, clientName: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}` })
      .from(s.signRequests)
      .innerJoin(s.clients, eq(s.clients.id, s.signRequests.clientId))
      .where(and(eq(s.signRequests.agencyId, ctx.agencyId), inArray(s.signRequests.status, ["sent", "viewed"]), sql`${s.signRequests.signers} @> ${JSON.stringify([{ role: "agent", status: "pending" }])}::jsonb`)),
  ]);
  const mine = toCountersign.filter((r) => r.signers.some((x) => x.role === "agent" && x.status !== "signed" && (x.userId === ctx.userId || ["admin", "owner"].includes(ctx.role))));
  const canEdit = ctx.role === "admin" || ctx.role === "owner";
  const filter = typeof sp.show === "string" ? sp.show : "open";
  const where =
    filter === "signed" ? inArray(s.signRequests.status, ["signed"]) : filter === "drafts" ? eq(s.signRequests.status, "draft") : filter === "all" ? ne(s.signRequests.status, "__") : inArray(s.signRequests.status, ["sent", "viewed"]);
  const [rows, counts] = await Promise.all([
    db
      .select({ r: s.signRequests, clientName: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}`, signedKey: s.documents.storageKey, signedName: s.documents.name })
      .from(s.signRequests)
      .innerJoin(s.clients, eq(s.clients.id, s.signRequests.clientId))
      .leftJoin(s.documents, eq(s.documents.id, s.signRequests.documentId))
      .where(and(eq(s.signRequests.agencyId, ctx.agencyId), where))
      .orderBy(desc(s.signRequests.updatedAt))
      .limit(200),
    db.select({ status: s.signRequests.status, n: sql<number>`count(*)::int` }).from(s.signRequests).where(eq(s.signRequests.agencyId, ctx.agencyId)).groupBy(s.signRequests.status),
  ]);
  const n = (st: string[]) => counts.filter((c) => st.includes(c.status)).reduce((t, c) => t + c.n, 0);
  const tabs = [
    ["open", "Awaiting signature", n(["sent", "viewed"])],
    ["signed", "Signed", n(["signed"])],
    ["drafts", "Drafts", n(["draft"])],
    ["all", "All", n(["sent", "viewed", "signed", "void", "draft"])],
  ] as const;
  return (
    <>
      <HeaderActions>
        <Button asChild size="sm" className="rounded-full">
          <Link href="/app/sign/new">
            <FilePlus2 /> New signature request
          </Link>
        </Button>
      </HeaderActions>
      {mine.length ? (
        <section className="mb-4 grid gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-3.5">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <PenLine className="size-4 text-amber-500" /> Waiting for your countersignature
          </p>
          <ul className="grid gap-1">
            {mine.map((r) => {
              const others = r.signers.filter((x) => x.role !== "agent");
              const ready = others.every((x) => x.status === "signed");
              return (
                <li key={r.id}>
                  <Link href={`/app/sign/${r.id}`} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50">
                    <span className="min-w-0 flex-1 truncate">{r.title} · {r.clientName}</span>
                    <span className="text-xs text-muted-foreground">{ready ? "Everyone else has signed" : `${others.filter((x) => x.status === "signed").length}/${others.length} signed`}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
        <Section
          title="Signature requests"
          action={
            <nav className="flex gap-1">
              {tabs.map(([k, l, c]) => (
                <Link key={k} href={`/app/sign?show=${k}`} className={`rounded-full px-2.5 py-1 text-xs ${filter === k ? "bg-foreground text-background" : "text-muted-foreground hover:bg-muted"}`}>
                  {l} {c ? <span className="opacity-70">{c}</span> : null}
                </Link>
              ))}
            </nav>
          }
        >
          <SignList rows={rows.map((x) => ({ ...x.r, clientName: x.clientName, signedKey: x.signedKey, signedName: x.signedName }))} empty={filter === "open" ? "Nothing waiting on clients. Send a consent form or a PDF to sign." : "Nothing here."} />
        </Section>
        <Section title={`Consent form templates · ${templates.length}`} action={<span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Sparkles className="size-3" /> Auto-filled</span>}>
          <p className="mb-3 text-xs text-muted-foreground">Each form fills in your agency, ABN, the responsible registered agent and MARN, and the client&apos;s details and matter when you send it, on one A4 page with the signature fields placed. Pick a client when sending to see the forms their case needs first.</p>
          {canEdit ? (
            <Button asChild size="xs" variant="outline" className="mb-3">
              <Link href="/app/sign/templates/new">
                <FilePlus2 /> New template
              </Link>
            </Button>
          ) : null}
          <TemplatePicker templates={templates} compact hrefBase="/app/sign/new?template=" editBase={canEdit ? "/app/sign/templates/" : undefined} />
        </Section>
      </div>
    </>
  );
}

export default function SignPage({ searchParams }: PageProps<"/app/sign">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <SignView searchParams={searchParams} />
      </Guard>
    </Suspense>
  );
}
