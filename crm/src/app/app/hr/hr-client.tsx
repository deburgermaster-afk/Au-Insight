"use client";

import { Check, Loader2, Pencil, Play, Trash2, X } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/components/forms/action-dialog";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { createPayRun, decideLeave, deletePayRun, finalisePayRun, saveStaff } from "@/lib/hr-actions";
import { positions } from "@/lib/permissions";

type Profile = {
  position: string;
  title: string | null;
  phone: string | null;
  marn: string | null;
  marnExpiry: string | null;
  qeac: string | null;
  employment: string;
  startDate: string | null;
  payType: string;
  payRate: string | null;
  hoursPerWeek: string;
  superRate: string;
  managerId: string | null;
} | null;

export function EditStaff({ userId, name, p, managers }: { userId: string; name: string; p: Profile; managers: { id: string; name: string }[] }) {
  return (
    <ActionDialog
      trigger={
        <Button size="icon-xs" variant="ghost" aria-label={`Edit ${name}`}>
          <Pencil />
        </Button>
      }
      title={`Edit ${name}`}
      description="Position decides what they can see and do. A current MARN is needed to give immigration assistance or lodge."
      action={(f) => saveStaff(userId, f)}
      submitLabel="Save"
      success="Staff record saved"
      wide
    >
      <Row>
        <SelectField label="Position" name="position" defaultValue={p?.position ?? "consultant"} options={positions.map((x) => ({ value: x.key, label: x.label }))} />
        <TextField label="Job title" name="title" defaultValue={p?.title ?? ""} placeholder="Senior migration agent" />
      </Row>
      <Row cols={3}>
        <TextField label="MARN" name="marn" defaultValue={p?.marn ?? ""} inputMode="numeric" />
        <TextField label="MARN expiry" name="marnExpiry" type="date" defaultValue={p?.marnExpiry ?? ""} />
        <TextField label="QEAC (education)" name="qeac" defaultValue={p?.qeac ?? ""} />
      </Row>
      <Row cols={3}>
        <SelectField
          label="Employment"
          name="employment"
          defaultValue={p?.employment ?? "full_time"}
          options={[
            { value: "full_time", label: "Full time" },
            { value: "part_time", label: "Part time" },
            { value: "casual", label: "Casual" },
            { value: "contractor", label: "Contractor" },
          ]}
        />
        <TextField label="Start date" name="startDate" type="date" defaultValue={p?.startDate ?? ""} />
        <SelectField label="Reports to" name="managerId" defaultValue={p?.managerId ?? undefined} options={managers.map((m) => ({ value: m.id, label: m.name }))} />
      </Row>
      <Row cols={3}>
        <SelectField
          label="Paid"
          name="payType"
          defaultValue={p?.payType ?? "salary"}
          options={[
            { value: "salary", label: "Annual salary" },
            { value: "hourly", label: "Hourly rate" },
          ]}
        />
        <TextField label="Rate (AUD)" name="payRate" type="number" step="0.01" defaultValue={p?.payRate ?? ""} placeholder="85000 or 38.50" />
        <TextField label="Hours / week" name="hoursPerWeek" type="number" step="0.5" defaultValue={p?.hoursPerWeek ?? "38"} />
      </Row>
      <Row>
        <TextField label="Super %" name="superRate" type="number" step="0.5" defaultValue={p?.superRate ?? "12"} hint="The super guarantee is 12% from 1 July 2025." />
        <TextField label="Phone" name="phone" defaultValue={p?.phone ?? ""} />
      </Row>
    </ActionDialog>
  );
}

export function LeaveDecision({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const go = (approve: boolean) =>
    start(async () => {
      const r = await decideLeave(id, approve);
      if (r.ok) toast.success(approve ? "Leave approved" : "Leave declined");
      else toast.error(r.error);
    });
  return (
    <div className="flex gap-1">
      <Button size="xs" onClick={() => go(true)} disabled={pending}>
        <Check /> Approve
      </Button>
      <Button size="xs" variant="ghost" onClick={() => go(false)} disabled={pending}>
        <X /> Decline
      </Button>
    </div>
  );
}

export function NewPayRun() {
  const d = new Date();
  const end = new Date(d.getTime() - ((d.getDay() + 1) % 7) * 864e5); // last Saturday
  const start = new Date(end.getTime() - 13 * 864e5);
  const iso = (x: Date) => x.toISOString().slice(0, 10);
  return (
    <ActionDialog
      trigger={
        <Button size="sm" className="rounded-full">
          <Play /> New pay run
        </Button>
      }
      title="New pay run"
      description="Creates a draft payslip for everyone with a pay rate. Hourly staff are paid from logged time (or their usual hours if none). Review, then finalise."
      action={createPayRun}
      submitLabel="Calculate"
      success="Draft pay run ready"
    >
      <SelectField
        label="Frequency"
        name="frequency"
        defaultValue="fortnightly"
        options={[
          { value: "weekly", label: "Weekly" },
          { value: "fortnightly", label: "Fortnightly" },
          { value: "monthly", label: "Monthly" },
        ]}
      />
      <Row cols={3}>
        <TextField label="Period start" name="periodStart" type="date" defaultValue={iso(start)} required />
        <TextField label="Period end" name="periodEnd" type="date" defaultValue={iso(end)} required />
        <TextField label="Pay date" name="payDate" type="date" defaultValue={iso(new Date(end.getTime() + 4 * 864e5))} required />
      </Row>
    </ActionDialog>
  );
}

export function RunActions({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-1">
      <Button
        size="xs"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await finalisePayRun(id);
            if (r.ok) toast.success("Pay run finalised; payslips are in each person's portal");
            else toast.error(r.error);
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Finalise
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await deletePayRun(id);
            if (!r.ok) toast.error(r.error);
          })
        }
        aria-label="Discard draft"
      >
        <Trash2 />
      </Button>
    </div>
  );
}
