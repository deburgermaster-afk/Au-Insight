import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { WithPickers } from "@/components/app/with-pickers";
import { NewMatterDialog } from "@/components/forms/dialogs";
import { listMatters } from "@/lib/data";
import { MattersBoard } from "./board";

export const metadata = { title: "Matters" };

async function Board() {
  const matters = await listMatters();
  return <MattersBoard matters={matters} />;
}

export default function MattersPage() {
  return (
    <>
      <PageHeader
        title="Matters"
        description="Every application through its stages. Drag a card, or use its menu on a phone."
        actions={<WithPickers render={(p) => <NewMatterDialog pickers={p} />} />}
      />
      <Suspense fallback={<TableSkeleton />}>
        <Board />
      </Suspense>
    </>
  );
}
