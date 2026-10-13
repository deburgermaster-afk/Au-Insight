import { GitMerge, Plus, Upload } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { Button } from "@/components/ui/button";
import { listClients } from "@/lib/data";
import { ClientsTable } from "./clients-table";

export const metadata = { title: "Clients" };

async function Rows() {
  const rows = await listClients();
  return <ClientsTable rows={rows} />;
}

export default function ClientsPage() {
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
        <Guard cap="clients"><Rows /></Guard>
      </Suspense>
    </>
  );
}
