import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { TableSkeleton } from "@/components/app/skeletons";
import { WithPickers } from "@/components/app/with-pickers";
import { NewAppointmentDialog } from "@/components/forms/dialogs";
import { listAppointments } from "@/lib/data";
import { getEditOptions } from "@/lib/edit-data";
import { getCtx } from "@/lib/session";
import { MonthCalendar } from "./month";

export const metadata = { title: "Calendar" };

async function Calendar() {
  const [rows, options, ctx] = await Promise.all([listAppointments(), getEditOptions(), getCtx()]);
  return <MonthCalendar items={rows.map((r) => ({ ...r.appt, clientName: r.clientFirst ? `${r.clientFirst} ${r.clientLast}` : null, staff: r.staff }))} options={options} caps={ctx.caps} />;
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
