"use client";

import { ArrowLeft, CalendarCheck, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { bookAppointment, bookingSlots, rescheduleBooking } from "@/lib/booking-actions";
import { cn } from "@/lib/utils";

const TZ = "Australia/Sydney";
const dayLabel = (d: string) => new Date(`${d}T12:00:00+10:00`).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: TZ });
const longDay = (iso: string) => new Date(iso).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: TZ });
const hm = (iso: string) => new Date(iso).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: TZ });
const addDays = (d: string, n: number) => new Date(new Date(`${d}T12:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
const todaySydney = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });

type Days = { date: string; slots: string[] }[];

/** Pick a day and time, then (for a new booking) enter details. Also used to reschedule from the manage link. */
export function BookingFlow({ agency, type, typeName, minutes, mode, reschedule }: { agency: string; type: string; typeName: string; minutes: number; mode: string; reschedule?: { token: string; onDone: () => void } }) {
  const [from, setFrom] = useState(todaySydney());
  const [days, setDays] = useState<Days | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({ name: "", email: "", phone: "", note: "", mode: "video" as "video" | "phone" | "office", website: "" });

  const load = useCallback(
    (f: string) => {
      bookingSlots(agency, type, f).then((r) => {
        if (!r.ok) return toast.error(r.error);
        setDays(r.days);
        setDay((cur) => (cur && r.days.some((d) => d.date === cur && d.slots.length) ? cur : (r.days.find((d) => d.slots.length)?.date ?? null)));
      });
    },
    [agency, type],
  );
  useEffect(() => load(from), [from, load]);

  if (done)
    return (
      <div className="grid justify-items-center gap-3 rounded-2xl border bg-card p-8 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-500/12 text-emerald-500">
          <CalendarCheck className="size-6" />
        </span>
        <h2 className="text-lg font-semibold">You&apos;re booked in</h2>
        <p className="text-sm text-muted-foreground">
          {typeName}, {slot ? `${longDay(slot)} at ${hm(slot)}` : ""} (Sydney time). We&apos;ve emailed the details, with links to add it to your calendar.
        </p>
        <a href={done} className="text-sm text-primary underline-offset-4 hover:underline">
          Reschedule or cancel
        </a>
      </div>
    );

  const current = days?.find((d) => d.date === day);
  const canPrev = from > todaySydney();

  return (
    <div className="grid gap-5">
      <div className="rounded-2xl border bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-medium">Choose a day</p>
          <div className="flex gap-1">
            <Button size="icon-sm" variant="ghost" disabled={!canPrev} onClick={() => {
                setDays(null);
                setFrom(addDays(from, -7));
              }} aria-label="Previous week">
              <ChevronLeft />
            </Button>
            <Button size="icon-sm" variant="ghost" onClick={() => {
                setDays(null);
                setFrom(addDays(from, 7));
              }} aria-label="Next week">
              <ChevronRight />
            </Button>
          </div>
        </div>
        {days ? (
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {days.map((d) => (
              <button
                key={d.date}
                type="button"
                disabled={!d.slots.length}
                onClick={() => {
                  setDay(d.date);
                  setSlot(null);
                }}
                className={cn("rounded-xl border px-2 py-2 text-center text-xs transition disabled:opacity-35", day === d.date ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}
              >
                <span className="block font-medium">{dayLabel(d.date)}</span>
                <span className="block text-[10px] text-muted-foreground">{d.slots.length ? `${d.slots.length} times` : "Full"}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="grid h-16 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {current ? (
          <div className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {current.slots.map((t) => (
              <button key={t} type="button" onClick={() => setSlot(t)} className={cn("rounded-lg border py-2 text-sm tabular-nums transition", slot === t ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
                {hm(t)}
              </button>
            ))}
          </div>
        ) : days && !days.some((d) => d.slots.length) ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">No times this week. Try the next week.</p>
        ) : null}
      </div>

      {slot && reschedule ? (
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await rescheduleBooking(reschedule.token, slot);
              if (!r.ok) {
                toast.error(r.error);
                return load(from);
              }
              toast.success(`Moved to ${longDay(slot)} at ${hm(slot)}`);
              reschedule.onDone();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <CalendarCheck />} Move to {longDay(slot)}, {hm(slot)}
        </Button>
      ) : null}

      {slot && !reschedule ? (
        <form
          className="grid gap-3 rounded-2xl border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await bookAppointment(agency, type, { startsAt: slot, name: form.name, email: form.email, phone: form.phone || undefined, note: form.note || undefined, mode: mode === "choice" ? form.mode : undefined, website: form.website || undefined });
              if (!r.ok) {
                toast.error(r.error);
                return load(from);
              }
              setDone(r.manage);
            });
          }}
        >
          <div className="flex items-center gap-2">
            <Button type="button" size="icon-sm" variant="ghost" onClick={() => setSlot(null)} aria-label="Change time">
              <ArrowLeft />
            </Button>
            <p className="text-sm">
              <b>{longDay(slot)}</b>, {hm(slot)} · {minutes} min
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="bName">Full name</Label>
              <Input id="bName" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bEmail">Email</Label>
              <Input id="bEmail" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="bPhone">Mobile {mode === "phone" ? "" : "(optional)"}</Label>
              <Input id="bPhone" type="tel" required={mode === "phone"} autoComplete="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            {mode === "choice" ? (
              <div className="grid gap-1.5">
                <Label>How would you like to meet?</Label>
                <div className="flex gap-1.5">
                  {(["video", "phone", "office"] as const).map((m) => (
                    <button key={m} type="button" onClick={() => setForm({ ...form, mode: m })} className={cn("flex-1 rounded-lg border px-2 py-1.5 text-xs capitalize", form.mode === m ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                      {m === "office" ? "In person" : m}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="bNote">What would you like to discuss? (optional)</Label>
            <Textarea id="bNote" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="e.g. my 485 expires in March and I'd like to know my options" />
          </div>
          <input tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} name="website" />
          <p className="text-[11px] text-muted-foreground">Your details go to the agency only, to arrange this appointment.</p>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <CalendarCheck />} Confirm booking
          </Button>
        </form>
      ) : null}
    </div>
  );
}
