"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Row, SelectField, TextField } from "@/components/forms/fields";
import { useConfigure } from "@/components/settings/configure";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ActionResult } from "@/lib/actions";
import { withhold } from "@/lib/payg";
import { CESSATION_TYPES, INCOME_TYPES } from "@/lib/payroll";
import { saveEmployee, saveMyPayroll } from "@/lib/payroll-actions";
import { positions } from "@/lib/permissions";
import { AwardPicker } from "./award-picker";

export type EmployeeProfile = Record<string, string | number | boolean | null | undefined> | null;
type Section = "personal" | "tax" | "super" | "bank" | "employment" | "pay";

const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((x) => ({ value: x, label: x }));
const val = (p: EmployeeProfile, k: string) => (p?.[k] == null ? "" : String(p[k]));

/** A form inside a Configure popup that saves one section and closes. */
export function SectionForm({ section, userId, children, submit = "Save" }: { section: Section; userId?: string; children: ReactNode; submit?: string }) {
  const [pending, start] = useTransition();
  const popup = useConfigure();
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const r: ActionResult = userId ? await saveEmployee(userId, section, f) : await saveMyPayroll(section as "personal", f);
          if (!r.ok) return void toast.error(r.error);
          toast.success("Saved");
          popup?.close();
        });
      }}
    >
      {children}
      <div className="flex justify-end">
        <Button disabled={pending} className="rounded-full">
          {pending ? <Loader2 className="animate-spin" /> : null} {submit}
        </Button>
      </div>
    </form>
  );
}

function Declare({ children }: { children: ReactNode }) {
  return (
    <label className="flex items-start gap-2.5 rounded-xl border bg-muted/30 p-3 text-[12px] leading-relaxed">
      <Checkbox name="declare" required className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}

export function PersonalForm({ p, userId }: { p: EmployeeProfile; userId?: string }) {
  return (
    <SectionForm section="personal" userId={userId}>
      <Row cols={3}>
        <TextField label="Legal first name" name="givenName" defaultValue={val(p, "givenName")} required />
        <TextField label="Middle names" name="middleName" defaultValue={val(p, "middleName")} />
        <TextField label="Family name" name="familyName" defaultValue={val(p, "familyName")} required />
      </Row>
      <Row cols={3}>
        <TextField label="Date of birth" name="dob" type="date" defaultValue={val(p, "dob")} required />
        <SelectField
          label="Gender"
          name="gender"
          defaultValue={val(p, "gender") || undefined}
          options={[
            { value: "female", label: "Female" },
            { value: "male", label: "Male" },
            { value: "other", label: "Non-binary or other" },
            { value: "unspecified", label: "Prefer not to say" },
          ]}
        />
        <TextField label="Mobile" name="phone" defaultValue={val(p, "phone")} inputMode="tel" />
      </Row>
      <TextField label="Personal email" name="personalEmail" type="email" defaultValue={val(p, "personalEmail")} hint="For payslips and super after they leave" />
      <Row>
        <TextField label="Home address" name="addressLine1" defaultValue={val(p, "addressLine1")} required />
        <TextField label="Address line 2" name="addressLine2" defaultValue={val(p, "addressLine2")} />
      </Row>
      <Row cols={3}>
        <TextField label="Suburb" name="suburb" defaultValue={val(p, "suburb")} required />
        <SelectField label="State" name="addressState" defaultValue={val(p, "addressState") || undefined} options={STATES} required />
        <TextField label="Postcode" name="postcode" defaultValue={val(p, "postcode")} inputMode="numeric" maxLength={4} required />
      </Row>
      <p className="pt-1 text-[12px] font-medium">Emergency contact</p>
      <Row cols={3}>
        <TextField label="Name" name="emergencyName" defaultValue={val(p, "emergencyName")} />
        <TextField label="Relationship" name="emergencyRelation" defaultValue={val(p, "emergencyRelation")} placeholder="Partner" />
        <TextField label="Phone" name="emergencyPhone" defaultValue={val(p, "emergencyPhone")} inputMode="tel" />
      </Row>
    </SectionForm>
  );
}

/** The ATO TFN declaration questions, with a live preview of the tax scale and withholding. */
export function TaxForm({ p, userId, tfnLast3, whmRegistered, sample }: { p: EmployeeProfile; userId?: string; tfnLast3: string | null; whmRegistered: boolean; sample?: { gross: number; frequency: "weekly" | "fortnightly" | "monthly" } }) {
  const [status, setStatus] = useState(p?.tfnDeclaredAt ? val(p, "tfnStatus") || "provided" : "provided");
  const [residency, setResidency] = useState(val(p, "residency") || "resident");
  const [tft, setTft] = useState(p?.taxFreeThreshold !== false);
  const [stsl, setStsl] = useState(Boolean(p?.stsl));
  const [medicare, setMedicare] = useState(val(p, "medicareExemption") || "none");
  const preview = sample && sample.gross > 0 ? withhold(sample.gross, sample.frequency, { tfnProvided: status !== "none", residency: residency as "resident", taxFreeThreshold: residency === "resident" && tft, stsl, medicareExemption: residency === "resident" ? (medicare as "none") : "none", whmRegistered }) : null;
  return (
    <SectionForm section="tax" userId={userId} submit="Save declaration">
      <div className="grid gap-1.5">
        <Label>Tax file number</Label>
        <div className="grid gap-2 sm:grid-cols-[1fr_1.3fr]">
          <select name="tfnStatus" value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
            <option value="provided">I have a TFN</option>
            <option value="pending">I&rsquo;ve applied for a TFN</option>
            <option value="under18">Under 18 and earn under the threshold</option>
            <option value="pensioner">I receive a pension, benefit or allowance</option>
            <option value="none">I don&rsquo;t want to provide it</option>
          </select>
          {status === "provided" ? <input name="tfn" inputMode="numeric" autoComplete="off" placeholder={tfnLast3 ? `Saved: ••• ••• ${tfnLast3} (type to replace)` : "123 456 789"} className="h-9 rounded-md border bg-transparent px-3 text-sm" /> : null}
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <ShieldCheck className="size-3" /> Checked against the ATO check digit, encrypted, and only ever shown as the last 3 digits.
          {status === "none" ? " Without a TFN, tax is withheld at the top rate (47%)." : status === "pending" ? " You have 28 days to give it to us before top-rate withholding applies." : ""}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label>For tax purposes, are you…</Label>
        <select name="residency" value={residency} onChange={(e) => setResidency(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="resident">An Australian resident</option>
          <option value="foreign">A foreign resident</option>
          <option value="whm">A working holiday maker (417 or 462 visa)</option>
        </select>
      </div>
      {residency === "whm" ? <TextField label="Home country" name="homeCountry" defaultValue={val(p, "homeCountry")} placeholder="e.g. GB, FR, KR" hint="Two-letter country code, reported through STP" /> : null}
      {residency === "resident" ? (
        <>
          <label className="flex items-start gap-2.5 text-[13px]">
            <Checkbox name="taxFreeThreshold" checked={tft} onCheckedChange={(c) => setTft(c === true)} className="mt-0.5" />
            <span>
              Claim the tax-free threshold from this employer
              <span className="block text-[11px] text-muted-foreground">Only claim it from one employer at a time, usually the one that pays you most.</span>
            </span>
          </label>
          <div className="grid gap-1.5">
            <Label>Medicare levy</Label>
            <select name="medicareExemption" value={medicare} onChange={(e) => setMedicare(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
              <option value="none">Pay the full Medicare levy</option>
              <option value="half">Half exemption (Medicare levy variation)</option>
              <option value="full">Full exemption (Medicare levy variation)</option>
            </select>
          </div>
        </>
      ) : null}
      <label className="flex items-start gap-2.5 text-[13px]">
        <Checkbox name="stsl" checked={stsl} onCheckedChange={(c) => setStsl(c === true)} className="mt-0.5" />
        <span>
          I have a study or training support loan (HELP, VSL, SFSS, SSL, ASL)
          <span className="block text-[11px] text-muted-foreground">Extra is withheld once income passes $69,528 a year (2026–27).</span>
        </span>
      </label>
      <TextField label="Extra tax to withhold each pay (optional)" name="extraWithholding" defaultValue={val(p, "extraWithholding")} inputMode="decimal" placeholder="0" />
      {preview ? (
        <div className="rounded-xl border bg-muted/30 p-3 text-[12px]">
          <p className="font-medium">{preview.scale.label}</p>
          <p className="text-muted-foreground">
            On ${sample!.gross.toFixed(2)} {sample!.frequency}: withhold <span className="font-medium text-foreground">${preview.tax}</span>
            {preview.stsl ? ` (including $${preview.stsl} study loan)` : ""}, from the ATO&rsquo;s 2026–27 tables.
          </p>
        </div>
      ) : null}
      <Declare>I declare the information I&rsquo;ve given is true and correct. This is the same information as the ATO&rsquo;s TFN declaration (NAT 3092); the agency keeps the record and reports it through Single Touch Payroll.</Declare>
    </SectionForm>
  );
}

export function SuperForm({ p, userId, defaultFund, allowSacrifice }: { p: EmployeeProfile; userId?: string; defaultFund: string | null; allowSacrifice?: boolean }) {
  const [type, setType] = useState(p?.superChoiceAt ? val(p, "superType") || "apra" : "apra");
  return (
    <SectionForm section="super" userId={userId} submit="Save super choice">
      <div className="grid gap-1.5">
        <Label>Where should super go?</Label>
        <select name="superType" value={type} onChange={(e) => setType(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
          <option value="apra">My own super fund</option>
          <option value="stapled">My stapled fund (from the ATO)</option>
          <option value="smsf">My self-managed super fund</option>
          <option value="default">The agency&apos;s default fund{defaultFund ? ` (${defaultFund})` : ""}</option>
        </select>
        {type === "default" ? <p className="text-[11px] text-muted-foreground">If you already have a fund, choose it so you don&apos;t end up with two accounts. New employers must check the ATO for a stapled fund before using the default.</p> : null}
      </div>
      {type === "apra" || type === "stapled" ? (
        <>
          <TextField label="Fund name" name="superFund" defaultValue={val(p, "superFund")} placeholder="e.g. AustralianSuper" />
          <Row cols={3}>
            <TextField label="USI" name="superUsi" defaultValue={val(p, "superUsi")} placeholder="STA0100AU" hint="Unique superannuation identifier" />
            <TextField label="Fund ABN" name="superAbn" defaultValue={val(p, "superAbn")} inputMode="numeric" />
            <TextField label="Member number" name="superMember" defaultValue={val(p, "superMember")} />
          </Row>
        </>
      ) : null}
      {type === "smsf" ? (
        <>
          <Row>
            <TextField label="Fund name" name="superFund" defaultValue={val(p, "superFund")} />
            <TextField label="Fund ABN" name="superAbn" defaultValue={val(p, "superAbn")} inputMode="numeric" />
          </Row>
          <Row>
            <TextField label="Electronic service address (ESA)" name="smsfEsa" defaultValue={val(p, "smsfEsa")} placeholder="e.g. smsfdataflow" />
            <TextField label="Member number" name="superMember" defaultValue={val(p, "superMember")} />
          </Row>
          <Row cols={3}>
            <TextField label="Account name" name="smsfAccountName" defaultValue={val(p, "smsfAccountName")} />
            <TextField label="BSB" name="smsfBsb" defaultValue={val(p, "smsfBsb")} inputMode="numeric" />
            <TextField label="Account number" name="smsfAccount" defaultValue={val(p, "smsfAccount")} inputMode="numeric" />
          </Row>
        </>
      ) : null}
      {allowSacrifice ? <TextField label="Salary sacrifice to super each pay (before tax)" name="salarySacrificeSuper" defaultValue={val(p, "salarySacrificeSuper")} inputMode="decimal" placeholder="0" hint="Counts toward the $32,500 concessional cap with the employer's contributions." /> : null}
      <Declare>I declare this is my choice of super fund (Standard choice form, NAT 13080) and the details are correct.</Declare>
    </SectionForm>
  );
}

export function BankForm({ p, userId }: { p: EmployeeProfile; userId?: string }) {
  return (
    <SectionForm section="bank" userId={userId}>
      <TextField label="Account name" name="bankAccountName" defaultValue={val(p, "bankAccountName")} required />
      <Row>
        <TextField label="BSB" name="bankBsb" defaultValue={val(p, "bankBsb")} inputMode="numeric" placeholder="062-000" required />
        <TextField label="Account number" name="bankAccount" defaultValue={val(p, "bankAccount")} inputMode="numeric" required />
      </Row>
    </SectionForm>
  );
}

export function EmploymentForm({ p, userId, managers }: { p: EmployeeProfile; userId: string; managers: { id: string; name: string }[] }) {
  const [ended, setEnded] = useState(Boolean(val(p, "endDate")));
  return (
    <SectionForm section="employment" userId={userId}>
      <Row>
        <SelectField label="Position" name="position" defaultValue={val(p, "position") || "consultant"} options={positions.map((x) => ({ value: x.key, label: x.label }))} />
        <TextField label="Job title" name="title" defaultValue={val(p, "title")} placeholder="Senior migration agent" />
      </Row>
      <Row cols={3}>
        <SelectField
          label="Employment"
          name="employment"
          defaultValue={val(p, "employment") || "full_time"}
          options={[
            { value: "full_time", label: "Full time" },
            { value: "part_time", label: "Part time" },
            { value: "casual", label: "Casual" },
            { value: "contractor", label: "Contractor" },
          ]}
        />
        <SelectField label="Income type (STP)" name="incomeType" defaultValue={val(p, "incomeType") || "SAW"} options={INCOME_TYPES.map((x) => ({ value: x.code, label: `${x.label}` }))} />
        <SelectField label="Manager" name="managerId" defaultValue={val(p, "managerId") || undefined} options={managers.map((m) => ({ value: m.id, label: m.name }))} />
      </Row>
      <Row cols={3}>
        <TextField label="MARN" name="marn" defaultValue={val(p, "marn")} inputMode="numeric" />
        <TextField label="MARN expiry" name="marnExpiry" type="date" defaultValue={val(p, "marnExpiry")} />
        <TextField label="QEAC (education)" name="qeac" defaultValue={val(p, "qeac")} />
      </Row>
      <Row cols={3}>
        <TextField label="Start date" name="startDate" type="date" defaultValue={val(p, "startDate")} required />
        <TextField label="Payroll ID" name="payrollId" defaultValue={val(p, "payrollId")} hint="Stays the same for STP" />
        <TextField label="Home country (WHM / foreign)" name="homeCountry" defaultValue={val(p, "homeCountry")} placeholder="GB" />
      </Row>
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox checked={ended} onCheckedChange={(c) => setEnded(c === true)} /> Employment has ended
      </label>
      {ended ? (
        <Row>
          <TextField label="Last day" name="endDate" type="date" defaultValue={val(p, "endDate")} required />
          <SelectField label="Reason (STP cessation type)" name="cessationType" defaultValue={val(p, "cessationType") || undefined} options={CESSATION_TYPES.map((x) => ({ value: x.code, label: x.label }))} required />
        </Row>
      ) : null}
    </SectionForm>
  );
}

export function PayForm({ p, userId, defaultFrequency, awardConnected }: { p: EmployeeProfile; userId: string; defaultFrequency: string; awardConnected: boolean }) {
  return (
    <SectionForm section="pay" userId={userId}>
      <Row cols={3}>
        <SelectField
          label="Pay type"
          name="payType"
          defaultValue={val(p, "payType") || "salary"}
          options={[
            { value: "salary", label: "Annual salary" },
            { value: "hourly", label: "Hourly rate" },
          ]}
        />
        <TextField label="Rate ($)" name="payRate" defaultValue={val(p, "payRate")} inputMode="decimal" required />
        <TextField label="Hours a week" name="hoursPerWeek" defaultValue={val(p, "hoursPerWeek") || "38"} inputMode="decimal" />
      </Row>
      <Row cols={3}>
        <SelectField
          label="Paid"
          name="payFrequency"
          defaultValue={val(p, "payFrequency") || defaultFrequency}
          options={[
            { value: "weekly", label: "Weekly" },
            { value: "fortnightly", label: "Fortnightly" },
            { value: "monthly", label: "Monthly" },
          ]}
        />
        <TextField label="Super guarantee %" name="superRate" defaultValue={val(p, "superRate") || "12"} inputMode="decimal" hint="At least 12% from 1 July 2025" />
        <TextField label="Extra employer super %" name="extraSuperRate" defaultValue={val(p, "extraSuperRate")} inputMode="decimal" placeholder="0" />
      </Row>
      <TextField label="Salary sacrifice to super each pay" name="salarySacrificeSuper" defaultValue={val(p, "salarySacrificeSuper")} inputMode="decimal" placeholder="0" />
      <AwardPicker connected={awardConnected} defaults={{ awardCode: val(p, "awardCode"), awardName: val(p, "awardName"), classification: val(p, "classification"), classificationRate: val(p, "classificationRate") }} />
    </SectionForm>
  );
}
