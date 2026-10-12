"use client";

import { CalendarPlus, Clock, GraduationCap, Loader2 } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/components/forms/action-dialog";
import { AreaField, Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { addCpd, logTime, requestLeave, saveMyDetails } from "@/lib/hr-actions";

const today = () => new Date().toISOString().slice(0, 10);

export function LeaveDialog() {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <CalendarPlus /> Request leave
        </Button>
      }
      title="Request leave"
      description="Your manager or HR approves it; approved annual and personal leave comes off your balance."
      action={requestLeave}
      submitLabel="Send request"
      success="Leave requested"
    >
      <SelectField
        label="Type"
        name="kind"
        defaultValue="annual"
        options={[
          { value: "annual", label: "Annual leave" },
          { value: "personal", label: "Personal / carer's leave" },
          { value: "unpaid", label: "Unpaid leave" },
          { value: "other", label: "Other (compassionate, community service…)" },
        ]}
      />
      <Row cols={3}>
        <TextField label="From" name="startDate" type="date" required defaultValue={today()} />
        <TextField label="To" name="endDate" type="date" required defaultValue={today()} />
        <TextField label="Hours" name="hours" type="number" step="0.5" min={0.5} defaultValue="7.6" required />
      </Row>
      <AreaField label="Note" name="note" placeholder="Optional" />
    </ActionDialog>
  );
}

export function TimeDialog({ matters }: { matters: { id: string; label: string }[] }) {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <Clock /> Log time
        </Button>
      }
      title="Log time"
      description="Hourly staff are paid from these hours; billable time on a matter shows on the matter."
      action={logTime}
      submitLabel="Log"
      success="Time logged"
    >
      <Row>
        <TextField label="Date" name="date" type="date" required defaultValue={today()} />
        <TextField label="Hours" name="hours" type="number" step="0.25" min={0.25} max={24} defaultValue="7.6" required />
      </Row>
      <SelectField label="Matter (optional)" name="matterId" options={matters.map((m) => ({ value: m.id, label: m.label }))} />
      <label className="flex items-center gap-3 text-sm">
        <Switch name="billable" /> Billable to the client
      </label>
      <AreaField label="What did you work on?" name="note" />
    </ActionDialog>
  );
}

export function CpdDialog() {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <GraduationCap /> Add CPD
        </Button>
      }
      title="Record CPD"
      description="Keep a record of continuing professional development for your registration renewal."
      action={addCpd}
      submitLabel="Add"
      success="CPD recorded"
    >
      <TextField label="Activity" name="activity" required placeholder="e.g. Skilled visa update webinar" />
      <Row cols={3}>
        <TextField label="Date" name="date" type="date" defaultValue={today()} />
        <TextField label="Provider" name="provider" placeholder="MIA, LIV…" />
        <TextField label="Points" name="points" type="number" step="0.5" min={0.5} defaultValue="1" required />
      </Row>
    </ActionDialog>
  );
}

export function MyDetails({ p }: { p: { phone: string | null; superFund: string | null; bankBsb: string | null; bankAccount: string | null; taxFreeThreshold: boolean } | null }) {
  const [pending, start] = useTransition();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r = await saveMyDetails(f);
          if (r.ok) toast.success("Details saved");
          else toast.error(r.error);
        });
      }}
    >
      <Row>
        <TextField label="Phone" name="phone" defaultValue={p?.phone ?? ""} />
        <TextField label="Super fund" name="superFund" defaultValue={p?.superFund ?? ""} placeholder="Fund name and member number" />
      </Row>
      <Row>
        <TextField label="BSB" name="bankBsb" defaultValue={p?.bankBsb ?? ""} inputMode="numeric" />
        <TextField label="Account number" name="bankAccount" defaultValue={p?.bankAccount ?? ""} inputMode="numeric" />
      </Row>
      <label className="flex items-center gap-3 text-sm">
        <Switch name="taxFreeThreshold" defaultChecked={p?.taxFreeThreshold ?? true} /> Claim the tax-free threshold here (only one employer)
      </label>
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? <Loader2 className="animate-spin" /> : null} Save my details
      </Button>
    </form>
  );
}
