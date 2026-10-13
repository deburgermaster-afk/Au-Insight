import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { findDuplicateGroups } from "@/lib/duplicates";
import { canAtLeast, getCtx } from "@/lib/session";
import { DuplicateGroup } from "./merge";

export const metadata = { title: "Duplicate clients" };

async function Groups() {
  await connection();
  const ctx = await getCtx();
  const groups = await findDuplicateGroups(ctx.agencyId);
  if (!groups.length)
    return (
      <div className="flex items-center gap-3 rounded-2xl border bg-card p-5 text-sm">
        <CheckCircle2 className="size-5 text-emerald-500" /> No likely duplicates. Lodgely checks emails, passport numbers, names with dates of birth, and phone numbers.
      </div>
    );
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        {groups.length} group{groups.length === 1 ? "" : "s"} of records that look like the same person.{canAtLeast(ctx.role, "admin") ? "" : " Ask an admin to merge them."}
      </p>
      {groups.map((g) => (
        <DuplicateGroup key={g.members.map((m) => m.id).join()} members={g.members} reasons={g.reasons} canMerge={canAtLeast(ctx.role, "admin")} />
      ))}
    </div>
  );
}

export default function DuplicatesPage() {
  return (
    <div className="grid max-w-5xl gap-5">
      <div className="flex items-start gap-3">
        <Link href="/app/clients" className="mt-1 grid size-8 place-items-center rounded-full border text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clients">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Duplicate clients</h1>
          <p className="text-[13px] text-muted-foreground">Same person entered twice? Merge them so cases, documents and payments live on one record.</p>
        </div>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="clients">
          <Groups />
        </Guard>
      </Suspense>
    </div>
  );
}
