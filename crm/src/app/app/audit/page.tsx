import { connection } from "next/server";
import { ScrollText } from "lucide-react";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { label, Pill, type Tone } from "@/components/app/badges";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { TableSkeleton } from "@/components/app/skeletons";
import { RevertButton } from "@/components/undo/revert-button";
import { listAudit } from "@/lib/data";
import { dmy, time } from "@/lib/format";

export const metadata = { title: "Audit log" };

const tone: Record<string, Tone> = { create: "green", update: "blue", delete: "red", role: "amber", login: "violet", restore: "green" };
// Records whose changes can be reversed from here (see undoAudit).
const REVERSIBLE = new Set(["client", "matter", "task", "appointment", "employer", "institution", "application", "dependant", "checklist", "document"]);
const canRevert = (a: { action: string; entity: string; detail: unknown }) =>
  REVERSIBLE.has(a.entity) && ((a.action === "update" && Boolean((a.detail as { changes?: unknown } | null)?.changes)) || (a.action === "delete" && Boolean((a.detail as { snapshot?: unknown } | null)?.snapshot)) || ((a.action === "create" || a.action === "restore") && ["dependant", "checklist", "task", "appointment", "employer", "institution"].includes(a.entity)));

async function Log() {
  await connection();
  const rows = await listAudit();
  return (
    <Section bodyClassName="p-0 sm:p-0">
      <ul>
        {rows.map((a) => (
          <li key={a.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0 sm:px-5">
            <ScrollText className="size-4 shrink-0 text-muted-foreground" />
            <Pill t={tone[a.action] ?? "gray"}>{label(a.action)}</Pill>
            <p className="min-w-0 flex-1 truncate text-sm">
              <span className="font-medium">{a.actorName ?? "System"}</span> <span className="text-muted-foreground">{a.action === "restore" ? "restored" : `${a.action}d`}</span> {a.entity.replace(/_/g, " ")}
              {Array.isArray((a.detail as { summary?: unknown } | null)?.summary) ? <span className="ml-2 text-xs text-muted-foreground">{((a.detail as { summary: string[] }).summary).join(" · ")}</span> : null}
            </p>
            {canRevert(a) ? <RevertButton id={a.id} what={`${a.action === "restore" ? "restore" : a.action} ${a.entity.replace(/_/g, " ")}`} /> : null}
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {dmy(a.createdAt)} {time(a.createdAt)}
            </span>
          </li>
        ))}
        {!rows.length ? <li className="p-10 text-center text-sm text-muted-foreground">Nothing recorded yet.</li> : null}
      </ul>
    </Section>
  );
}

export default function AuditPage() {
  return (
    <>
      <PageHeader title="Audit log" description="Who changed what, and when. Kept for every agency record." />
      <Suspense fallback={<TableSkeleton />}>
        <Guard cap="team"><Log /></Guard>
      </Suspense>
    </>
  );
}
