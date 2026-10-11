import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { getPickers } from "@/lib/data";
import { ClientForm } from "./client-form";

export const metadata = { title: "New client" };

async function Form() {
  const { staff } = await getPickers();
  return <ClientForm staff={staff} />;
}

export default function NewClientPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="New client" description="Only a name is required; fill in the rest as you learn it." />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <Form />
      </Suspense>
    </div>
  );
}
