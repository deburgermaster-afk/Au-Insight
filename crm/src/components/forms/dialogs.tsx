"use client";

import { Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Composer } from "@/components/mail/composer";
import { createAppointment, createEmployer, createInvoice, createMatter, createTask, recordPayment } from "@/lib/actions";
import { stages, visas } from "@/lib/visas";
import { ActionDialog } from "./action-dialog";
import { AreaField, type Option, Row, SelectField, TextField } from "./fields";

export type Pickers = {
  clients: { id: string; name: string }[];
  staff: { id: string; name: string; role: string }[];
  employers: { id: string; name: string }[];
};

const opts = (rows: { id: string; name: string }[]): Option[] => rows.map((r) => ({ value: r.id, label: r.name }));
const visaOpts: Option[] = visas.map((v) => ({ value: v.code, label: `${v.code} · ${v.name}` }));
const priorityOpts: Option[] = ["low", "normal", "high", "urgent"].map((p) => ({ value: p, label: p[0].toUpperCase() + p.slice(1) }));

const plus = (text: string, variant: "default" | "outline" = "default") => (
  <Button variant={variant} size="sm">
    <Plus />
    {text}
  </Button>
);

export function NewMatterDialog({ pickers, clientId, trigger }: { pickers: Pickers; clientId?: string; trigger?: ReactNode }) {
  const [code, setCode] = useState("");
  const visa = visas.find((v) => v.code === code);
  return (
    <ActionDialog
      trigger={trigger ?? plus("New matter")}
      title="Open a matter"
      description="The document checklist is created from the visa library and can be edited per matter."
      action={createMatter}
      submitLabel="Open matter"
      success="Matter opened"
      goTo={(id) => `/app/matters/${id}`}
    >
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : <SelectField label="Client" name="clientId" options={opts(pickers.clients)} required />}
      <div className="grid gap-1.5">
        <Label htmlFor="visaCode">Visa or service</Label>
        <select
          id="visaCode"
          name="visaCode"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="h-9 w-full rounded-lg border bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <option value="" disabled>
            Choose a subclass…
          </option>
          {visaOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {visa?.streams?.length ? <SelectField key={code} label="Stream" name="stream" options={visa.streams.map((s) => ({ value: s, label: s }))} /> : null}
      <Row>
        <SelectField label="Stage" name="stage" defaultValue="engaged" options={stages.map((s) => ({ value: s.key, label: s.label }))} />
        <SelectField label="Priority" name="priority" defaultValue="normal" options={priorityOpts} />
      </Row>
      <Row>
        <SelectField label="Case officer" name="assignedTo" options={opts(pickers.staff)} placeholder="Me" />
        <TextField label="Target lodgement" name="dueAt" type="date" />
      </Row>
      {visa && ["482", "186", "494", "407", "SBS"].includes(visa.code) ? <SelectField label="Sponsor" name="employerId" options={opts(pickers.employers)} /> : null}
      <Row>
        <TextField label="Professional fee (AUD)" name="feeProfessional" type="number" min={0} step="0.01" placeholder="3,300" />
        <TextField label="Government charge (AUD)" name="feeGovernment" type="number" min={0} step="0.01" placeholder="4,910" />
      </Row>
    </ActionDialog>
  );
}

export function NewTaskDialog({ pickers, clientId, matterId, trigger }: { pickers: Pickers; clientId?: string; matterId?: string; trigger?: ReactNode }) {
  return (
    <ActionDialog trigger={trigger ?? plus("New task")} title="New task" action={createTask} submitLabel="Add task" success="Task added">
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      {matterId ? <input type="hidden" name="matterId" value={matterId} /> : null}
      <TextField label="Title" name="title" required placeholder="Request police certificate from India" autoFocus />
      <AreaField label="Details" name="description" />
      <Row cols={3}>
        <TextField label="Due" name="dueAt" type="date" />
        <SelectField label="Priority" name="priority" defaultValue="normal" options={priorityOpts} />
        <SelectField label="Assignee" name="assignedTo" options={opts(pickers.staff)} placeholder="Me" />
      </Row>
      {!clientId ? <SelectField label="Client (optional)" name="clientId" options={opts(pickers.clients)} /> : null}
    </ActionDialog>
  );
}

export function NewAppointmentDialog({ pickers, clientId, trigger }: { pickers: Pickers; clientId?: string; trigger?: ReactNode }) {
  return (
    <ActionDialog trigger={trigger ?? plus("Book appointment")} title="Book an appointment" action={createAppointment} submitLabel="Book" success="Appointment booked">
      <TextField label="Title" name="title" placeholder="Initial consultation" />
      <Row cols={3}>
        <TextField label="Date" name="date" type="date" required />
        <TextField label="Time" name="time" type="time" defaultValue="10:00" />
        <SelectField
          label="Length"
          name="minutes"
          defaultValue="30"
          options={["15", "30", "45", "60", "90"].map((m) => ({ value: m, label: `${m} min` }))}
        />
      </Row>
      <Row>
        <SelectField
          label="Type"
          name="kind"
          defaultValue="consultation"
          options={["consultation", "follow-up", "document check", "interview", "lodgement"].map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))}
        />
        <TextField label="Location" name="location" placeholder="Office, phone or video link" />
      </Row>
      <Row>
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : <SelectField label="Client" name="clientId" options={opts(pickers.clients)} />}
        <SelectField label="With" name="staffId" options={opts(pickers.staff)} placeholder="Me" />
      </Row>
      <TextField label="Consultation fee (AUD)" name="fee" type="number" min={0} step="0.01" placeholder="0" />
    </ActionDialog>
  );
}

export function NewEmployerDialog() {
  return (
    <ActionDialog trigger={plus("Add employer")} title="Add a sponsoring employer" action={createEmployer} submitLabel="Add" success="Employer added">
      <TextField label="Business name" name="name" required />
      <Row>
        <TextField label="ABN" name="abn" inputMode="numeric" />
        <TextField label="Industry" name="industry" />
      </Row>
      <Row>
        <TextField label="Contact" name="contactName" />
        <TextField label="Contact email" name="contactEmail" type="email" />
      </Row>
      <Row>
        <TextField label="Phone" name="phone" />
        <TextField label="SBS expiry" name="sbsExpiry" type="date" />
      </Row>
      <label className="flex items-center gap-3 text-sm">
        <Switch name="sbsApproved" /> Approved standard business sponsor
      </label>
    </ActionDialog>
  );
}

export function NewInvoiceDialog({ pickers, clientId }: { pickers: Pickers; clientId?: string }) {
  const [lines, setLines] = useState([0]);
  return (
    <ActionDialog trigger={plus("New invoice")} title="New invoice" action={createInvoice} submitLabel="Create invoice" success="Invoice created" wide>
      <Row>
        {clientId ? <input type="hidden" name="clientId" value={clientId} /> : <SelectField label="Client" name="clientId" options={opts(pickers.clients)} required />}
        <TextField label="Due" name="dueAt" type="date" />
      </Row>
      <div className="grid gap-2">
        <Label>Items</Label>
        {lines.map((k) => (
          <div key={k} className="grid grid-cols-[1fr_7rem_auto] items-center gap-2">
            <Input name="description" placeholder="Professional fees: 190 application" required />
            <Input name="amount" type="number" step="0.01" min={0} placeholder="0.00" required />
            <select name="gst" defaultValue="yes" className="h-9 rounded-lg border bg-transparent px-2 text-sm">
              <option value="yes">+GST</option>
              <option value="no">No GST</option>
            </select>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" className="justify-self-start" onClick={() => setLines((l) => [...l, Math.max(...l) + 1])}>
          <Plus /> Add line
        </Button>
        <p className="text-xs text-muted-foreground">Government visa charges are disbursements: choose “No GST”.</p>
      </div>
      <AreaField label="Notes" name="notes" placeholder="Payment terms, bank details…" />
    </ActionDialog>
  );
}

export function RecordPaymentDialog({ invoiceId, outstanding, trigger }: { invoiceId: string; outstanding: number; trigger: ReactNode }) {
  return (
    <ActionDialog trigger={trigger} title="Record a payment" action={recordPayment} submitLabel="Record" success="Payment recorded">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Row>
        <TextField label="Amount (AUD)" name="amount" type="number" step="0.01" min={0.01} defaultValue={outstanding.toFixed(2)} required />
        <SelectField
          label="Method"
          name="method"
          defaultValue="bank transfer"
          options={["bank transfer", "card", "cash", "PayID", "cheque"].map((m) => ({ value: m, label: m[0].toUpperCase() + m.slice(1) }))}
        />
      </Row>
      <SelectField
        label="Deposit to"
        name="account"
        defaultValue="office"
        options={[
          { value: "office", label: "Office account (earned fees)" },
          { value: "trust", label: "Client trust account (money in advance)" },
        ]}
      />
    </ActionDialog>
  );
}

export function ComposeDialog({ to, clientId, matterId, subject, trigger }: { pickers?: Pickers; to?: string; clientId?: string; matterId?: string; subject?: string; trigger?: ReactNode }) {
  return <Composer to={to} clientId={clientId} matterId={matterId} subject={subject} trigger={trigger ?? plus("Compose")} />;
}
