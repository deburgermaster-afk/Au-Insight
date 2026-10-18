"use client";

import { Award, Banknote, CheckCircle2, FileText, Handshake, Loader2, Plus, Receipt, Send, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Pill, type Tone } from "@/components/app/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { awardScholarship, billTuition, remitTuition, saveScholarship, savePartnership, setAwardStatus } from "@/lib/student-finance-actions";
import { cn } from "@/lib/utils";

type Inst = { id: string; name: string; partner: boolean; commissionRate: string | null; agreementStart: string | null; agreementExpiry: string | null; agreementRef: string | null; collectsTuition: boolean; remitDays: number | null; bankDetails: string | null; contactName: string | null; contactEmail: string | null; website: string | null; notes: string | null };
type App = { id: string; clientName: string; course: string; institutionId: string | null; tuitionFee: string | null; status: string; intake: string | null };
type Sch = { id: string; institutionId: string | null; name: string; kind: string; value: string; appliesTo: string; funding: string; eligibility: string | null; conditions: string | null; maxAwards: number | null; closesAt: string | null; active: boolean };
type AwardRow = { id: string; scholarshipId: string; clientName: string; course: string | null; amount: string; status: string; signStatus: string | null; signRequestId: string | null };
type Pay = { id: string; clientName: string; institution: string | null; course: string | null; period: string; kind: string; gross: string; scholarship: string; amount: string; status: string; invoiceNumber: string | null; invoicePaid: string | null; invoiceTotal: string | null; remittedAt: string | null; remittedRef: string | null };

const aud = (n: number | string) => `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const field = "grid gap-1 text-[13px]";
const label = "text-muted-foreground";
const select = "h-9 rounded-md border bg-background px-2 text-sm";
const APPLIES: Record<string, string> = { first_year: "First year", full_course: "Whole course", first_semester: "First semester", one_off: "One-off" };
const FUNDING: Record<string, string> = { institution: "Funded by the institution", agency: "Funded by the agency", shared: "Jointly funded" };

function useAction() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Something went wrong.");
      toast.success(ok);
      after?.();
      router.refresh();
    });
  return { pending, run };
}

/** The agency's agreement with an institution. */
export function PartnerButton({ inst }: { inst: Inst }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ ...inst, commissionRate: inst.commissionRate ?? "", remitDays: inst.remitDays ?? undefined });
  const { pending, run } = useAction();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant={inst.partner ? "outline" : "ghost"}>
          <Handshake /> {inst.partner ? "Agreement" : "Make partner"}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agreement with {inst.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-foreground" checked={v.partner} onChange={(e) => set("partner", e.target.checked)} /> Partner institution (signed agency agreement)
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className={field}>
              <span className={label}>Commission %</span>
              <Input value={v.commissionRate} onChange={(e) => set("commissionRate", e.target.value)} inputMode="decimal" />
            </label>
            <label className={field}>
              <span className={label}>From</span>
              <Input type="date" value={v.agreementStart ?? ""} onChange={(e) => set("agreementStart", e.target.value)} />
            </label>
            <label className={field}>
              <span className={label}>Until</span>
              <Input type="date" value={v.agreementExpiry ?? ""} onChange={(e) => set("agreementExpiry", e.target.value)} />
            </label>
          </div>
          <label className={field}>
            <span className={label}>Agreement reference</span>
            <Input value={v.agreementRef ?? ""} onChange={(e) => set("agreementRef", e.target.value)} />
          </label>
          <div className="grid gap-2 rounded-lg border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="accent-foreground" checked={v.collectsTuition} onChange={(e) => set("collectsTuition", e.target.checked)} /> We collect tuition from students and remit it
            </label>
            {v.collectsTuition ? (
              <div className="grid grid-cols-[7rem_1fr] gap-2">
                <label className={field}>
                  <span className={label}>Remit within (days)</span>
                  <Input type="number" value={v.remitDays ?? ""} onChange={(e) => set("remitDays", e.target.value ? Number(e.target.value) : undefined)} />
                </label>
                <label className={field}>
                  <span className={label}>Institution bank details</span>
                  <Input value={v.bankDetails ?? ""} onChange={(e) => set("bankDetails", e.target.value)} placeholder="BSB · account · reference format" />
                </label>
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              <span className={label}>Contact</span>
              <Input value={v.contactName ?? ""} onChange={(e) => set("contactName", e.target.value)} />
            </label>
            <label className={field}>
              <span className={label}>Contact email</span>
              <Input value={v.contactEmail ?? ""} onChange={(e) => set("contactEmail", e.target.value)} />
            </label>
          </div>
          <label className={field}>
            <span className={label}>Notes (incentives, intake deadlines, marketing)</span>
            <Textarea rows={2} value={v.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </label>
          <Button disabled={pending} onClick={() => run(() => savePartnership(inst.id, { ...v, remitDays: v.remitDays ?? null }), "Agreement saved.", () => setOpen(false))}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save agreement
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScholarshipDialog({ sch, institutions, trigger }: { sch?: Sch; institutions: Inst[]; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [v, setV] = useState({ institutionId: sch?.institutionId ?? institutions.find((i) => i.partner)?.id ?? null, name: sch?.name ?? "", kind: (sch?.kind ?? "percent") as "percent" | "amount", value: sch?.value ?? "", appliesTo: (sch?.appliesTo ?? "first_year") as "first_year", funding: (sch?.funding ?? "institution") as "institution", eligibility: sch?.eligibility ?? "", conditions: sch?.conditions ?? "", maxAwards: sch?.maxAwards ?? "", closesAt: sch?.closesAt ?? "", active: sch?.active ?? true });
  const { pending, run } = useAction();
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sch ? "Edit scholarship" : "New scholarship"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className={field}>
            <span className={label}>Name</span>
            <Input value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="International Merit Scholarship" />
          </label>
          <label className={field}>
            <span className={label}>Institution (under its agreement)</span>
            <select className={select} value={v.institutionId ?? ""} onChange={(e) => set("institutionId", e.target.value || null)}>
              <option value="">Any institution (agency-funded)</option>
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                  {i.partner ? " · partner" : ""}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className={field}>
              <span className={label}>Type</span>
              <select className={select} value={v.kind} onChange={(e) => set("kind", e.target.value as "percent")}>
                <option value="percent">% of tuition</option>
                <option value="amount">Fixed $</option>
              </select>
            </label>
            <label className={field}>
              <span className={label}>{v.kind === "percent" ? "Percent" : "Amount ($)"}</span>
              <Input inputMode="decimal" value={v.value} onChange={(e) => set("value", e.target.value)} />
            </label>
            <label className={field}>
              <span className={label}>Applies to</span>
              <select className={select} value={v.appliesTo} onChange={(e) => set("appliesTo", e.target.value as "first_year")} disabled={v.kind === "amount"}>
                {Object.entries(APPLIES).map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className={field}>
              <span className={label}>Funding</span>
              <select className={select} value={v.funding} onChange={(e) => set("funding", e.target.value as "institution")}>
                <option value="institution">Institution</option>
                <option value="agency">Agency</option>
                <option value="shared">Shared</option>
              </select>
            </label>
            <label className={field}>
              <span className={label}>Places (optional)</span>
              <Input type="number" value={v.maxAwards} onChange={(e) => set("maxAwards", e.target.value)} />
            </label>
            <label className={field}>
              <span className={label}>Closes</span>
              <Input type="date" value={v.closesAt} onChange={(e) => set("closesAt", e.target.value)} />
            </label>
          </div>
          <label className={field}>
            <span className={label}>Eligibility</span>
            <Textarea rows={2} value={v.eligibility} onChange={(e) => set("eligibility", e.target.value)} placeholder="New international students, GPA 70%+, intakes in 2027" />
          </label>
          <label className={field}>
            <span className={label}>Conditions (go in the offer letter)</span>
            <Textarea rows={3} value={v.conditions} onChange={(e) => set("conditions", e.target.value)} placeholder="Maintain a 65% average and full-time enrolment each semester." />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-foreground" checked={v.active} onChange={(e) => set("active", e.target.checked)} /> Open for new awards
          </label>
          <Button disabled={pending} onClick={() => run(() => saveScholarship(sch?.id ?? "new", { ...v, maxAwards: v.maxAwards === "" ? null : Number(v.maxAwards), closesAt: v.closesAt || null }), "Scholarship saved.", () => setOpen(false))}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AwardDialog({ apps, scholarships, institutions }: { apps: App[]; scholarships: Sch[]; institutions: Inst[] }) {
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState("");
  const [schId, setSchId] = useState("");
  const { pending, run } = useAction();
  const app = apps.find((a) => a.id === appId);
  const fits = scholarships.filter((x) => x.active && (!x.institutionId || x.institutionId === app?.institutionId));
  const sch = fits.find((x) => x.id === schId);
  const est = sch && app ? (sch.kind === "amount" ? Number(sch.value) : (Number(app.tuitionFee ?? 0) * Number(sch.value) * (sch.appliesTo === "first_semester" ? 0.5 : sch.appliesTo === "full_course" ? 2 : 1)) / 100) : 0;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Award /> Award scholarship
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Award a scholarship</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className={field}>
            <span className={label}>Student application</span>
            <select className={select} value={appId} onChange={(e) => (setAppId(e.target.value), setSchId(""))}>
              <option value="">Choose…</option>
              {apps.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.clientName} · {a.course} · {institutions.find((i) => i.id === a.institutionId)?.name ?? "—"}
                </option>
              ))}
            </select>
          </label>
          <label className={field}>
            <span className={label}>Scholarship</span>
            <select className={select} value={schId} onChange={(e) => setSchId(e.target.value)} disabled={!app}>
              <option value="">{app ? (fits.length ? "Choose…" : "No open scholarships for this institution") : "Choose an application first"}</option>
              {fits.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} · {x.kind === "percent" ? `${Number(x.value)}%` : aud(x.value)}
                </option>
              ))}
            </select>
          </label>
          {sch && app ? (
            <p className="rounded-lg bg-muted/50 p-2.5 text-xs">
              Worth about <b>{aud(est)}</b> on {app.tuitionFee ? `${aud(app.tuitionFee)} a year` : "this application"}. The offer letter is filled in from the application and sent to {app.clientName} to sign in the portal; your registered agent countersigns. Once signed, it&apos;s applied automatically when you bill tuition.
            </p>
          ) : null}
          <Button disabled={pending || !sch || !app} onClick={() => run(() => awardScholarship(appId, schId), "Scholarship offered. The letter is on its way to sign.", () => setOpen(false))}>
            {pending ? <Loader2 className="animate-spin" /> : <Send />} Offer and send letter
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const AWARD_TONE: Record<string, Tone> = { offered: "blue", accepted: "green", declined: "gray", revoked: "red" };

export function ScholarshipsPanel({ scholarships, awards, apps, institutions }: { scholarships: Sch[]; awards: AwardRow[]; apps: App[]; institutions: Inst[] }) {
  const { pending, run } = useAction();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">Scholarships you can offer under your partner agreements. Each award sends an offer letter for the student to sign.</p>
        <span className="ml-auto flex gap-2">
          <ScholarshipDialog
            institutions={institutions}
            trigger={
              <Button size="sm" variant="outline" className="rounded-full">
                <Plus /> New scholarship
              </Button>
            }
          />
          <AwardDialog apps={apps} scholarships={scholarships} institutions={institutions} />
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {scholarships.map((x) => {
          const mine = awards.filter((a) => a.scholarshipId === x.id && ["offered", "accepted"].includes(a.status));
          return (
            <div key={x.id} className={cn("grid gap-2 rounded-2xl border bg-card p-4", !x.active && "opacity-60")}>
              <div className="flex items-start gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-amber-500/12 text-amber-600">
                  <Award className="size-4.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{x.name}</p>
                  <p className="text-xs text-muted-foreground">{institutions.find((i) => i.id === x.institutionId)?.name ?? "Any institution"}</p>
                </div>
                <p className="text-lg font-semibold tabular-nums">{x.kind === "percent" ? `${Number(x.value)}%` : aud(x.value)}</p>
              </div>
              <p className="text-xs text-muted-foreground">
                {x.kind === "percent" ? `${APPLIES[x.appliesTo]} · ` : ""}
                {FUNDING[x.funding]}
                {x.maxAwards ? ` · ${mine.length}/${x.maxAwards} places used` : ` · ${mine.length} awarded`}
                {x.closesAt ? ` · closes ${x.closesAt}` : ""}
              </p>
              {x.eligibility ? <p className="line-clamp-2 text-xs">{x.eligibility}</p> : null}
              <ScholarshipDialog
                sch={x}
                institutions={institutions}
                trigger={
                  <Button size="xs" variant="ghost" className="justify-self-start">
                    Edit
                  </Button>
                }
              />
            </div>
          );
        })}
        {!scholarships.length ? <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground sm:col-span-2 xl:col-span-3">No scholarships yet. Add the ones in your partner agreements.</p> : null}
      </div>
      {awards.length ? (
        <div className="rounded-2xl border bg-card">
          <p className="border-b px-4 py-2.5 text-[13px] font-medium">Awards</p>
          <ul className="divide-y">
            {awards.map((a) => {
              const sc = scholarships.find((x) => x.id === a.scholarshipId);
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{a.clientName}</span> <span className="text-muted-foreground">· {sc?.name} · {a.course}</span>
                  </span>
                  <span className="tabular-nums">{aud(a.amount)}</span>
                  <Pill t={AWARD_TONE[a.status] ?? "gray"}>{a.status === "offered" ? (a.signStatus === "viewed" ? "Letter opened" : "Letter sent") : a.status[0].toUpperCase() + a.status.slice(1)}</Pill>
                  {a.signRequestId ? (
                    <Button asChild size="icon-xs" variant="ghost" aria-label="Offer letter">
                      <a href={`/app/sign/${a.signRequestId}`}>
                        <FileText />
                      </a>
                    </Button>
                  ) : null}
                  {a.status === "offered" || a.status === "accepted" ? (
                    <Button size="icon-xs" variant="ghost" disabled={pending} aria-label="Revoke" title="Revoke" onClick={() => run(() => setAwardStatus(a.id, "revoked"), "Award revoked.")}>
                      <Undo2 />
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function BillDialog({ apps, institutions }: { apps: App[]; institutions: Inst[] }) {
  const [open, setOpen] = useState(false);
  const [appId, setAppId] = useState("");
  const [v, setV] = useState({ period: "", kind: "tuition" as const, gross: "", applyScholarship: true, dueAt: "" });
  const { pending, run } = useAction();
  const app = apps.find((a) => a.id === appId);
  const collectable = apps.filter((a) => institutions.find((i) => i.id === a.institutionId)?.collectsTuition);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Banknote /> Bill tuition
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bill tuition for an institution</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className={field}>
            <span className={label}>Student application</span>
            <select
              className={select}
              value={appId}
              onChange={(e) => {
                setAppId(e.target.value);
                const a = apps.find((x) => x.id === e.target.value);
                if (a?.tuitionFee && !v.gross) setV((x) => ({ ...x, gross: String(Math.round(Number(a.tuitionFee) / 2)) }));
              }}
            >
              <option value="">{collectable.length ? "Choose…" : "No institutions are set to collect tuition"}</option>
              {collectable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.clientName} · {a.course} · {institutions.find((i) => i.id === a.institutionId)?.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              <span className={label}>Period</span>
              <Input value={v.period} onChange={(e) => setV((x) => ({ ...x, period: e.target.value }))} placeholder="Semester 1, 2027" />
            </label>
            <label className={field}>
              <span className={label}>Fee</span>
              <select className={select} value={v.kind} onChange={(e) => setV((x) => ({ ...x, kind: e.target.value as "tuition" }))}>
                <option value="tuition">Tuition</option>
                <option value="enrolment">Enrolment</option>
                <option value="materials">Materials</option>
                <option value="oshc">OSHC</option>
                <option value="other">Other</option>
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className={field}>
              <span className={label}>Amount (before scholarship)</span>
              <Input inputMode="decimal" value={v.gross} onChange={(e) => setV((x) => ({ ...x, gross: e.target.value }))} />
            </label>
            <label className={field}>
              <span className={label}>Due</span>
              <Input type="date" value={v.dueAt} onChange={(e) => setV((x) => ({ ...x, dueAt: e.target.value }))} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-foreground" checked={v.applyScholarship} onChange={(e) => setV((x) => ({ ...x, applyScholarship: e.target.checked }))} /> Apply accepted scholarships
          </label>
          {app ? <p className="text-xs text-muted-foreground">Creates an invoice {app.clientName} can pay in the portal (card or bank transfer). Payments go to your client account until you remit them to the institution.</p> : null}
          <Button disabled={pending || !app} onClick={() => run(() => billTuition(appId, { ...v, gross: Number(v.gross), dueAt: v.dueAt || null }), "Invoice created and waiting in the student's portal.", () => setOpen(false))}>
            {pending ? <Loader2 className="animate-spin" /> : <Receipt />} Create invoice
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RemitButton({ pay }: { pay: Pay }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          Remit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Remit {aud(pay.amount)} to {pay.institution}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <label className={field}>
            <span className={label}>Payment reference</span>
            <Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Bank transfer reference" />
          </label>
          <label className={field}>
            <span className={label}>Date paid</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <p className="text-xs text-muted-foreground">Records a payment out of your client (trust) account against this student.</p>
          <Button disabled={pending} onClick={() => run(() => remitTuition(pay.id, { reference: ref, date }), "Remittance recorded.", () => setOpen(false))}>
            {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Record remittance
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TuitionPanel({ payments, apps, institutions }: { payments: Pay[]; apps: App[]; institutions: Inst[] }) {
  const state = (p: Pay) => (p.status === "remitted" ? "remitted" : Number(p.invoicePaid ?? 0) + 0.005 >= Number(p.invoiceTotal ?? p.amount) ? "paid" : Number(p.invoicePaid ?? 0) > 0 ? "part" : "billed");
  const held = payments.filter((p) => state(p) === "paid").reduce((t, p) => t + Number(p.amount), 0);
  const owing = payments.filter((p) => ["billed", "part"].includes(state(p))).reduce((t, p) => t + Number(p.amount) - Number(p.invoicePaid ?? 0), 0);
  const remitted = payments.filter((p) => state(p) === "remitted").reduce((t, p) => t + Number(p.amount), 0);
  const tone: Record<string, Tone> = { billed: "amber", part: "amber", paid: "blue", remitted: "green" };
  const word: Record<string, string> = { billed: "Awaiting payment", part: "Part paid", paid: "Paid · to remit", remitted: "Remitted" };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {[
          ["Owed by students", owing],
          ["Held, to remit", held],
          ["Remitted", remitted],
        ].map(([k, v]) => (
          <div key={k as string} className="min-w-36 rounded-xl border bg-card px-3 py-2">
            <p className="text-[11px] text-muted-foreground">{k}</p>
            <p className="text-lg font-semibold tabular-nums">{aud(v as number)}</p>
          </div>
        ))}
        <span className="ml-auto">
          <BillDialog apps={apps} institutions={institutions} />
        </span>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b">
              {["Student", "Institution · period", "Fee", "Scholarship", "Payable", "Status", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {payments.map((p) => {
              const st = state(p);
              return (
                <tr key={p.id}>
                  <td className="px-3 py-2">
                    <p className="font-medium">{p.clientName}</p>
                    <p className="text-xs text-muted-foreground">{p.invoiceNumber}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p>{p.institution ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.period} · {p.kind}
                    </p>
                  </td>
                  <td className="px-3 py-2 tabular-nums">{aud(p.gross)}</td>
                  <td className="px-3 py-2 tabular-nums text-emerald-600">{Number(p.scholarship) ? `-${aud(p.scholarship)}` : "—"}</td>
                  <td className="px-3 py-2 font-medium tabular-nums">{aud(p.amount)}</td>
                  <td className="px-3 py-2">
                    <Pill t={tone[st]}>{word[st]}</Pill>
                    {p.remittedAt ? <p className="mt-0.5 text-[11px] text-muted-foreground">{p.remittedAt}{p.remittedRef ? ` · ${p.remittedRef}` : ""}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span className="flex justify-end gap-1">
                      {st === "paid" ? <RemitButton pay={p} /> : null}
                      <Button asChild size="xs" variant="ghost">
                        <a href={`/api/tuition/${p.id}/receipt`} target="_blank" rel="noreferrer">
                          <Receipt /> Receipt
                        </a>
                      </Button>
                    </span>
                  </td>
                </tr>
              );
            })}
            {!payments.length ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  No tuition collected yet. Turn on &ldquo;We collect tuition&rdquo; in an institution&apos;s agreement, then bill a student.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
