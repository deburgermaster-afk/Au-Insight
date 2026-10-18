"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { label } from "@/components/app/badges";
import { TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { ActionDialog, useAction } from "@/components/forms/action-dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeMemberRole } from "@/lib/actions";
import { positions } from "@/lib/permissions";
import { cancelInvite, inviteStaff } from "@/lib/team-actions";

const roles = ["admin", "supervisor", "agent", "staff"];

export function RoleSelect({ memberId, role, canEdit }: { memberId: string; role: string; canEdit: boolean }) {
  const [value, setValue] = useState(role);
  const [pending, start] = useTransition();
  if (!canEdit || role === "owner") return <span className="text-sm capitalize text-muted-foreground">{label(role)}</span>;
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v);
        start(async () => {
          const r = await changeMemberRole(memberId, v);
          if (!r.ok) {
            setValue(role);
            toast.error(r.error);
          } else toast.success(`Role changed to ${label(v)}`);
        });
      }}
    >
      <SelectTrigger size="sm" className="w-32" disabled={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {roles.map((r) => (
          <SelectItem key={r} value={r}>
            {label(r)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function InviteDialog({ roles = [], mailSuffix }: { roles?: { id: string; name: string }[]; mailSuffix: string | null }) {
  const [position, setPosition] = useState("migration_agent");
  const [email, setEmail] = useState("");
  const [work, setWork] = useState<string | null>(null);
  const [makeMail, setMakeMail] = useState(true);
  // Suggest their first name (from the personal email) until someone types their own.
  const suggested = email.split("@")[0]?.split(/[._+-]/)[0]?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  const workLocal = work ?? suggested;
  return (
    <ActionDialog
      trigger={
        <Button size="sm">
          <UserPlus /> Invite
        </Button>
      }
      title="Invite a team member"
      description="They get an email to set up their login, mailbox and employee portal. Their position decides what they can see."
      action={inviteStaff}
      submitLabel="Send invite"
      success="Invitation sent"
    >
      <TextField label="Their email" name="email" type="email" required placeholder="name@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} hint="Where the invitation goes." />
      {mailSuffix ? (
        <div className="grid gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="accent-foreground" checked={makeMail} onChange={(e) => setMakeMail(e.target.checked)} /> Create their work email
          </label>
          {makeMail ? (
            <div className="flex items-center overflow-hidden rounded-md border bg-background text-sm focus-within:ring-2 focus-within:ring-ring/40">
              <input name="workEmail" value={workLocal} onChange={(e) => setWork(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))} placeholder="name" className="h-9 min-w-0 flex-1 bg-transparent px-3 outline-none" />
              <span className="shrink-0 bg-muted px-3 py-2 text-muted-foreground">{mailSuffix}</span>
            </div>
          ) : null}
          <p className="text-[12px] text-muted-foreground">Ready the moment they accept: they send and receive as this address in the Inbox.</p>
        </div>
      ) : null}
      {roles.length ? (
        <div className="grid gap-1.5">
          <Label>Access</Label>
          <select name="roleId" defaultValue="" className="h-9 rounded-md border bg-background px-2 text-sm">
            <option value="">Position defaults</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label>Position</Label>
        <input type="hidden" name="position" value={position} />
        <div className="grid gap-1.5">
          {positions.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPosition(p.key)}
              className={`rounded-xl border p-2.5 text-left transition ${position === p.key ? "border-primary bg-primary/5" : "hover:border-foreground/20"}`}
            >
              <span className="block text-sm font-medium">{p.label}</span>
              <span className="block text-xs text-muted-foreground">{p.about}</span>
            </button>
          ))}
        </div>
      </div>
      {position === "migration_agent" || position === "principal" ? <TextField label="MARN" name="marn" inputMode="numeric" hint="Immigration features unlock only with a current MARN." /> : null}
    </ActionDialog>
  );
}

export function CancelInvite({ id }: { id: string }) {
  const { pending, run } = useAction();
  return (
    <Button size="xs" variant="ghost" disabled={pending} onClick={() => run(() => cancelInvite(id), "Invitation cancelled")}>
      {pending ? <Loader2 className="animate-spin" /> : null}
      Cancel
    </Button>
  );
}
