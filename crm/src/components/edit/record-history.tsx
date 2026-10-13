import { History } from "lucide-react";
import { ago } from "@/lib/format";
import { recordHistory } from "@/lib/edit-data";

const VERB: Record<string, string> = { create: "Created", update: "Changed", delete: "Removed", merge: "Merged", import: "Imported", transfer: "Transferred", handover: "Handed over" };

/** Who changed what on a record, from the audit log. */
export async function RecordHistory({ entity, id, limit = 12 }: { entity: string; id: string; limit?: number }) {
  const rows = (await recordHistory(entity, id)).slice(0, limit);
  if (!rows.length) return <p className="text-[12px] text-muted-foreground">No changes recorded yet.</p>;
  return (
    <ol className="grid gap-2.5">
      {rows.map((r) => {
        const d = (r.detail ?? {}) as { summary?: string[]; note?: string };
        return (
          <li key={r.id} className="flex gap-2 text-[12px]">
            <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{VERB[r.action] ?? r.action}</span> {r.entity !== entity ? <span className="text-muted-foreground">({r.entity.replace(/_/g, " ")})</span> : null} by {r.actorName ?? "someone"} · <span className="text-muted-foreground">{ago(r.createdAt)}</span>
              </p>
              {d.summary?.length ? (
                <ul className="text-muted-foreground">
                  {d.summary.slice(0, 6).map((x, i) => (
                    <li key={i} className="truncate">
                      {x}
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.note && !d.summary?.some((x) => x.includes(d.note!)) ? <p className="text-muted-foreground italic">“{d.note}”</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
