import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/skeletons";
import { ContractText } from "@/components/payroll/contract-text";
import { ContractActions } from "@/components/payroll/contracts";
import { Pill } from "@/components/settings/summary";
import { unfilled } from "@/lib/contracts";
import { dmy } from "@/lib/format";
import { getContract } from "@/lib/payroll-data";

export const metadata = { title: "Contract" };

const tone = { draft: "muted", sent: "info", signed: "ok", void: "bad" } as const;

async function Contract({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const c = await getContract((await params).id);
  if (!c || !c.hr) notFound();
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{c.title}</p>
          <p className="text-[12px] text-muted-foreground">
            For {c.name} · issued by {c.createdByName} {dmy(c.createdAt)}
            {c.signedAt ? ` · signed ${dmy(c.signedAt)} as “${c.signedName}”` : c.sentAt ? ` · sent ${dmy(c.sentAt)}` : ""}
          </p>
        </div>
        <Pill tone={tone[c.status as keyof typeof tone] ?? "muted"}>{c.status === "sent" ? "Waiting for signature" : c.status.replace(/^\w/, (x) => x.toUpperCase())}</Pill>
      </div>
      <ContractActions id={c.id} status={c.status} body={c.body} gaps={unfilled(c.body)} />
      <article className="rounded-2xl border bg-card p-6 sm:p-8">
        <ContractText body={c.body} />
      </article>
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
