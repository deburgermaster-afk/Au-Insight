"use client";

import { BellRing, Check, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Pill } from "@/components/app/badges";
import { ActionDialog } from "@/components/forms/action-dialog";
import { AreaField, Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { deleteSponsorEvent, markSponsorNotified, recordSponsorEvent } from "@/lib/key-dates-actions";
import { eventLabel, SPONSOR_EVENTS } from "@/lib/sponsor-shared";

const str = (f: FormData, k: string) => {
  const v = f.get(k);
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

export function RecordEventDialog({ employerId, workers, today }: { employerId: string; workers: { id: string; name: string }[]; today: string }) {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <BellRing /> Record a change
        </Button>
      }
      title="Record a notifiable change"
      description="Sponsors must tell Home Affairs within 28 days. Lodgely makes a task due on the last day and reminds the case officer a week before."
      action={(f) => recordSponsorEvent({ employerId, kind: (str(f, "kind") ?? "other") as "other", clientId: str(f, "clientId"), occurredOn: str(f, "occurredOn") ?? "", notes: str(f, "notes") })}
      submitLabel="Record"
      success="Recorded. A task to notify Home Affairs is on the board."
    >
      <SelectField label="What happened" name="kind" required options={Object.entries(SPONSOR_EVENTS).map(([value, d]) => ({ value, label: d.label }))} />
      <Row>
        <SelectField label="Worker (if it's about one)" name="clientId" options={workers.map((w) => ({ value: w.id, label: w.name }))} />
        <TextField label="Date it happened" name="occurredOn" type="date" required max={today} defaultValue={today} />
      </Row>
      <AreaField label="Notes" name="notes" rows={2} placeholder="Last day of work, new address, who told us…" />
    </ActionDialog>
  );
}

type Event = { id: string; kind: string; worker: string | null; clientId: string | null; occurredOn: string; notifyBy: string; notifiedOn: string | null; reference: string | null; notes: string | null; daysLeft: number };

export function SponsorEvents({ rows, today, canDelete }: { rows: Event[]; today: string; canDelete: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!rows.length) return <p className="rounded-2xl border p-6 text-center text-sm text-muted-foreground">No changes recorded. When a sponsored worker leaves, doesn&apos;t start, or the business changes, record it here so the 28-day notice isn&apos;t missed.</p>;
  return (
    <ul className="divide-y rounded-2xl border bg-card">
      {rows.map((e) => (
        <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium">
              {eventLabel(e.kind)}
              {e.worker ? (
                <>
                  {" · "}
                  <Link href={`/app/clients/${e.clientId}`} className="hover:underline">
                    {e.worker}
                  </Link>
                </>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">
              Happened {fmt(e.occurredOn)} · notify by {fmt(e.notifyBy)}
              {e.notifiedOn ? ` · told Home Affairs ${fmt(e.notifiedOn)}${e.reference ? ` (ref ${e.reference})` : ""}` : ""}
              {e.notes ? ` · ${e.notes}` : ""}
            </p>
          </div>
          {e.notifiedOn ? (
            <Pill t={e.notifiedOn > e.notifyBy ? "amber" : "green"}>{e.notifiedOn > e.notifyBy ? "Notified late" : "Notified"}</Pill>
          ) : (
            <>
              <Pill t={e.daysLeft < 0 ? "red" : e.daysLeft <= 7 ? "amber" : "blue"}>{e.daysLeft < 0 ? `${-e.daysLeft} days overdue` : e.daysLeft === 0 ? "Due today" : `${e.daysLeft} days left`}</Pill>
              <ActionDialog
                trigger={
                  <Button size="sm" variant="outline">
                    <Check /> Mark notified
                  </Button>
                }
                title="Home Affairs told"
                description="When the sponsor notification was lodged, and its reference."
                action={(f) => markSponsorNotified({ id: e.id, notifiedOn: str(f, "notifiedOn") ?? "", reference: str(f, "reference") })}
                submitLabel="Save"
                success="Saved. Its task is done."
              >
                <Row>
                  <TextField label="Date lodged" name="notifiedOn" type="date" required max={today} defaultValue={today} />
                  <TextField label="Reference (optional)" name="reference" placeholder="ImmiAccount receipt" />
                </Row>
              </ActionDialog>
            </>
          )}
          {canDelete ? (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Delete"
              disabled={pending}
              onClick={() => {
                if (!confirm("Delete this record? Its open task goes too.")) return;
                start(async () => {
                  const r = await deleteSponsorEvent(e.id);
                  if (!r.ok) return void toast.error(r.error);
                  router.refresh();
                });
              }}
            >
              <Trash2 />
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
