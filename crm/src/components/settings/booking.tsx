"use client";

import { Check, Copy, ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { BookingHours } from "@/db/crm-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { type BookingTypeInput, deleteBookingType, saveBookingSettings, saveBookingType } from "@/lib/booking-settings-actions";
import { modeLabel } from "@/lib/booking-shared";
import { cn } from "@/lib/utils";

const DAYS: [keyof BookingHours, string][] = [
  ["mon", "Monday"],
  ["tue", "Tuesday"],
  ["wed", "Wednesday"],
  ["thu", "Thursday"],
  ["fri", "Friday"],
  ["sat", "Saturday"],
  ["sun", "Sunday"],
];

export function BookingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-sm">{url}</code>
      <Button
        size="sm"
        variant="outline"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check /> : <Copy />} Copy
      </Button>
      <Button asChild size="sm" variant="outline">
        <a href={url} target="_blank" rel="noreferrer">
          <ExternalLink /> Open
        </a>
      </Button>
    </div>
  );
}

/** On/off and the weekly hours clients can book within (Sydney time). */
export function BookingHoursForm({ enabled: e0, hours: h0, canEdit }: { enabled: boolean; hours: BookingHours; canEdit: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(e0);
  const [hours, setHours] = useState(h0);
  const [pending, start] = useTransition();
  const set = (d: keyof BookingHours, i: number, j: 0 | 1, v: string) => setHours({ ...hours, [d]: hours[d].map((r, k) => (k === i ? (j === 0 ? [v, r[1]] : [r[0], v]) : r)) });
  return (
    <div className="grid gap-4">
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        <span>
          <span className="block font-medium">Take bookings online</span>
          <span className="block text-xs text-muted-foreground">Clients pick a time on your booking page. New people are added as leads.</span>
        </span>
        <Switch checked={enabled} disabled={!canEdit} onCheckedChange={setEnabled} />
      </label>
      <div className="grid gap-1.5">
        {DAYS.map(([d, name]) => (
          <div key={d} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-24 shrink-0">{name}</span>
            {hours[d].length ? null : <span className="text-muted-foreground">Closed</span>}
            {hours[d].map((r, i) => (
              <span key={i} className="flex items-center gap-1">
                <Input type="time" value={r[0]} disabled={!canEdit} onChange={(e) => set(d, i, 0, e.target.value)} className="h-8 w-28" />
                <span className="text-muted-foreground">to</span>
                <Input type="time" value={r[1]} disabled={!canEdit} onChange={(e) => set(d, i, 1, e.target.value)} className="h-8 w-28" />
                {canEdit ? (
                  <Button size="icon-xs" variant="ghost" aria-label="Remove" onClick={() => setHours({ ...hours, [d]: hours[d].filter((_, k) => k !== i) })}>
                    <X />
                  </Button>
                ) : null}
              </span>
            ))}
            {canEdit ? (
              <Button size="xs" variant="ghost" onClick={() => setHours({ ...hours, [d]: [...hours[d], hours[d].length ? ["13:00", "17:00"] : ["09:00", "17:00"]] })}>
                <Plus /> {hours[d].length ? "Add block" : "Open"}
              </Button>
            ) : null}
          </div>
        ))}
      </div>
      {canEdit ? (
        <Button
          className="justify-self-start"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await saveBookingSettings({ enabled, hours });
              if (!r.ok) return void toast.error(r.error);
              toast.success(enabled ? "Online booking is on" : "Saved");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      ) : null}
    </div>
  );
}

type TypeRow = BookingTypeInput & { id: string; slug: string };
const blankType: BookingTypeInput = { name: "Initial consultation", description: "A first conversation about your visa options.", minutes: 30, fee: null, mode: "video", staffIds: [], videoLink: "", bufferMinutes: 10, minNoticeHours: 12, maxDaysAhead: 45, invoiceOnBooking: false, active: true };

/** Appointment types clients can book, with an editor dialog. */
export function BookingTypes({ rows, staff, base, canEdit }: { rows: TypeRow[]; staff: { id: string; name: string }[]; base: string; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ id: string | null; v: BookingTypeInput } | null>(null);
  const [pending, start] = useTransition();
  const v = edit?.v;
  const put = (patch: Partial<BookingTypeInput>) => edit && setEdit({ ...edit, v: { ...edit.v, ...patch } });
  const num = (key: "minutes" | "bufferMinutes" | "minNoticeHours" | "maxDaysAhead", label: string) => (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Input type="number" min={0} value={v?.[key] ?? 0} onChange={(e) => put({ [key]: Number(e.target.value) })} />
    </div>
  );
  return (
    <div className="grid gap-3">
      {rows.map((t) => (
        <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3">
          <div className="min-w-0 flex-1">
            <p className={cn("font-medium", !t.active && "text-muted-foreground line-through")}>{t.name}</p>
            <p className="text-xs text-muted-foreground">
              {t.minutes} min · {modeLabel(t.mode)} · {t.fee ? `$${t.fee}` : "Free"}
              {t.staffIds?.length ? ` · ${t.staffIds.length} staff` : " · any agent"}
            </p>
            <a href={`${base}/${t.slug}`} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">
              {`${base}/${t.slug}`.replace(/^https?:\/\//, "")}
            </a>
          </div>
          {canEdit ? (
            <>
              <Button size="icon-sm" variant="ghost" aria-label={`Edit ${t.name}`} onClick={() => setEdit({ id: t.id, v: { ...t } })}>
                <Pencil />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Delete ${t.name}`}
                onClick={() => {
                  if (!confirm(`Delete "${t.name}"? Existing bookings stay.`)) return;
                  start(async () => {
                    const r = await deleteBookingType(t.id);
                    if (!r.ok) return void toast.error(r.error);
                    router.refresh();
                  });
                }}
              >
                <Trash2 />
              </Button>
            </>
          ) : null}
        </div>
      ))}
      {!rows.length ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">No appointment types yet. Add one so clients have something to book.</p> : null}
      {canEdit ? (
        <Button variant="outline" className="justify-self-start" onClick={() => setEdit({ id: null, v: { ...blankType } })}>
          <Plus /> Add appointment type
        </Button>
      ) : null}

      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Edit appointment type" : "New appointment type"}</DialogTitle>
            <DialogDescription>What clients can book, how long it takes, and who takes it.</DialogDescription>
          </DialogHeader>
          {v ? (
            <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
              <div className="grid gap-1.5">
                <Label>Name</Label>
                <Input value={v.name} onChange={(e) => put({ name: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label>Description</Label>
                <Textarea rows={2} value={v.description ?? ""} onChange={(e) => put({ description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                {num("minutes", "Length (minutes)")}
                <div className="grid gap-1.5">
                  <Label>Fee incl. GST (blank = free)</Label>
                  <Input type="number" min={0} step="0.01" value={v.fee ?? ""} onChange={(e) => put({ fee: e.target.value === "" ? null : Number(e.target.value) })} />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>How you meet</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(["video", "phone", "office", "choice"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => put({ mode: m })} className={cn("rounded-full border px-3 py-1 text-xs", v.mode === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                      {m === "choice" ? "Client chooses" : modeLabel(m)}
                    </button>
                  ))}
                </div>
              </div>
              {v.mode === "video" || v.mode === "choice" ? (
                <div className="grid gap-1.5">
                  <Label>Your meeting link (optional)</Label>
                  <Input value={v.videoLink ?? ""} onChange={(e) => put({ videoLink: e.target.value })} placeholder="https://zoom.us/j/... Leave blank for a private link per booking" />
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label>Who takes these</Label>
                <div className="flex flex-wrap gap-1.5">
                  {staff.map((p) => (
                    <button key={p.id} type="button" onClick={() => put({ staffIds: v.staffIds.includes(p.id) ? v.staffIds.filter((x) => x !== p.id) : [...v.staffIds, p.id] })} className={cn("rounded-full border px-3 py-1 text-xs", v.staffIds.includes(p.id) ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                      {p.name}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">None picked: any agent, supervisor, admin or owner who&apos;s free.</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                {num("bufferMinutes", "Gap after (min)")}
                {num("minNoticeHours", "Notice (hours)")}
                {num("maxDaysAhead", "Book ahead (days)")}
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                Raise an invoice for the fee when booked
                <Switch checked={v.invoiceOnBooking} onCheckedChange={(x) => put({ invoiceOnBooking: x })} />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm">
                Show on the booking page
                <Switch checked={v.active} onCheckedChange={(x) => put({ active: x })} />
              </label>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              disabled={pending}
              onClick={() =>
                edit &&
                start(async () => {
                  const r = await saveBookingType(edit.id, edit.v);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Saved");
                  setEdit(null);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
