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

export function InviteDialog() {
  const [position, setPosition] = useState("migration_agent");
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
      <TextField label="Email" name="email" type="email" required placeholder="name@agency.com.au" />
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
