import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { ImportWizard } from "./wizard";

export const metadata = { title: "Import clients" };

export default function ImportPage() {
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3">
        <Link href="/app/clients" className="mt-1 grid size-8 place-items-center rounded-full border text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clients">
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Import clients</h1>
          <p className="text-[13px] text-muted-foreground">Bring your client list from a spreadsheet or another CRM. Nothing is saved until you press Import.</p>
        </div>
      </div>
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="clients">
          <ImportWizard />
        </Guard>
      </Suspense>
    </div>
  );
}
