"use client";

import { Loader2, Send } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { addNote, setTaskStatus, updateClientStage } from "@/lib/actions";
import { cn } from "@/lib/utils";
import { label } from "./badges";

export function ClientStageSelect({ clientId, stage }: { clientId: string; stage: string }) {
  const [value, setValue] = useState(stage);
  const [pending, start] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v);
        start(async () => {
          const r = await updateClientStage(clientId, v);
          if (!r.ok) {
            toast.error(r.error);
            setValue(stage);
          } else toast.success(`Moved to ${label(v)}`);
        });
      }}
    >
      <SelectTrigger size="sm" className="w-36" disabled={pending}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {["lead", "prospect", "active", "on_hold", "past", "lost"].map((s) => (
          <SelectItem key={s} value={s}>
            {label(s)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function NoteComposer({ clientId, matterId }: { clientId?: string; matterId?: string }) {
  const [kind, setKind] = useState("note");
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={ref}
      className="grid gap-2 rounded-xl border bg-background p-2 focus-within:ring-3 focus-within:ring-ring/30"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        f.set("kind", kind);
        if (clientId) f.set("clientId", clientId);
        if (matterId) f.set("matterId", matterId);
        start(async () => {
          const r = await addNote(f);
          if (!r.ok) return void toast.error(r.error);
          ref.current?.reset();
          toast.success("Added to timeline");
        });
      }}
    >
      <Textarea name="body" required rows={2} placeholder="Add a note, or log a call or meeting…" className="min-h-14 resize-none border-0 shadow-none focus-visible:ring-0" />
      <div className="flex items-center gap-2">
        <ToggleGroup type="single" value={kind} onValueChange={(v) => v && setKind(v)} size="sm" variant="outline">
          <ToggleGroupItem value="note">Note</ToggleGroupItem>
          <ToggleGroupItem value="call">Call</ToggleGroupItem>
          <ToggleGroupItem value="meeting">Meeting</ToggleGroupItem>
        </ToggleGroup>
        <Button type="submit" size="sm" className="ml-auto" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Save
        </Button>
      </div>
    </form>
  );
}

export function TaskCheck({ id, done, title, className }: { id: string; done: boolean; title: string; className?: string }) {
  const [checked, setChecked] = useState(done);
  const [, start] = useTransition();
  return (
    <label className={cn("flex min-w-0 cursor-pointer items-center gap-3", className)}>
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => {
          const next = v === true;
          setChecked(next);
          start(async () => {
            const r = await setTaskStatus(id, next ? "done" : "todo");
            if (!r.ok) {
              setChecked(!next);
              toast.error(r.error);
            }
          });
        }}
      />
      <span className={cn("truncate text-sm transition", checked && "text-muted-foreground line-through")}>{title}</span>
    </label>
  );
}
