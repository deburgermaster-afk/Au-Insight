"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { EditOptions } from "@/lib/edit-data";
import { undoable } from "@/components/undo/undo";
import { addRecord, deleteRecord, saveRecord } from "@/lib/record-actions";
import { type EntityKey, type FieldSpec, SPECS } from "@/lib/record-specs";
import { cn } from "@/lib/utils";

export type Values = Record<string, string | number | boolean | string[] | null | undefined>;

const sel = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

/** datetime-local wants local time without a zone. */
function localDateTime(v: unknown) {
  if (!v) return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Field({ f, value, options, caps }: { f: FieldSpec; value: Values[string]; options: EditOptions; caps: string[] }) {
  const locked = Boolean(f.cap && !caps.includes(f.cap));
  const id = `f_${f.key}`;
  const v = value == null ? "" : Array.isArray(value) ? value.join(", ") : String(value);
  let input: ReactNode;
  if (f.type === "boolean")
    return (
      <label className={cn("flex items-center gap-2 self-end pb-2 text-[13px]", f.wide && "sm:col-span-2")}>
        <input type="hidden" name={`${f.key}__shown`} value="1" />
        <Checkbox name={f.key} defaultChecked={Boolean(value)} disabled={locked} /> {f.label}
      </label>
    );
  if (f.type === "textarea") input = <Textarea id={id} name={f.key} defaultValue={v} rows={3} disabled={locked} />;
  else if (f.type === "select" || f.type === "user" || f.type === "employer" || f.type === "institution" || f.type === "list") {
    const opts = f.type === "user" ? options.staff : f.type === "employer" ? options.employers : f.type === "institution" ? options.institutions : f.type === "list" ? options.lists[f.list!].map((x) => ({ value: f.list === "sources" ? x.toLowerCase() : x, label: x })) : (f.options ?? []);
    const known = opts.some((o) => o.value === v);
    input = (
      <select id={id} name={f.key} defaultValue={v} disabled={locked} className={sel}>
        <option value="">{f.required ? "Choose…" : "None"}</option>
        {v && !known ? <option value={v}>{v}</option> : null}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  } else if (f.type === "tags")
    input = (
      <>
        <Input id={id} name={f.key} defaultValue={v} list={`${id}_l`} placeholder="Comma separated" disabled={locked} />
        <datalist id={`${id}_l`}>
          {options.lists.tags.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </>
    );
  else
    input = (
      <Input
        id={id}
        name={f.key}
        type={f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : "text"}
        inputMode={f.type === "number" || f.type === "money" ? "decimal" : undefined}
        defaultValue={f.type === "datetime" ? localDateTime(value) : f.type === "date" ? v.slice(0, 10) : v}
        required={f.required}
        disabled={locked}
      />
    );
  return (
    <div className={cn("grid content-start gap-1.5", f.wide && "sm:col-span-2")}>
      <Label htmlFor={id} className="text-[12px]">
        {f.label}
        {locked ? <span className="font-normal text-muted-foreground"> · {f.cap === "immigration" ? "registered agent only" : "not your role"}</span> : null}
      </Label>
      {input}
      {f.hint ? <p className="text-[11px] text-muted-foreground">{f.hint}</p> : null}
    </div>
  );
}

/** Edit (or add) any record from its field spec. Only changed fields are saved, with an audit entry. */
export function EditRecord({
  entity,
  id,
  parentId,
  values,
  options,
  caps,
  trigger,
  title,
  canDelete,
}: {
  entity: EntityKey;
  id?: string;
  parentId?: string;
  values?: Values;
  options: EditOptions;
  caps: string[];
  trigger?: ReactNode;
  title?: string;
  canDelete?: boolean;
}) {
  const spec = SPECS[entity];
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const adding = !id;
  const groups = [...new Set(spec.fields.map((f) => f.group ?? ""))];
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="xs" variant="ghost" aria-label={adding ? `Add ${spec.label}` : `Edit ${spec.label}`}>
            {adding ? <Plus /> : <Pencil />}
            {adding ? `Add ${spec.label}` : null}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", spec.fields.length > 8 ? "sm:max-w-3xl" : "sm:max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title ?? (adding ? `Add ${spec.label}` : `Edit ${spec.label}`)}</DialogTitle>
          <DialogDescription>{adding ? "Fill in what you know; the rest can be added later." : "Only what you change is saved. Every change is kept in the record's history."}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            // Send date-times as exact instants so the server stores what the person saw.
            for (const fld of spec.fields) if (fld.type === "datetime" && f.get(fld.key)) f.set(fld.key, new Date(String(f.get(fld.key))).toISOString());
            start(async () => {
              const r = adding ? await addRecord(entity, parentId!, f) : await saveRecord(entity, id!, f);
              if (!r.ok) return void toast.error(r.error);
              undoable(r.undo, `${adding ? "added" : "edited"} ${spec.label}`, adding ? "Added" : "Saved");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {groups.map((g) => (
            <fieldset key={g || "main"} className="grid gap-3">
              {g ? <legend className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{g}</legend> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {spec.fields
                  .filter((f) => (f.group ?? "") === g)
                  .map((f) => (
                    <Field key={f.key} f={f} value={values?.[f.key]} options={options} caps={caps} />
                  ))}
              </div>
            </fieldset>
          ))}
          <div className="flex items-center gap-2">
            {canDelete && id ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-rose-500"
                disabled={pending}
                onClick={() =>
                  confirm(`Remove this ${spec.label}?`) &&
                  start(async () => {
                    const r = await deleteRecord(entity, id);
                    if (!r.ok) return void toast.error(r.error);
                    undoable(r.undo, `removed ${spec.label}`, "Removed");
                    setOpen(false);
                    router.refresh();
                  })
                }
              >
                <Trash2 /> Remove
              </Button>
            ) : null}
            <Button className="ml-auto rounded-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} {adding ? "Add" : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
