import { Clock, MapPin, Phone, Video } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingShell } from "@/components/booking/shell";
import { bookingAgency } from "@/lib/booking";
import { aud } from "@/lib/format";
import { modeLabel } from "@/lib/booking-shared";

export async function generateMetadata({ params }: PageProps<"/book/[agency]">) {
  const a = await bookingAgency((await params).agency);
  return { title: a ? `Book with ${a.org.name}` : "Booking" };
}

const ModeIcon = ({ m }: { m: string }) => (m === "phone" ? <Phone className="size-3.5" /> : m === "office" ? <MapPin className="size-3.5" /> : <Video className="size-3.5" />);

export default async function BookAgency({ params }: PageProps<"/book/[agency]">) {
  const { agency } = await params;
  const a = await bookingAgency(agency);
  if (!a) notFound();
  return (
    <BookingShell agency={a.org.name} logo={a.org.logo}>
      <h1 className="text-xl font-semibold tracking-tight">What would you like to book?</h1>
      <p className="mt-1 text-sm text-muted-foreground">Pick an appointment, then a time that suits you. Times are Sydney time.</p>
      <div className="mt-5 grid gap-3">
        {a.types.map((t) => (
          <Link key={t.id} href={`/book/${agency}/${t.slug}`} className="rounded-2xl border bg-card p-4 transition hover:border-primary/50 hover:bg-muted/30">
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t.name}</p>
                {t.description ? <p className="mt-0.5 text-sm text-muted-foreground">{t.description}</p> : null}
                <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" /> {t.minutes} min
                  </span>
                  <span className="flex items-center gap-1">
                    <ModeIcon m={t.mode} /> {modeLabel(t.mode)}
                  </span>
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold">{t.fee && Number(t.fee) > 0 ? aud(t.fee) : "Free"}</span>
            </div>
          </Link>
        ))}
        {!a.types.length ? <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">No appointments are open for online booking right now.</p> : null}
      </div>
    </BookingShell>
  );
}
