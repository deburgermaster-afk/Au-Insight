"use client";

import { AtSign, Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { type Cap, features, positions } from "@/lib/permissions";
import { assignRole, deleteRole, saveRole } from "@/lib/role-actions";
import { addWorkEmail } from "@/lib/team-actions";
import { cn } from "@/lib/utils";

export type RoleRow = { id: string; name: string; description: string | null; color: string; caps: string[]; people: number };
const COLORS = ["#6d5efc", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"];

/** Create or edit a custom role: a name and the features it turns on, with the pages each opens. */
export function RoleEditor({ role, defaults, trigger }: { role?: RoleRow; defaults: Record<string, string[]>; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [color, setColor] = useState(role?.color ?? COLORS[0]);
  const [caps, setCaps] = useState<string[]>(role?.caps ?? ["clients", "mail", "files"]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toggle = (c: string) => setCaps((x) => (x.includes(c) ? x.filter((y) => y !== c) : [...x, c]));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{role ? `Edit ${role.name}` : "New access role"}</DialogTitle>
          <DialogDescription>Choose exactly which features and pages this role sees. People with it get the change on their next page load.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Senior case officer" />
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-foreground")} style={{ background: c }} />
              ))}
            </div>
          </div>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this role is for (optional)" />
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
            Start from:
            {positions.map((p) => (
              <button key={p.key} type="button" onClick={() => setCaps(defaults[p.key] ?? [])} className="rounded-full border px-2 py-0.5 hover:bg-muted">
                {p.short}
              </button>
            ))}
          </div>
          <ul className="grid gap-1.5">
            {features.map((f) => {
              const on = caps.includes(f.cap);
              return (
                <li key={f.cap}>
                  <button type="button" onClick={() => toggle(f.cap)} className={cn("flex w-full items-start gap-3 rounded-xl border p-3 text-left transition", on ? "border-primary/50 bg-primary/5" : "hover:border-foreground/20")}>
                    <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-transparent bg-primary text-primary-foreground" : "")}>{on ? <Check className="size-3.5" strokeWidth={3} /> : null}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{f.label}</span>
                      <span className="block text-[12px] text-muted-foreground">{f.about}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        {f.pages.map((pg) => (
                          <span key={pg} className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {pg}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center gap-2">
            {role ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-rose-500"
                disabled={pending}
                onClick={() =>
                  confirm(`Delete ${role.name}? ${role.people ? `${role.people} ${role.people === 1 ? "person goes" : "people go"} back to their position's defaults.` : ""}`) &&
                  start(async () => {
                    const r = await deleteRole(role.id);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success("Role deleted");
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                <Trash2 /> Delete role
              </Button>
            ) : null}
            <Button
              className="ml-auto rounded-full"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await saveRole(role?.id ?? "new", { name, description, color, caps });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(role ? "Role updated" : "Role created");
                  setOpen(false);
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} {role ? "Save role" : "Create role"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Who can see what: positions (defaults) and the agency's own roles, feature by feature. */
export function AccessMatrix({ roles, defaults, canEdit }: { roles: RoleRow[]; defaults: Record<string, string[]>; canEdit: boolean }) {
  const cols = [...positions.map((p) => ({ key: p.key, name: p.short, caps: defaults[p.key] ?? [], custom: null as RoleRow | null })), ...roles.map((r) => ({ key: r.id, name: r.name, caps: r.caps, custom: r }))];
  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[760px] text-[12px]">
          <thead className="bg-muted/40 text-left text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-muted/90 px-3 py-2 font-medium">Feature</th>
              {cols.map((c) => (
                <th key={c.key} className="px-2 py-2 text-center font-medium">
                  {c.custom ? (
                    canEdit ? (
                      <RoleEditor
                        role={c.custom}
                        defaults={defaults}
                        trigger={
                          <button type="button" className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-white" style={{ background: c.custom.color }}>
                            {c.name} <Pencil className="size-3" />
                          </button>
                        }
                      />
                    ) : (
                      <span className="rounded-full px-2 py-0.5 text-white" style={{ background: c.custom.color }}>
                        {c.name}
                      </span>
                    )
                  ) : (
                    c.name
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {features.map((f) => (
              <tr key={f.cap}>
                <td className="sticky left-0 bg-card px-3 py-2">
                  <span className="block font-medium">{f.label}</span>
                  <span className="text-[11px] text-muted-foreground">{f.pages.join(" · ")}</span>
                </td>
                {cols.map((c) => (
                  <td key={c.key} className="px-2 py-2 text-center">
                    {c.caps.includes(f.cap as Cap) ? <Check className="mx-auto size-4 text-emerald-500" /> : <span className="text-muted-foreground/40">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">Positions are Lodgely&apos;s defaults. Your own roles replace a person&apos;s defaults when assigned. Owners always have everything; admins always keep Team &amp; admin; immigration work also needs a current MARN.</p>
    </div>
  );
}

/** A member's access: their position's defaults or one of the agency's roles. */
export function AccessSelect({ userId, roleId, roles, positionName, canEdit }: { userId: string; roleId: string | null; roles: RoleRow[]; positionName: string; canEdit: boolean }) {
  const [value, setValue] = useState(roleId ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!canEdit) {
    const r = roles.find((x) => x.id === roleId);
    return <span className="text-xs text-muted-foreground">{r ? r.name : `${positionName} defaults`}</span>;
  }
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        start(async () => {
          const r = await assignRole(userId, v || null);
          if (!r.ok) {
            setValue(roleId ?? "");
            return void toast.error(r.error);
          }
          toast.success(v ? `Access set to ${roles.find((x) => x.id === v)?.name}` : "Back to position defaults");
          router.refresh();
        });
      }}
      className="h-8 max-w-[11rem] rounded-md border bg-background px-1.5 text-xs"
    >
      <option value="">{positionName} defaults</option>
      {roles.map((r) => (
        <option key={r.id} value={r.id}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

/** Shows a member's work address, or lets an admin create one. */
export function WorkEmail({ userId, address, suggestion, canEdit }: { userId: string; address: string | null; suggestion: string; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (address)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-sky-600">
        <AtSign className="size-3" /> {address}
      </span>
    );
  if (!canEdit) return null;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await addWorkEmail(userId, suggestion);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Created ${r.id}`);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Create work email
    </button>
  );
}
