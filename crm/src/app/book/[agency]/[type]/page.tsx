import { ArrowLeft, Clock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingFlow } from "@/components/booking/flow";
import { BookingShell } from "@/components/booking/shell";
import { bookingAgency } from "@/lib/booking";
import { aud } from "@/lib/format";
import { modeLabel } from "@/lib/booking-shared";

export async function generateMetadata({ params }: PageProps<"/book/[agency]/[type]">) {
  const { agency, type } = await params;
  const a = await bookingAgency(agency);
  const t = a?.types.find((x) => x.slug === type);
  return { title: t && a ? `${t.name} · ${a.org.name}` : "Booking" };
}

export default async function BookType({ params }: PageProps<"/book/[agency]/[type]">) {
  const { agency, type } = await params;
  const a = await bookingAgency(agency);
  const t = a?.types.find((x) => x.slug === type);
  if (!a || !t) notFound();
  return (
    <BookingShell agency={a.org.name} logo={a.org.logo}>
      <Link href={`/book/${agency}`} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> All appointments
      </Link>
      <h1 className="text-xl font-semibold tracking-tight">{t.name}</h1>
      <p className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-4" /> {t.minutes} min
        </span>
        <span>{modeLabel(t.mode)}</span>
        <span>{t.fee && Number(t.fee) > 0 ? `${aud(t.fee, 2)}${a.profile.gstRegistered ? " incl. GST" : ""}` : "Free"}</span>
      </p>
      {t.description ? <p className="mt-2 text-sm text-muted-foreground">{t.description}</p> : null}
      <div className="mt-5">
        <BookingFlow agency={agency} type={t.slug} typeName={t.name} minutes={t.minutes} mode={t.mode} />
      </div>
    </BookingShell>
  );
}
