import { Download, Eye, FileText } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/components/mail/file-icon";
import { listDocuments } from "@/lib/data";
import { daysUntil, dmy } from "@/lib/format";

export const metadata = { title: "Documents" };

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
      <span className="uppercase tracking-wide text-muted-foreground/80">{k}</span>
      <span className="truncate text-right">{v}</span>
    </div>
  );
}

async function Docs() {
  await connection();
  const rows = await listDocuments();
  if (!rows.length) return <p className="rounded-xl border p-10 text-center text-sm text-muted-foreground">No documents yet.</p>;
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {rows.map(({ doc: d, clientFirst, clientLast }) => {
        const days = d.expiresAt ? daysUntil(d.expiresAt) : null;
        const status = days != null && days < 0 ? ["Expired", "text-rose-500"] : d.certified ? ["Verified", "text-emerald-500"] : ["Pending review", "text-amber-500"];
        return (
          <StaggerItem key={d.id} className="flex flex-col rounded-xl border bg-card p-3.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="truncate">{d.name}</span>
            </p>
            <div className="mt-3 grid gap-1.5">
              <Row
                k="Client"
                v={
                  d.clientId ? (
                    <Link href={`/app/clients/${d.clientId}`} className="hover:underline">
                      {clientFirst} {clientLast}
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
              <Row k="Type" v={d.category ?? "Document"} />
              <Row k="Source" v={d.source === "portal" ? "Client portal" : d.source === "email" ? "Email" : "Upload"} />
              <Row k="Uploaded" v={dmy(d.createdAt)} />
              <Row k="Expiry" v={d.expiresAt ? `Valid till ${dmy(d.expiresAt)}` : "N/A"} />
              <Row k="Status" v={<span className={status[1]}>{status[0]}</span>} />
            </div>
            <div className="mt-3.5 grid grid-cols-2 gap-2">
                          {d.storageKey ? (
                            <>
                              <Button size="sm" variant="secondary" asChild>
                                <a href={fileUrl(d.storageKey, d.name)} target="_blank" rel="noreferrer">
                                  <Eye /> View
                                </a>
                              </Button>
                              <Button size="sm" variant="secondary" asChild>
                                <a href={fileUrl(d.storageKey, d.name, true)}>
                                  <Download /> Download
                                </a>
                              </Button>
                            </>
                          ) : (
                            <p className="col-span-2 rounded-md bg-muted/50 px-2 py-1.5 text-center text-[11px] text-muted-foreground">Recorded without a file</p>
                          )}
                        </div>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}

export default function DocumentsPage() {
  return (
    <>
      <PageHeader title="Documents" description="Every document on file, with certification, translation and expiry." />
      <Suspense fallback={<TableSkeleton />}>
        <Guard cap="files"><Docs /></Guard>
      </Suspense>
    </>
  );
}
