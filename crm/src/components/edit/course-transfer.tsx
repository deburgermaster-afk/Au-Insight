"use client";

import { AlertTriangle, ArrowRightLeft, Info, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { transferChecks } from "@/lib/course-transfer";
import { AQF } from "@/lib/record-specs";
import { setReleaseLetter, transferCourse } from "@/lib/transfer-actions";

type App = { id: string; course: string; institutionId: string | null; institution: string | null; status: string; aqfLevel: number | null; courseStart: string | null; student: string; onshore: boolean };

const today = () => new Date().toISOString().slice(0, 10);
const sel = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

/** Change course or provider: closes this application as transferred and opens a linked new one. */
export function TransferCourse({ app, institutions, trigger }: { app: App; institutions: { id: string; name: string }[]; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [inst, setInst] = useState(app.institutionId ?? "");
  const [aqf, setAqf] = useState<string>(app.aqfLevel != null ? String(app.aqfLevel) : "");
  const [on, setOn] = useState(today());
  const [pending, start] = useTransition();
  const router = useRouter();
  const sameProvider = inst !== "new" && inst === app.institutionId;
  const checks = transferChecks({ sameProvider, fromStatus: app.status, fromAqf: app.aqfLevel, toAqf: aqf === "" ? null : Number(aqf), fromStart: app.courseStart, transferOn: on, onshore: app.onshore });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="xs" variant="outline">
            <ArrowRightLeft /> Change course
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change course or provider for {app.student}</DialogTitle>
          <DialogDescription>
            From {app.course}
            {app.institution ? ` at ${app.institution}` : ""}. The current application closes as transferred and a new one opens, linked to it, with its own CoE.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const g = (k: string) => (String(f.get(k) ?? "").trim() || null);
            start(async () => {
              const r = await transferCourse(app.id, {
                institutionId: inst && inst !== "new" ? inst : null,
                providerName: inst === "new" ? g("providerName") : null,
                course: String(f.get("course") ?? ""),
                courseCode: g("courseCode"),
                aqfLevel: aqf === "" ? null : Number(aqf),
                intake: g("intake"),
                courseStart: g("courseStart"),
                tuitionFee: g("tuitionFee"),
                reason: String(f.get("reason") ?? ""),
                transferOn: on,
              });
              if (!r.ok) return void toast.error(r.error);
              toast.success(sameProvider ? "Course changed" : "Provider transfer started");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Provider</Label>
              <select value={inst} onChange={(e) => setInst(e.target.value)} className={sel}>
                {institutions.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                    {i.id === app.institutionId ? " (current)" : ""}
                  </option>
                ))}
                <option value="new">A provider not listed…</option>
              </select>
            </div>
            {inst === "new" ? (
              <div className="grid gap-1.5">
                <Label>New provider name</Label>
                <Input name="providerName" required />
              </div>
            ) : null}
            <div className="grid gap-1.5 sm:col-span-2">
              <Label>New course</Label>
              <Input name="course" required placeholder="e.g. Master of Professional Accounting" />
            </div>
            <div className="grid gap-1.5">
              <Label>CRICOS course code</Label>
              <Input name="courseCode" />
            </div>
            <div className="grid gap-1.5">
              <Label>AQF level</Label>
              <select value={aqf} onChange={(e) => setAqf(e.target.value)} className={sel}>
                <option value="">Not sure</option>
                <option value="0">ELICOS / foundation</option>
                {Object.entries(AQF).map(([n, l]) => (
                  <option key={n} value={n}>
                    {n} · {l}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label>Intake</Label>
              <Input name="intake" placeholder="Feb 2027" />
            </div>
            <div className="grid gap-1.5">
              <Label>Course start</Label>
              <Input name="courseStart" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label>Tuition fee (first year)</Label>
              <Input name="tuitionFee" inputMode="decimal" />
            </div>
            <div className="grid gap-1.5">
              <Label>Date of the change</Label>
              <Input type="date" value={on} onChange={(e) => setOn(e.target.value)} />
            </div>
          </div>
          <Textarea name="reason" rows={2} required placeholder="Why the student is changing (recorded on the student's file)" />
          {checks.length ? (
            <ul className="grid gap-1.5 rounded-xl border bg-muted/30 p-3 text-[12px]">
              {checks.map((c) => (
                <li key={c.text} className="flex gap-1.5">
                  {c.level === "block" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> : c.level === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <Info className="mt-0.5 size-3.5 shrink-0 text-sky-500" />}
                  {c.text}
                </li>
              ))}
            </ul>
          ) : null}
          <Button className="justify-self-end rounded-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} {sameProvider ? "Change course" : "Start transfer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const RELEASE: Record<string, string> = { needed: "Release letter needed", requested: "Release requested", granted: "Release granted", refused: "Release refused", not_needed: "No release needed" };

/** Tracks the old provider's release letter on a transferred application. */
export function ReleaseLetter({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (status === "not_needed") return null;
  const tone = status === "granted" ? "text-emerald-500 bg-emerald-500/12" : status === "refused" ? "text-rose-500 bg-rose-500/12" : "text-amber-500 bg-amber-500/12";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={`rounded-md px-1.5 py-0.5 text-[11px] ${tone}`} disabled={pending}>
          {RELEASE[status] ?? status}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Release letter</DropdownMenuLabel>
        {(["needed", "requested", "granted", "refused"] as const)
          .filter((s) => s !== status)
          .map((s) => (
            <DropdownMenuItem
              key={s}
              onSelect={() =>
                start(async () => {
                  const r = await setReleaseLetter(id, s);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
            >
              {RELEASE[s]}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
