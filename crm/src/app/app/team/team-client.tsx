"use client";

import { Loader2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { label } from "@/components/app/badges";
import { SelectField, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { changeMemberRole } from "@/lib/actions";
import { authClient } from "@/lib/auth-client";

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

export function InviteDialog({ agencyId }: { agencyId: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const { error } = await authClient.organization.inviteMember({
                email: String(f.get("email")),
                role: String(f.get("role") || "agent") as "member",
                organizationId: agencyId,
              });
              if (error) return void toast.error(error.message ?? "Couldn't invite");
              toast.success("Invitation created");
              setOpen(false);
              location.reload();
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>They'll get their own login and mailbox, with the access their role allows.</DialogDescription>
          </DialogHeader>
          <TextField label="Email" name="email" type="email" required />
          <SelectField label="Role" name="role" defaultValue="agent" options={roles.map((r) => ({ value: r, label: label(r) }))} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Send invite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
