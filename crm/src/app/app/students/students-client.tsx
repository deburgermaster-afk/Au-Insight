"use client";

import { Building2, GraduationCap, Loader2, MoreHorizontal, Plus, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { label, Pill, type Tone } from "@/components/app/badges";
import { ActionDialog, useAction } from "@/components/forms/action-dialog";
import { AreaField, Row, SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createApplication, createInstitution, findCourses, setApplicationStatus, setCommissionStatus } from "@/lib/edu-actions";
import { aud } from "@/lib/format";
import type { Course } from "@/lib/occupations";

export const appStages = ["preparing", "submitted", "offer", "conditional", "accepted", "coe", "enrolled"] as const;
export const appTone: Record<string, Tone> = { preparing: "gray", submitted: "blue", offer: "violet", conditional: "amber", accepted: "pink", coe: "blue", enrolled: "green", rejected: "red", withdrawn: "gray" };
export const commissionTone: Record<string, Tone> = { not_due: "gray", claimable: "amber", invoiced: "blue", received: "green", ineligible: "red" };
export const stageLabel = (s: string) => (s === "coe" ? "CoE issued" : label(s));

const levels = ["Certificate III", "Certificate IV", "Diploma", "Advanced Diploma", "Associate Degree", "Bachelor Degree", "Graduate Certificate", "Graduate Diploma", "Masters Degree (Coursework)", "Masters Degree (Research)", "Non AQF Award"];

type Opt = { id: string; name: string };
type Prefill = { course?: string; courseCode?: string; providerName?: string; providerCode?: string; tuitionFee?: string };

export function NewApplication({ clients, institutions, prefill, trigger }: { clients: Opt[]; institutions: Opt[]; prefill?: Prefill; trigger?: React.ReactNode }) {
  return (
    <ActionDialog
      trigger={
        trigger ?? (
          <Button size="sm">
            <Plus />
            New application
          </Button>
        )
      }
      title="New study application"
      description="Track it from offer to CoE and enrolment. Commission becomes claimable once the student enrols."
      action={createApplication}
      submitLabel="Open application"
      success="Application opened"
      wide
    >
      <SelectField label="Student" name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name }))} required />
      <Row>
        <TextField label="Course" name="course" defaultValue={prefill?.course} placeholder="Master of Professional Accounting" required />
        <TextField label="CRICOS course code" name="courseCode" defaultValue={prefill?.courseCode} />
      </Row>
      {prefill?.providerName ? (
        <>
          <TextField label="Provider" name="providerName" defaultValue={prefill.providerName} readOnly />
          <input type="hidden" name="providerCode" value={prefill.providerCode ?? ""} />
        </>
      ) : (
        <SelectField label="Institution" name="institutionId" options={institutions.map((i) => ({ value: i.id, label: i.name }))} placeholder="Choose a partner institution" />
      )}
      <Row cols={3}>
        <TextField label="Intake" name="intake" placeholder="Feb 2027" />
        <TextField label="Tuition (first year)" name="tuitionFee" inputMode="decimal" defaultValue={prefill?.tuitionFee} />
        <TextField label="Commission %" name="commissionRate" inputMode="decimal" placeholder="From agreement" />
      </Row>
      <div className="flex items-start justify-between gap-4 rounded-2xl border p-3">
        <div>
          <Label htmlFor="onshoreTransfer">Onshore transfer</Label>
          <p className="mt-1 text-xs text-muted-foreground">Already studying in Australia and moving provider. Commission is banned for these students once accepted after 31 March 2026.</p>
        </div>
        <Switch id="onshoreTransfer" name="onshoreTransfer" />
      </div>
      <AreaField label="Notes" name="notes" placeholder="English test, GTE/GS notes, scholarship…" />
    </ActionDialog>
  );
}

export function NewInstitution() {
  return (
    <ActionDialog
      trigger={
        <Button size="sm" variant="outline">
          <Building2 />
          Add institution
        </Button>
      }
      title="Add a partner institution"
      description="Keep the agency agreement, commission rate and expiry on file."
      action={createInstitution}
      submitLabel="Add"
      success="Institution added"
      wide
    >
      <Row>
        <TextField label="Name" name="name" placeholder="University of Sydney" required />
        <TextField label="CRICOS provider code" name="cricos" placeholder="00026A" />
      </Row>
      <Row cols={3}>
        <SelectField label="State" name="state" options={["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((x) => ({ value: x, label: x }))} />
        <TextField label="Commission %" name="commissionRate" inputMode="decimal" placeholder="15" />
        <TextField label="Agreement expires" name="agreementExpiry" type="date" />
      </Row>
      <Row>
        <TextField label="Contact name" name="contactName" />
        <TextField label="Contact email" name="contactEmail" type="email" />
      </Row>
    </ActionDialog>
  );
}

export function AppMenu({ id, status, commission }: { id: string; status: string; commission: string }) {
  const { pending, run } = useAction();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Application actions" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Move to</DropdownMenuLabel>
        {[...appStages, "rejected", "withdrawn"]
          .filter((s) => s !== status)
          .map((s) => (
            <DropdownMenuItem key={s} onClick={() => run(() => setApplicationStatus(id, s), `Moved to ${stageLabel(s)}`)}>
              {stageLabel(s)}
            </DropdownMenuItem>
          ))}
        {commission !== "ineligible" && commission !== "not_due" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Commission</DropdownMenuLabel>
            {["claimable", "invoiced", "received"]
              .filter((s) => s !== commission)
              .map((s) => (
                <DropdownMenuItem key={s} onClick={() => run(() => setCommissionStatus(id, s), `Commission ${s}`)}>
                  Mark {s}
                </DropdownMenuItem>
              ))}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function CommissionMenu({ id, commission }: { id: string; commission: string }) {
  const { pending, run } = useAction();
  if (commission === "ineligible" || commission === "not_due") return null;
  const next = commission === "claimable" ? "invoiced" : commission === "invoiced" ? "received" : null;
  if (!next) return null;
  return (
    <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setCommissionStatus(id, next), `Commission ${next}`)}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      Mark {next}
    </Button>
  );
}

export function CourseFinder({ clients, institutions }: { clients: Opt[]; institutions: Opt[] }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [rows, setRows] = useState<Course[] | null>(null);
  const [pending, start] = useTransition();
  const go = () =>
    start(async () => {
      setRows(await findCourses(q, level || undefined));
    });
  return (
    <div className="grid gap-3">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          go();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search CRICOS courses — nursing, data science, cookery…" className="h-10 rounded-full pl-9" />
        </div>
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="h-10 rounded-full border bg-background px-3 text-sm" aria-label="Level">
          <option value="">All levels</option>
          {levels.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <Button type="submit" className="h-10 rounded-full" disabled={pending || !q.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />}
          Search
        </Button>
      </form>
      {rows == null ? (
        <div className="grid place-items-center gap-2 rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          <GraduationCap className="size-8 opacity-60" />
          Search every current CRICOS course, cheapest first. Pick one to open an application for a student.
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border p-8 text-center text-sm text-muted-foreground">No current courses match.</p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2">
          {rows.map((c) => (
            <li key={c.code} className="flex flex-col gap-2 rounded-2xl border bg-card p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium leading-snug">{c.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c.provider_names ?? c.provider_code}</p>
                </div>
                <span className="shrink-0 text-right">
                  <span className="block font-semibold tabular-nums">{c.annual_tuition ? aud(c.annual_tuition) : "—"}</span>
                  <span className="text-[11px] text-muted-foreground">per year</span>
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {c.level ? <Pill t="violet">{c.level}</Pill> : null}
                {c.duration_weeks ? <Pill>{Math.round(Number(c.duration_weeks) / 52 * 10) / 10} yrs</Pill> : null}
                <Pill>CRICOS {c.code}</Pill>
                {c.total_cost ? <span className="text-muted-foreground">Total {aud(c.total_cost)}</span> : null}
                <span className="ml-auto">
                  <NewApplication
                    clients={clients}
                    institutions={institutions}
                    prefill={{ course: c.name, courseCode: c.code, providerName: c.provider_names?.split(/[;,]/)[0]?.trim() ?? c.provider_code, providerCode: c.provider_code, tuitionFee: c.annual_tuition ?? undefined }}
                    trigger={
                      <Button size="xs" variant="outline">
                        <Plus />
                        Apply
                      </Button>
                    }
                  />
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
