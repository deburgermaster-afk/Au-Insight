"use client";

import { ArrowRightLeft, Copy, Loader2, Pencil, Settings2, UserRoundCog, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import type { EditOptions } from "@/lib/edit-data";
import { changeMatterVisa, duplicateMatter, moveMatterToClient, reassignClient, reassignMatter } from "@/lib/transfer-actions";
import { visas } from "@/lib/visas";
import { EditRecord, type Values } from "./edit-record";

const sel = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, ok: string, after?: (r: ActionResult) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      after?.(r);
      router.refresh();
    });
  return { pending, run };
}

function Shell({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description: string; children: ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

type Staff = { value: string; label: string; registered?: boolean };

/** Everything you can do to a case beyond its stage: edit, hand over, move, change visa, duplicate. */
export function ManageCase({
  matter,
  values,
  options,
  caps,
  clients,
  staff,
}: {
  matter: { id: string; reference: string; clientId: string; visaCode: string; stream: string | null; stage: string; assignedTo: string | null; supervisorId: string | null; title: string };
  values: Values;
  options: EditOptions;
  caps: string[];
  clients: { id: string; name: string }[];
  staff: Staff[];
}) {
  const [dialog, setDialog] = useState<null | "reassign" | "move" | "visa" | "duplicate">(null);
  const { pending, run } = useRun();
  const close = () => setDialog(null);
  const lodged = ["lodged", "rfi", "decision"].includes(matter.stage);
  return (
    <>
      <EditRecord
        entity="matter"
        id={matter.id}
        values={values}
        options={options}
        caps={caps}
        title={`Edit ${matter.reference}`}
        trigger={
          <Button size="sm" variant="outline">
            <Pencil /> Edit
          </Button>
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Settings2 />} Manage
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuItem onSelect={() => setDialog("reassign")}>
            <UserRoundCog /> Hand over to another agent
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("visa")} disabled={lodged || !caps.includes("immigration")}>
            <ArrowRightLeft /> Change visa or stream
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog("move")}>
            <Users /> Move to another client
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setDialog("duplicate")}>
            <Copy /> Duplicate as a new case
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Shell open={dialog === "reassign"} onOpenChange={(o) => !o && close()} title={`Hand over ${matter.reference}`} description="Choose who runs the case and who supervises it. Live cases need a registered migration agent as case officer or supervisor.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () => reassignMatter(matter.id, { assignedTo: (f.get("assignedTo") as string) || null, supervisorId: (f.get("supervisorId") as string) || null, moveTasks: f.get("moveTasks") === "on", moveAppointments: f.get("moveAppointments") === "on", note: String(f.get("note") ?? "") }),
              "Case handed over",
              close,
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label>Case officer</Label>
            <select name="assignedTo" defaultValue={matter.assignedTo ?? ""} className={sel}>
              <option value="">Nobody</option>
              {staff.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                  {x.registered ? " · registered agent" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Supervising registered agent</Label>
            <select name="supervisorId" defaultValue={matter.supervisorId ?? ""} className={sel}>
              <option value="">None</option>
              {staff
                .filter((x) => x.registered)
                .map((x) => (
                  <option key={x.value} value={x.value}>
                    {x.label}
                  </option>
                ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="moveTasks" defaultChecked /> Move the outgoing officer&apos;s open tasks on this case
          </label>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="moveAppointments" defaultChecked /> Move their upcoming appointments for this case
          </label>
          <Textarea name="note" rows={3} placeholder="Handover note: where it's up to, what's next, anything the client is waiting on." />
          <Button className="justify-self-end rounded-full" disabled={pending}>
            Hand over
          </Button>
        </form>
      </Shell>

      <Shell open={dialog === "visa"} onOpenChange={(o) => !o && close()} title="Change visa or stream" description="The checklist is updated: new documents are added, ones no longer needed are waived, and everything already received is kept.">
        <VisaForm current={matter.visaCode} stream={matter.stream} pending={pending} onSubmit={(visaCode, stream, note) => run(() => changeMatterVisa(matter.id, { visaCode, stream, note }), "Visa changed", close)} />
      </Shell>

      <Shell open={dialog === "move"} onOpenChange={(o) => !o && close()} title="Move to another client" description="For a case opened on the wrong client, or when the main applicant changes. Documents, tasks, appointments, unpaid invoices and emails move with it. Not possible once the client has paid or signed the agreement.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => moveMatterToClient(matter.id, String(f.get("clientId")), String(f.get("note") ?? "")), "Case moved", close);
          }}
        >
          <select name="clientId" required defaultValue="" className={sel}>
            <option value="" disabled>
              Choose the client…
            </option>
            {clients
              .filter((c) => c.id !== matter.clientId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <Textarea name="note" rows={2} required placeholder="Why it's moving" />
          <Button className="justify-self-end rounded-full" disabled={pending}>
            Move case
          </Button>
        </form>
      </Shell>

      <Shell open={dialog === "duplicate"} onOpenChange={(o) => !o && close()} title="Duplicate as a new case" description="Opens a new case with the same team, fees and checklist: for a family member, a second application, or the next visa in a pathway.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(
              () => duplicateMatter(matter.id, { clientId: (f.get("clientId") as string) || null, visaCode: (f.get("visaCode") as string) || null, title: (f.get("title") as string) || null, keepReceived: f.get("keepReceived") === "on" }),
              "New case opened",
              close,
            );
          }}
        >
          <div className="grid gap-1.5">
            <Label>Client</Label>
            <select name="clientId" defaultValue={matter.clientId} className={sel}>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label>Visa</Label>
            <select name="visaCode" defaultValue={matter.visaCode} className={sel}>
              {visas.map((v) => (
                <option key={v.code} value={v.code}>
                  {v.code} · {v.name}
                </option>
              ))}
            </select>
          </div>
          <input name="title" placeholder="Title (optional)" className="h-9 rounded-md border bg-transparent px-3 text-sm" />
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="keepReceived" defaultChecked /> Carry over documents already received (same client only)
          </label>
          <Button className="justify-self-end rounded-full" disabled={pending}>
            Open new case
          </Button>
        </form>
      </Shell>
    </>
  );
}

function VisaForm({ current, stream, pending, onSubmit }: { current: string; stream: string | null; pending: boolean; onSubmit: (code: string, stream: string | null, note: string) => void }) {
  const [code, setCode] = useState(current);
  const visa = visas.find((v) => v.code === code);
  return (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        onSubmit(code, (f.get("stream") as string) || null, String(f.get("note") ?? ""));
      }}
    >
      <select value={code} onChange={(e) => setCode(e.target.value)} className={sel}>
        {visas.map((v) => (
          <option key={v.code} value={v.code}>
            {v.code} · {v.name}
          </option>
        ))}
      </select>
      {visa?.streams?.length ? (
        <select name="stream" key={code} defaultValue={code === current ? (stream ?? "") : ""} className={sel}>
          <option value="">No stream</option>
          {visa.streams.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      ) : null}
      <Textarea name="note" rows={2} placeholder="Why (e.g. client now eligible for 186 TRT)" />
      <Button className="justify-self-end rounded-full" disabled={pending}>
        Change visa
      </Button>
    </form>
  );
}

/** Client header: edit every detail, or hand the client to another case officer. */
export function ManageClient({ client, values, options, caps, staff }: { client: { id: string; name: string; assignedTo: string | null }; values: Values; options: EditOptions; caps: string[]; staff: Staff[] }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun();
  return (
    <>
      <EditRecord
        entity="client"
        id={client.id}
        values={values}
        options={options}
        caps={caps}
        title={`Edit ${client.name}`}
        trigger={
          <Button size="sm" variant="outline">
            <Pencil /> Edit
          </Button>
        }
      />
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <UserRoundCog /> Hand over
      </Button>
      <Shell open={open} onOpenChange={setOpen} title={`Hand over ${client.name}`} description="Give the client a new case officer. Their open cases can move too, with tasks and upcoming appointments.">
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(() => reassignClient(client.id, String(f.get("userId")), f.get("alsoCases") === "on", String(f.get("note") ?? "")), "Client handed over", () => setOpen(false));
          }}
        >
          <select name="userId" required defaultValue={client.assignedTo ?? ""} className={sel}>
            <option value="" disabled>
              New case officer…
            </option>
            {staff.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
                {x.registered ? " · registered agent" : ""}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13px]">
            <Checkbox name="alsoCases" defaultChecked /> Move their open cases too
          </label>
          <Textarea name="note" rows={3} placeholder="Handover note" />
          <Button className="justify-self-end rounded-full" disabled={pending}>
            Hand over
          </Button>
        </form>
      </Shell>
    </>
  );
}
