"use client";

import { Loader2, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { ActionDialog, useAction } from "@/components/forms/action-dialog";
import { AreaField, Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { createNomination, setNominationStatus } from "@/lib/nomination-actions";
import { LMT_STATUSES, NOMINATION_PROGRAMS, NOMINATION_STATUSES } from "@/lib/nominations";

type Opt = { id: string; name: string };
type MatterOpt = { id: string; label: string; clientId: string };

export function NewNominationDialog({ employers, employerId, clients, matters, trigger }: { employers?: Opt[]; employerId?: string; clients: Opt[]; matters: MatterOpt[]; trigger?: React.ReactNode }) {
  const [matterId, setMatterId] = useState("");
  const matter = matters.find((m) => m.id === matterId);
  return (
    <ActionDialog
      trigger={
        trigger ?? (
          <Button size="sm">
            <Plus /> New nomination
          </Button>
        )
      }
      title="Add a nomination"
      description="One position the employer is nominating. Link the visa case and the nominee so progress shows on both."
      action={createNomination}
      submitLabel="Add nomination"
      success="Nomination added"
      wide
    >
      {employerId ? <input type="hidden" name="employerId" value={employerId} /> : <SelectField label="Employer" name="employerId" required options={(employers ?? []).map((e) => ({ value: e.id, label: e.name }))} />}
      <Row>
        <SelectField label="Program" name="program" required options={NOMINATION_PROGRAMS.map((p) => ({ value: p.value, label: p.label }))} />
        <TextField label="Position title" name="positionTitle" required placeholder="Registered Nurse (Aged Care)" />
      </Row>
      <Row cols={3}>
        <TextField label="ANZSCO code" name="anzsco" inputMode="numeric" maxLength={6} placeholder="254412" />
        <TextField label="Annual base salary (AUD)" name="salary" type="number" min={0} step="1" />
        <TextField label="Worksite" name="worksite" placeholder="Suburb, state" />
      </Row>
      <Row>
        <div className="grid gap-1.5">
          <label htmlFor="matterId" className="text-sm font-medium">
            Visa case
          </label>
          <select id="matterId" name="matterId" value={matterId} onChange={(e) => setMatterId(e.target.value)} className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm shadow-xs">
            <option value="">Not linked yet</option>
            {matters.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        {matter ? <input type="hidden" name="clientId" value={matter.clientId} /> : <SelectField label="Nominee" name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} placeholder="Not chosen yet" />}
      </Row>
      <Row cols={3}>
        <SelectField label="Status" name="status" defaultValue="preparing" options={NOMINATION_STATUSES.map((p) => ({ value: p.value, label: p.label }))} />
        <SelectField label="Labour market testing" name="lmt" defaultValue="needed" options={LMT_STATUSES.map((p) => ({ value: p.value, label: p.label }))} />
        <TextField label="TRN" name="trn" placeholder="If already lodged" />
      </Row>
      <TextField label="Lodged on" name="lodgedAt" type="date" />
      <AreaField label="Notes" name="notes" rows={3} />
    </ActionDialog>
  );
}

export function NominationMenu({ id, status }: { id: string; status: string }) {
  const { pending, run } = useAction();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Nomination actions" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {NOMINATION_STATUSES.filter((x) => x.value !== status).map((x) => (
          <DropdownMenuItem key={x.value} onClick={() => run(() => setNominationStatus(id, x.value), `Marked ${x.label.toLowerCase()}`)}>
            {x.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
