import { CheckCircle2 } from "lucide-react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/skeletons";
import { ContractText } from "@/components/payroll/contract-text";
import { SignContract } from "@/components/payroll/contracts";
import { dmy } from "@/lib/format";
import { getContract } from "@/lib/payroll-data";

export const metadata = { title: "My contract" };

async function Contract({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const c = await getContract((await params).id);
  if (!c || !c.mine || c.status === "draft") notFound();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <article className="rounded-2xl border bg-card p-6 sm:p-8">
        <ContractText body={c.body} />
      </article>
      <p className="text-[12px] text-muted-foreground">
        Also read the{" "}
        <a className="underline" href="https://www.fairwork.gov.au/employment-conditions/national-employment-standards/fair-work-information-statement" target="_blank" rel="noreferrer">
          Fair Work Information Statement
        </a>
        .
      </p>
      {c.status === "sent" ? (
        <SignContract id={c.id} suggested={c.name} />
      ) : c.status === "signed" ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-4 text-sm">
          <CheckCircle2 className="size-5 text-emerald-500" />
          <span className="flex-1">
            Signed {dmy(c.signedAt)} as “{c.signedName}”.
          </span>
          {c.pdfKey ? (
            <a className="text-[13px] underline" href={`/api/contracts/${c.id}/pdf`}>
              Download signed copy
            </a>
          ) : null}
        </div>
      ) : (
        <p className="rounded-2xl border p-4 text-sm text-muted-foreground">This contract was withdrawn.</p>
      )}
    </div>
  );
}

export default function Page(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Contract {...props} />
    </Suspense>
  );
}
