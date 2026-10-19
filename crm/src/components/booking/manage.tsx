"use client";

import { CalendarDays, CalendarX2, Loader2, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelBooking } from "@/lib/booking-actions";
import { BookingFlow } from "./flow";

const TZ = "Australia/Sydney";
const when = (iso: string) => new Date(iso).toLocaleString("en-AU", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", timeZone: TZ });

type Booking = { past: boolean; title: string; startsAt: string; endsAt: string; status: string; videoUrl: string | null; location: string | null; staff: string | null; typeSlug: string | null; minutes: number; mode: string };

/** The client's private page for one booking: join, add to calendar, move or cancel. */
export function ManageBooking({ token, agency, booking: b }: { token: string; agency: string; booking: Booking }) {
  const router = useRouter();
  const [moving, setMoving] = useState(false);
  const [pending, start] = useTransition();
  const past = b.past;
  const cancelled = b.status === "cancelled";
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border bg-card p-5">
        <p className="text-xs text-muted-foreground">{cancelled ? "Cancelled" : past ? "Finished" : "Your booking"}</p>
        <h1 className={`mt-1 text-xl font-semibold tracking-tight ${cancelled ? "line-through opacity-60" : ""}`}>{b.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-sm">
          <CalendarDays className="size-4 text-muted-foreground" /> {when(b.startsAt)} (Sydney time)
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {b.location ?? "Office"}
          {b.staff ? ` · with ${b.staff}` : ""}
        </p>
        {!cancelled && !past ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {b.videoUrl ? (
              <Button asChild>
                <a href={b.videoUrl} target="_blank" rel="noreferrer">
                  <Video /> Join video call
                </a>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <a href={`/api/book/ics/${token}`}>Add to calendar</a>
            </Button>
            {b.typeSlug ? (
              <Button variant="outline" onClick={() => setMoving(!moving)}>
                Reschedule
              </Button>
            ) : null}
            <Button
              variant="ghost"
              className="text-destructive"
              disabled={pending}
              onClick={() => {
                if (!confirm("Cancel this booking?")) return;
                start(async () => {
                  const r = await cancelBooking(token);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Booking cancelled");
                  router.refresh();
                });
              }}
            >
              {pending ? <Loader2 className="animate-spin" /> : <CalendarX2 />} Cancel
            </Button>
          </div>
        ) : cancelled ? (
          <Button asChild variant="outline" className="mt-4">
            <a href={`/book/${agency}`}>Make a new booking</a>
          </Button>
        ) : null}
      </div>
      {moving && b.typeSlug ? (
        <BookingFlow
          agency={agency}
          type={b.typeSlug}
          typeName={b.title}
          minutes={b.minutes}
          mode={b.mode}
          reschedule={{
            token,
            onDone: () => {
              setMoving(false);
              router.refresh();
            },
          }}
        />
      ) : null}
    </div>
  );
}
