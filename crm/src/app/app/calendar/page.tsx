import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { WithPickers } from "@/components/app/with-pickers";
import { NewAppointmentDialog } from "@/components/forms/dialogs";
import { listAppointments } from "@/lib/data";
import { MonthCalendar } from "./month";

export const metadata = { title: "Calendar" };

async function Calendar() {
  const rows = await listAppointments();
  return <MonthCalendar items={rows.map((r) => ({ ...r.appt, clientName: r.clientFirst ? `${r.clientFirst} ${r.clientLast}` : null, staff: r.staff }))} />;
}

export default function CalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" description="Consultations, document checks and interviews across the team." actions={<WithPickers render={(p) => <NewAppointmentDialog pickers={p} />} />} />
      <Suspense fallback={<TableSkeleton />}>
        <Calendar />
      </Suspense>
    </>
  );
}
