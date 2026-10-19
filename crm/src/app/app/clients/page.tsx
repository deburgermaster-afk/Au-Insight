import { and, asc, eq } from "drizzle-orm";
import { GitMerge, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { db, schema as s } from "@/db";
import { listClients } from "@/lib/data";
import { getEditOptions } from "@/lib/edit-data";
import { getCtx } from "@/lib/session";
import { ClientsTable } from "./clients-table";
import { PassportScan } from "@/components/passport/scan";

export const metadata = { title: "Clients" };

async function ScanButton() {
  const ctx = await getCtx();
  return <PassportScan agencyId={ctx.agencyId} />;
}

async function Rows({ segment }: { segment?: string }) {
  const ctx = await getCtx();
  const [rows, segments, options] = await Promise.all([
    listClients(),
    db.select({ id: s.clientSegments.id, name: s.clientSegments.name, filters: s.clientSegments.filters }).from(s.clientSegments).where(and(eq(s.clientSegments.agencyId, ctx.agencyId))).orderBy(asc(s.clientSegments.name)),
    getEditOptions(),
  ]);
  return (
    <ClientsTable
      rows={rows.map((r) => ({ id: r.id, firstName: r.firstName, lastName: r.lastName, email: r.email, phone: r.phone, nationality: r.nationality, passportNumber: r.passportNumber, currentVisa: r.currentVisa, visaExpiry: r.visaExpiry, occupation: r.occupation, stage: r.stage, onshore: r.onshore, matterCount: r.matterCount, assigneeName: r.assigneeName, assignedTo: r.assignedTo, tags: r.tags ?? [], source: r.source }))}
      segments={segments}
      tagOptions={options.lists.tags ?? []}
      staff={options.staff.map((o) => ({ id: o.value, name: o.label }))}
      initialSegment={segment ?? null}
    />
  );
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ segment?: string }> }) {
  const { segment } = await searchParams;
  return (
    <>
      <PageHeader
        title="Clients"
        description="Everyone your agency advises, from first enquiry to grant."
        actions={
          <>
            <Button size="sm" variant="outline" asChild>
              <Link href="/app/clients/duplicates">
                <GitMerge /> Duplicates
              </Link>
            </Button>
            <ScanButton />
            <Button size="sm" variant="outline" asChild>
              <Link href="/app/clients/import">
                <Upload /> Import
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/app/clients/new">
                <Plus /> New client
              </Link>
            </Button>
          </>
        }
      />
      <Suspense fallback={<TableSkeleton />}>
        <Guard cap="clients">
          <Rows segment={segment} />
        </Guard>
      </Suspense>
    </>
  );
}
