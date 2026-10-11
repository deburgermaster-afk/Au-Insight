import { connection } from "next/server";
import { FileText } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { ExpiryPill, Pill } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { TableSkeleton } from "@/components/app/skeletons";
import { listDocuments } from "@/lib/data";
import { daysUntil, dmy } from "@/lib/format";

export const metadata = { title: "Documents" };

async function Docs() {
  await connection();
  const rows = await listDocuments();
  return (
    <Section bodyClassName="p-0 sm:p-0">
      <ul>
        {rows.map(({ doc: d, clientFirst, clientLast }) => (
          <li key={d.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <FileText className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {d.clientId ? (
                  <Link href={`/app/clients/${d.clientId}`} className="hover:text-primary">
                    {clientFirst} {clientLast}
                  </Link>
                ) : null}
                {` · ${d.category ?? "Document"} · ${dmy(d.createdAt)}`}
              </p>
            </div>
            <div className="hidden gap-1.5 sm:flex">
              {d.certified ? <Pill t="green">Certified</Pill> : null}
              {d.translated ? <Pill t="blue">Translated</Pill> : null}
            </div>
            {d.expiresAt ? <ExpiryPill days={daysUntil(d.expiresAt)} /> : null}
          </li>
        ))}
        {!rows.length ? <li className="p-10 text-center text-sm text-muted-foreground">No documents yet. Uploads arrive with file storage, coming next.</li> : null}
      </ul>
    </Section>
  );
}

export default function DocumentsPage() {
  return (
    <>
      <PageHeader title="Documents" description="Every document on file, with certification, translation and expiry." />
      <Suspense fallback={<TableSkeleton />}>
        <Docs />
      </Suspense>
    </>
  );
}
