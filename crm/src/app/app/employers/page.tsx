import { connection } from "next/server";
import { BadgeCheck, Building2, Mail, Phone } from "lucide-react";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { ExpiryPill, Pill } from "@/components/app/badges";
import { Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { NewEmployerDialog } from "@/components/forms/dialogs";
import { listEmployers } from "@/lib/data";
import { daysUntil } from "@/lib/format";
import { EditRecord } from "@/components/edit/edit-record";
import { getEditOptions } from "@/lib/edit-data";
import { plainValues } from "@/lib/record-specs";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Employers" };

async function Employers() {
  await connection();
  const [rows, options, ctx] = await Promise.all([listEmployers(), getEditOptions(), getCtx()]);
  if (!rows.length) return <p className="rounded-2xl border p-10 text-center text-sm text-muted-foreground">No sponsoring employers yet.</p>;
  return (
    <Stagger className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ employer: e, matters }) => (
        <StaggerItem key={e.id}>
          <div className="h-full rounded-2xl border bg-card p-5 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-start gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary/20 to-fuchsia-500/20 text-primary">
                <Building2 className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 font-semibold">
                  <span className="min-w-0 flex-1 truncate">{e.name}</span>
                  <EditRecord entity="employer" id={e.id} values={plainValues(e)} options={options} caps={ctx.caps} canDelete={ctx.caps.includes("team")} />
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.industry ?? "—"}
                  {e.abn ? ` · ABN ${e.abn}` : ""}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {e.sbsApproved ? (
                <Pill t="green">
                  <BadgeCheck className="size-3" /> SBS approved
                </Pill>
              ) : (
                <Pill>Not a sponsor</Pill>
              )}
              {e.sbsExpiry ? <ExpiryPill days={daysUntil(e.sbsExpiry)} /> : null}
              <Pill t="violet">
                {matters} matter{matters === 1 ? "" : "s"}
              </Pill>
            </div>
            <div className="mt-4 grid gap-1 border-t pt-3 text-sm text-muted-foreground">
              {e.contactName ? <p className="truncate font-medium text-foreground">{e.contactName}</p> : null}
              {e.contactEmail ? (
                <a href={`mailto:${e.contactEmail}`} className="flex items-center gap-1.5 truncate hover:text-foreground">
                  <Mail className="size-3.5" /> {e.contactEmail}
                </a>
              ) : null}
              {e.phone ? (
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5" /> {e.phone}
                </span>
              ) : null}
            </div>
          </div>
        </StaggerItem>
      ))}
    </Stagger>
  );
}

export default function EmployersPage() {
  return (
    <>
      <PageHeader title="Employers" description="Sponsors for 482, 186, 494 and labour agreement matters." actions={<NewEmployerDialog />} />
      <Suspense fallback={<TableSkeleton />}>
        <Guard cap="clients"><Employers /></Guard>
      </Suspense>
    </>
  );
}
