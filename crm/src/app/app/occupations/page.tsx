import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { listOccupations } from "@/lib/occupations";
import { OccupationSearch } from "./search";

export const metadata = { title: "Occupations" };

async function Results() {
  return <OccupationSearch rows={await listOccupations()} />;
}

export default function OccupationsPage() {
  return (
    <>
      <PageHeader
        title="Occupations"
        description="Look up any ANZSCO occupation: visa options, state eligibility, the SkillSelect EOI backlog, invitation cut-offs and the assessing authority."
      />
      <Suspense fallback={<TableSkeleton />}>
        <Results />
      </Suspense>
    </>
  );
}
