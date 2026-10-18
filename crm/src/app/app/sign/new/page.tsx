import { and, desc, eq, or, sql } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { SignComposer } from "@/components/sign/sign-composer";
import { db, schema as s } from "@/db";
import { getCtx } from "@/lib/session";

export const metadata = { title: "New signature request" };

async function Composer({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);
  const ctx = await getCtx();
  const [clients, matters, docs, [draft]] = await Promise.all([
    db.select({ id: s.clients.id, name: sql<string>`${s.clients.firstName} || ' ' || ${s.clients.lastName}`, email: s.clients.email }).from(s.clients).where(eq(s.clients.agencyId, ctx.agencyId)).orderBy(s.clients.firstName).limit(2000),
    db.select({ id: s.matters.id, clientId: s.matters.clientId, reference: s.matters.reference, title: s.matters.title, visaCode: s.matters.visaCode }).from(s.matters).where(eq(s.matters.agencyId, ctx.agencyId)).orderBy(desc(s.matters.createdAt)).limit(3000),
    db
      .select({ id: s.documents.id, clientId: s.documents.clientId, name: s.documents.name, createdAt: s.documents.createdAt })
      .from(s.documents)
      .where(and(eq(s.documents.agencyId, ctx.agencyId), or(eq(s.documents.mimeType, "application/pdf"), sql`${s.documents.name} ilike '%.pdf'`)))
      .orderBy(desc(s.documents.createdAt))
      .limit(3000),
    one("draft") ? db.select().from(s.signRequests).where(and(eq(s.signRequests.agencyId, ctx.agencyId), eq(s.signRequests.id, one("draft")!), eq(s.signRequests.status, "draft"))) : Promise.resolve([]),
  ]);
  return (
    <SignComposer
      agencyId={ctx.agencyId}
      clients={clients}
      matters={matters}
      docs={docs}
      initial={{
        clientId: draft?.clientId ?? one("client"),
        matterId: draft?.matterId ?? one("matter"),
        templateKey: one("template"),
        documentId: one("doc"),
        draft: draft ? { id: draft.id, fields: draft.fields, pages: draft.pages, method: draft.origin, title: draft.title } : undefined,
      }}
    />
  );
}

export default function NewSignPage({ searchParams }: PageProps<"/app/sign/new">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Composer searchParams={searchParams} />
      </Guard>
    </Suspense>
  );
}
