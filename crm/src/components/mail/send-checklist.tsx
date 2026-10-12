"use client";

import { Check, Copy, Link2, Loader2, Send } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { sendChecklist } from "@/lib/mail-actions";

type Item = { id: string; category: string; label: string; required: boolean; status: string };

/** Pick documents, add a note and a due date, and email the client a private upload link. */
export function SendChecklist({ matterId, clientName, clientEmail, items, trigger, defaultOpen = false }: { matterId: string; clientName: string; clientEmail: string | null; items: Item[]; trigger: React.ReactNode; defaultOpen?: boolean }) {
  const outstanding = items.filter((i) => ["needed", "requested", "rejected"].includes(i.status));
  const [open, setOpen] = useState(defaultOpen);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(outstanding.map((i) => i.id)));
  const [note, setNote] = useState("");
  const [due, setDue] = useState(() => new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  const [days, setDays] = useState("30");
  const [link, setLink] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of items) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [items]);
  const toggle = (id: string) => setPicked((s) => (s.has(id) ? (s.delete(id), new Set(s)) : new Set(s.add(id))));

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setLink(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-xl">
        <div className="h-20 shrink-0 bg-[radial-gradient(120%_140%_at_10%_0%,oklch(0.75_0.15_55/.55),transparent_55%),radial-gradient(120%_160%_at_90%_10%,oklch(0.6_0.18_300/.45),transparent_60%),linear-gradient(180deg,oklch(0.3_0.03_260),transparent)]" />
        <div className="-mt-6 px-6">
          <DialogTitle>Send document checklist</DialogTitle>
          <DialogDescription className="mt-1">
            {clientEmail ? (
              <>
                Emails {clientName} at <span className="text-foreground">{clientEmail}</span> with a private link to upload each document.
              </>
            ) : (
              <>Add an email address for {clientName} first.</>
            )}
          </DialogDescription>
        </div>
        {link ? (
          <div className="grid gap-4 p-6">
            <div className="grid place-items-center gap-2 rounded-2xl border bg-emerald-500/5 p-6 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-emerald-500 text-white">
                <Check className="size-5" />
              </span>
              <p className="font-medium">Checklist sent</p>
              <p className="text-xs text-muted-foreground">Uploads appear on this matter and tick off the checklist automatically.</p>
            </div>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" />
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(link);
                  toast.success("Link copied");
                }}
              >
                <Copy /> Copy
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-6 py-5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {picked.size} of {items.length} documents selected
                </span>
                <div className="flex gap-2">
                  <button type="button" className="hover:underline" onClick={() => setPicked(new Set(outstanding.map((i) => i.id)))}>
                    Outstanding
                  </button>
                  <button type="button" className="hover:underline" onClick={() => setPicked(new Set(items.map((i) => i.id)))}>
                    All
                  </button>
                  <button type="button" className="hover:underline" onClick={() => setPicked(new Set())}>
                    None
                  </button>
                </div>
              </div>
              {groups.map(([cat, rows]) => (
                <div key={cat}>
                  <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{cat}</p>
                  <div className="grid gap-1">
                    {rows.map((i) => (
                      <label key={i.id} className="flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-[13px] hover:bg-muted/40">
                        <Checkbox className="mt-0.5" checked={picked.has(i.id)} onCheckedChange={() => toggle(i.id)} />
                        <span className="flex-1">{i.label}</span>
                        <span className="text-[11px] capitalize text-muted-foreground">{i.status}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add a note for the client (optional): e.g. Police certificates can take 4–6 weeks, please apply this week." />
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Please upload by
                  <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                </label>
                <label className="grid gap-1 text-xs text-muted-foreground">
                  Link works for
                  <select value={days} onChange={(e) => setDays(e.target.value)} className="h-9 rounded-lg border bg-transparent px-2 text-sm text-foreground">
                    {["7", "14", "30", "60", "90"].map((d) => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="grid shrink-0 grid-cols-2 gap-2 border-t px-6 py-4">
              <Button variant="secondary" className="h-10 rounded-full" onClick={() => setOpen(false)}>
                Close
              </Button>
              <Button
                className="h-10 rounded-full"
                disabled={pending || !picked.size || !clientEmail}
                onClick={() =>
                  start(async () => {
                    const r = await sendChecklist({ matterId, itemIds: [...picked], note, dueAt: due, days: Number(days) });
                    if (!r.ok) return void toast.error(r.error);
                    setLink(r.link ?? null);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <Send />} Send to client
              </Button>
            </div>
          </>
        )}
        <span className="sr-only">
          <Link2 />
        </span>
      </DialogContent>
    </Dialog>
  );
}
