import Link from "next/link";
import { ExpiryPill, Pill, type Tone } from "@/components/app/badges";
import { EditRecord } from "@/components/edit/edit-record";
import type { EditOptions } from "@/lib/edit-data";
import { aud, daysUntil, dmy } from "@/lib/format";
import type { NominationRow } from "@/lib/nomination-data";
import { LMT_STATUSES, programLabel, statusOf } from "@/lib/nominations";
import { plainValues } from "@/lib/record-specs";
import { NominationMenu } from "./nominations";

/** Nominations as rows: position, program, nominee and case, status, dates and what's next. */
export function NominationsTable({ rows, options, caps, showEmployer }: { rows: NominationRow[]; options: EditOptions; caps: string[]; showEmployer?: boolean }) {
  if (!rows.length) return <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">No nominations yet. Add one for each position the employer is sponsoring.</p>;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card shadow-xs">
      <ul className="divide-y">
        {rows.map(({ n, employer, clientName, matterRef, matterVisa, officer }) => {
          const st = statusOf(n.status);
          const lmt = LMT_STATUSES.find((x) => x.value === n.lmt);
          return (
            <li key={n.id} className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{n.positionTitle}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {[showEmployer ? employer : null, programLabel(n.program), n.anzsco ? `ANZSCO ${n.anzsco}` : null, n.salary ? `${aud(Number(n.salary))} p.a.` : null, n.worksite].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="min-w-0 text-xs">
                {clientName ? (
                  <p className="truncate">
                    <span className="text-muted-foreground">Nominee </span>
                    {n.clientId ? (
                      <Link href={`/app/clients/${n.clientId}`} className="hover:underline">
                        {clientName}
                      </Link>
                    ) : (
                      clientName
                    )}
                  </p>
                ) : (
                  <p className="text-muted-foreground">No nominee yet</p>
                )}
                {matterRef ? (
                  <Link href={`/app/matters/${n.matterId}`} className="block truncate text-muted-foreground hover:text-foreground hover:underline">
                    {matterRef} · {matterVisa}
                  </Link>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Pill t={st.tone as Tone}>{st.label}</Pill>
                {n.lmt !== "not_required" && n.lmt !== "done" && !["approved", "refused", "withdrawn", "lapsed"].includes(n.status) ? <Pill t="amber">LMT {lmt?.label.toLowerCase()}</Pill> : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {n.status === "approved" && n.approvalExpires ? (
                  <span className="flex items-center gap-1.5">
                    Lodge visa by {dmy(n.approvalExpires)} <ExpiryPill days={daysUntil(n.approvalExpires)} />
                  </span>
                ) : n.lodgedAt ? (
                  <span>
                    Lodged {dmy(n.lodgedAt)}
                    {n.trn ? ` · TRN ${n.trn}` : ""}
                  </span>
                ) : (
                  <span>Not lodged{officer ? ` · ${officer}` : ""}</span>
                )}
              </div>
              <div className="flex items-center justify-end gap-0.5">
                <EditRecord entity="nomination" id={n.id} values={plainValues(n)} options={options} caps={caps} canDelete title={`Edit ${n.positionTitle}`} />
                <NominationMenu id={n.id} status={n.status} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
