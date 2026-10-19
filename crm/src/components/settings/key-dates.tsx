"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { checkKeyDatesNow, saveKeyDates } from "@/lib/key-dates-actions";
import { cn } from "@/lib/utils";

type Cfg = { birthdays: "off" | "task" | "greet"; birthdayMessage: string; anniversaries: "off" | "task"; sponsor: boolean };

function Choice<T extends string>({ value, options, onChange, disabled }: { value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, l]) => (
        <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)} className={cn("rounded-full border px-3 py-1 text-xs", value === v ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function KeyDatesForm({ initial, canEdit }: { initial: Cfg; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [pending, start] = useTransition();
  const [running, run] = useTransition();
  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Client birthdays</Label>
        <Choice value={v.birthdays} disabled={!canEdit} onChange={(birthdays) => setV({ ...v, birthdays })} options={[["off", "Off"], ["task", "Task for the case officer"], ["greet", "Task + birthday email to the client"]]} />
        {v.birthdays === "greet" ? (
          <div className="grid gap-1.5">
            <Textarea rows={3} value={v.birthdayMessage} disabled={!canEdit} onChange={(e) => setV({ ...v, birthdayMessage: e.target.value })} />
            <p className="text-[11px] text-muted-foreground">{"{firstName}"} and {"{agency}"} are filled in. Sent from your shared mailbox around 7am Sydney time.</p>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label>Visa grant anniversaries</Label>
        <Choice value={v.anniversaries} disabled={!canEdit} onChange={(anniversaries) => setV({ ...v, anniversaries })} options={[["off", "Off"], ["task", "Task each year, with the next step"]]} />
        <p className="text-[11px] text-muted-foreground">For example: citizenship after a year as a permanent resident, the Resident Return visa before the 5-year travel facility ends, 191 after 3 years on a 491 or 494, and the 186 transition after 2 years on a 482.</p>
      </div>
      <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
        <span>
          <span className="block font-medium">Sponsor obligations</span>
          <span className="block text-xs text-muted-foreground">Tasks and emails before sponsorship (90 and 30 days), nomination approvals (30 and 7 days) and sponsored workers&apos; visas (90 and 30 days) run out, and before 28-day notifications are due.</span>
        </span>
        <Switch checked={v.sponsor} disabled={!canEdit} onCheckedChange={(sponsor) => setV({ ...v, sponsor })} />
      </label>
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await saveKeyDates(v);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Saved");
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
          <Button
            variant="outline"
            disabled={running}
            onClick={() =>
              run(async () => {
                const r = await checkKeyDatesNow();
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.made ? `${r.made} reminder${r.made === 1 ? "" : "s"} added to Tasks` : "Nothing due today");
              })
            }
          >
            {running ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check today now
          </Button>
        </div>
      ) : null}
    </div>
  );
}
