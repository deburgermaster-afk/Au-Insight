import { and, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { DraftEditor } from "@/components/ai/drafts";
import { db, schema as s } from "@/db";
import { DRAFT_KINDS, type DraftKind } from "@/lib/drafting";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Draft" };

async function Draft({ params }: PageProps<"/app/matters/[id]/drafts/[draftId]">) {
  await connection();
  const [{ id, draftId }, ctx] = await Promise.all([params, getCtx()]);
  const [d] = await db.select().from(s.drafts).where(and(eq(s.drafts.agencyId, ctx.agencyId), eq(s.drafts.id, draftId), eq(s.drafts.matterId, id)));
  if (!d) notFound();
  const [m] = await db.select({ reference: s.matters.reference, title: s.matters.title }).from(s.matters).where(eq(s.matters.id, id));
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/app/matters/${id}`} className="grid size-8 place-items-center rounded-full border text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Back">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <p className="font-mono text-xs text-muted-foreground">
            {m?.reference} · {DRAFT_KINDS[d.kind as DraftKind]?.title ?? d.kind}
          </p>
          <p className="text-[12px] text-muted-foreground" suppressHydrationWarning>
            Drafted by AI for {d.createdByName} · last saved {d.updatedAt.toLocaleString("en-AU", { timeZone: "Australia/Sydney", dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
      </div>
      <DraftEditor id={d.id} matterId={id} title={d.title} body={d.body} checks={d.checks ?? []} />
    </div>
  );
}

export default function DraftPage(props: PageProps<"/app/matters/[id]/drafts/[draftId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Draft {...props} />
      </Guard>
    </Suspense>
  );
}
