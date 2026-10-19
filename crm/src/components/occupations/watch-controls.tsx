"use client";

import { Eye, Loader2, MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeWatch, updateWatch, watchOccupation } from "@/lib/occupation-watch-actions";
import { cn } from "@/lib/utils";

const SUBS = [
  { v: "189", l: "189 Independent" },
  { v: "190", l: "190 Nominated" },
  { v: "491", l: "491 Regional" },
];

function Form({ anzsco, setAnzsco, points, setPoints, subs, setSubs, fixedCode }: { anzsco: string; setAnzsco: (v: string) => void; points: string; setPoints: (v: string) => void; subs: string[]; setSubs: (v: string[]) => void; fixedCode?: boolean }) {
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="wAnzsco">ANZSCO code</Label>
          <Input id="wAnzsco" value={anzsco} disabled={fixedCode} onChange={(e) => setAnzsco(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="261313" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wPoints">Client&apos;s points</Label>
          <Input id="wPoints" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" placeholder="85" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label>Visas</Label>
        <div className="flex flex-wrap gap-1.5">
          {SUBS.map((x) => (
            <button key={x.v} type="button" onClick={() => setSubs(subs.includes(x.v) ? subs.filter((y) => y !== x.v) : [...subs, x.v])} className={cn("rounded-full border px-3 py-1 text-xs transition", subs.includes(x.v) ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              {x.l}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Cut-off alerts work for 189: Home Affairs doesn&apos;t publish occupation cut-offs for state nomination. 190 and 491 show the client&apos;s place in the EOI backlog.</p>
      </div>
    </div>
  );
}

export function WatchButton({ clientId, anzsco: a0, points: p0 }: { clientId: string; anzsco: string | null; points: number | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [anzsco, setAnzsco] = useState(a0 ?? "");
  const [points, setPoints] = useState(p0 ? String(p0) : "");
  const [subs, setSubs] = useState<string[]>(["189", "190"]);
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <Eye /> Watch occupation
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Watch an occupation</DialogTitle>
          <DialogDescription>Lodgely tracks where this client sits in the SkillSelect backlog every month, and alerts the case officer when a round&apos;s cut-off reaches their points.</DialogDescription>
        </DialogHeader>
        <Form anzsco={anzsco} setAnzsco={setAnzsco} points={points} setPoints={setPoints} subs={subs} setSubs={setSubs} />
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending || anzsco.length !== 6 || !points || !subs.length}
            onClick={() =>
              start(async () => {
                const r = await watchOccupation(clientId, { anzsco, points: Number(points), subclasses: subs });
                if (!r.ok) return void toast.error(r.error);
                toast.success("Watching this occupation");
                setOpen(false);
                router.refresh();
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Eye />} Start watching
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WatchMenu({ id, anzsco, points: p0, subclasses, active }: { id: string; anzsco: string; points: number; subclasses: string[]; active: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState(false);
  const [points, setPoints] = useState(String(p0));
  const [subs, setSubs] = useState(subclasses);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "Something went wrong");
      toast.success(msg);
      setEdit(false);
      router.refresh();
    });
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-xs" variant="ghost" aria-label="Watch options" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEdit(true)}>Change points or visas</DropdownMenuItem>
          <DropdownMenuItem onClick={() => run(() => updateWatch(id, { points: p0, subclasses, active: !active }), active ? "Paused" : "Resumed")}>{active ? "Pause alerts" : "Resume alerts"}</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onClick={() => run(() => removeWatch(id), "Stopped watching")}>
            <Trash2 /> Stop watching
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={edit} onOpenChange={setEdit}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Change the watch</DialogTitle>
            <DialogDescription>New points take effect from the next round and the next monthly EOI update.</DialogDescription>
          </DialogHeader>
          <Form anzsco={anzsco} setAnzsco={() => {}} points={points} setPoints={setPoints} subs={subs} setSubs={setSubs} fixedCode />
          <DialogFooter>
            <Button disabled={pending || !points || !subs.length} onClick={() => run(() => updateWatch(id, { points: Number(points), subclasses: subs, active }), "Watch updated")}>
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
