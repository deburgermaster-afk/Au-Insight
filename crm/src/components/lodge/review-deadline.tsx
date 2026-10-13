"use client";

import { CalendarClock, CheckCircle2, Gavel, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import type { ReviewBasis } from "@/db/crm-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { closeReviewDeadline, setReviewDeadline } from "@/lib/review-actions";
import { DECISIONS, type DecisionKind, METHODS, type Method, reviewDeadline } from "@/lib/review-deadline";
import { cn } from "@/lib/utils";

const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const daysLeft = (iso: string) => Math.round((new Date(`${iso}T00:00:00Z`).getTime() - new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z").getTime()) / 864e5);

function Calculator({ matterId, onshore, decisionAt, existing, trigger }: { matterId: string; onshore: boolean; decisionAt: string | null; existing: boolean; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<DecisionKind>(onshore ? "onshore" : "offshoreFamily");
  const [method, setMethod] = useState<Method>("email");
  const [date, setDate] = useState(decisionAt ?? new Date().toISOString().slice(0, 10));
  const [custom, setCustom] = useState(28);
  const [override, setOverride] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const r = useMemo(() => (/^\d{4}-\d{2}-\d{2}$/.test(date) ? reviewDeadline({ decision, method, date, customDays: custom }) : null), [decision, method, date, custom]);
  const field = "h-9 w-full rounded-lg border bg-background px-3 text-sm";
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Change the review deadline" : "Work out the ART deadline"}</DialogTitle>
          <DialogDescription>From how and when the decision was notified. The decision letter states the deadline and always wins: enter it below if it differs.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 text-[13px]">
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Decision</span>
            <select className={field} value={decision} onChange={(e) => setDecision(e.target.value as DecisionKind)}>
              {Object.entries(DECISIONS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label} ({v.days} {v.unit === "working" ? "working days" : "days"})
                </option>
              ))}
              <option value="custom">Other time limit…</option>
            </select>
          </label>
          {decision === "custom" ? (
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">Days to apply</span>
              <input type="number" min={1} max={365} className={field} value={custom} onChange={(e) => setCustom(Number(e.target.value))} />
            </label>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">How it was sent</span>
              <select className={field} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
                {Object.entries(METHODS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5">
              <span className="text-muted-foreground">{method.startsWith("post") ? "Date on the letter" : method === "hand" ? "Date handed over" : "Date the email was sent"}</span>
              <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
          </div>
          {r ? (
            <div className="grid gap-2 rounded-xl border bg-muted/30 p-3">
              <p className="flex items-center gap-2 text-base font-semibold">
                <CalendarClock className="size-4" /> {long(r.dueOn)}
              </p>
              <ul className="grid gap-1 text-[12px] text-muted-foreground">
                {r.explanation.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">Working days skip weekends and national public holidays; state-only holidays aren&apos;t counted.</p>
            </div>
          ) : null}
          <label className="grid gap-1.5">
            <span className="text-muted-foreground">Deadline in the decision letter, if different (optional)</span>
            <input type="date" className={field} value={override} onChange={(e) => setOverride(e.target.value)} />
          </label>
          <div className="flex justify-end">
            <Button
              className="rounded-full"
              disabled={pending || !r}
              onClick={() =>
                start(async () => {
                  const res = await setReviewDeadline(matterId, { decision, method, date, customDays: custom }, override || null);
                  if (!res.ok) return void toast.error(res.error);
                  toast.success(`Deadline saved: ${long(res.id ?? r!.dueOn)}`, { description: "A task is on the agent's list for that day." });
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : <Gavel />} Save deadline
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Matter sidebar card: the tribunal deadline after a refusal or cancellation. */
export function ReviewDeadlineCard({ matterId, dueAt, basis, lodgedAt, outcome, decisionAt, onshore, canEdit }: { matterId: string; dueAt: string | null; basis: ReviewBasis | null; lodgedAt: string | null; outcome: string | null; decisionAt: string | null; onshore: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const close = (lodged: boolean) =>
    start(async () => {
      const r = await closeReviewDeadline(matterId, lodged);
      if (!r.ok) return void toast.error(r.error);
      toast.success(lodged ? "Recorded: review application lodged" : "Deadline removed");
      router.refresh();
    });
  if (!dueAt)
    return (
      <div className="grid gap-2 text-sm">
        <p className="text-muted-foreground">{outcome === "refused" ? "Refused. Work out the last day to apply to the Administrative Review Tribunal." : "If this is refused or cancelled, diarise the review deadline here."}</p>
        {canEdit ? (
          <Calculator matterId={matterId} onshore={onshore} decisionAt={decisionAt} existing={false} trigger={<Button size="sm" variant={outcome === "refused" ? "default" : "outline"} className="justify-self-start rounded-full"><Gavel /> Work out deadline</Button>} />
        ) : null}
      </div>
    );
  const left = daysLeft(dueAt);
  return (
    <div className="grid gap-3 text-sm">
      <div className={cn("rounded-xl border p-3", lodgedAt ? "border-emerald-500/30" : left <= 7 ? "border-rose-500/40 bg-rose-500/[0.04]" : "border-amber-500/30")}>
        <p className="text-[11px] tracking-wide text-muted-foreground uppercase">Last day to apply</p>
        <p className="text-base font-semibold">{long(dueAt)}</p>
        <p className={cn("text-[12px]", lodgedAt ? "text-emerald-500" : left <= 7 ? "text-rose-500" : "text-amber-500")} suppressHydrationWarning>
          {lodgedAt ? (
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="size-3.5" /> Application lodged {lodgedAt}
            </span>
          ) : left < 0 ? `${-left} days ago` : left === 0 ? "Today" : `${left} day${left === 1 ? "" : "s"} left`}
        </p>
      </div>
      {basis ? (
        <ul className="grid gap-1 text-[12px] text-muted-foreground">
          <li className="text-foreground">{basis.decision}</li>
          {basis.explanation.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : null}
      {canEdit && !lodgedAt ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="rounded-full" disabled={pending} onClick={() => close(true)}>
            <CheckCircle2 /> Applied for review
          </Button>
          <Calculator matterId={matterId} onshore={onshore} decisionAt={decisionAt} existing trigger={<Button size="sm" variant="outline" className="rounded-full">Change</Button>} />
          <Button size="icon-sm" variant="ghost" title="Remove deadline" disabled={pending} onClick={() => confirm("Remove the review deadline? Do this only if the client won't seek review.") && close(false)}>
            <Trash2 />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
