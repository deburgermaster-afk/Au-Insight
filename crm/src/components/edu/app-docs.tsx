"use client";

import { FileBadge2, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadFile } from "@/components/mail/uploader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { type AppDocKind, fileApplicationDocuments } from "@/lib/edu-doc-actions";
import { cn } from "@/lib/utils";

const KINDS: { value: AppDocKind; label: string; hint: string }[] = [
  { value: "offer", label: "Offer letter", hint: "Moves the application to Offer" },
  { value: "conditional_offer", label: "Conditional offer", hint: "Moves it to Conditional" },
  { value: "coe", label: "CoE", hint: "Moves it to CoE and records the number" },
  { value: "other", label: "Other", hint: "Files it without changing the stage" },
];

/** Upload an offer letter or CoE for a study application; it lands in the student's portal. */
export function AppDocsButton({ agencyId, applicationId, clientId, student, hasEmail, status }: { agencyId: string; applicationId: string; clientId: string; student: string; hasEmail: boolean; status: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<AppDocKind>(["offer", "conditional", "accepted"].includes(status) ? "coe" : "offer");
  const [coe, setCoe] = useState("");
  const [notify, setNotify] = useState(hasEmail);
  const [files, setFiles] = useState<File[]>([]);
  const [pct, setPct] = useState<number | null>(null);

  async function go() {
    try {
      const done = [];
      for (const f of files) {
        setPct(0);
        done.push(await uploadFile(agencyId, `docs/${clientId}`, f, setPct));
      }
      const r = await fileApplicationDocuments(applicationId, done, { kind, coeNumber: kind === "coe" ? coe : null, notify });
      if (!r.ok) throw new Error(r.error);
      toast.success(r.emailed ? `Filed and ${student.split(" ")[0]} was emailed` : "Filed to the student's portal");
      setOpen(false);
      setFiles([]);
      setCoe("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPct(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" title="Upload offer letter or CoE">
          <FileBadge2 /> Offer / CoE
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>File a document for {student}</DialogTitle>
          <DialogDescription>It goes on the student&apos;s record and appears in their portal straight away.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-1.5">
            {KINDS.map((k) => (
              <button key={k.value} type="button" onClick={() => setKind(k.value)} className={cn("rounded-lg border px-3 py-2 text-left transition", kind === k.value ? "border-primary bg-primary/10" : "hover:bg-muted")}>
                <span className="block text-sm font-medium">{k.label}</span>
                <span className="block text-[11px] text-muted-foreground">{k.hint}</span>
              </button>
            ))}
          </div>
          {kind === "coe" ? (
            <div className="grid gap-1.5">
              <Label htmlFor="coeNo">CoE number</Label>
              <Input id="coeNo" value={coe} onChange={(e) => setCoe(e.target.value)} placeholder="e.g. E1234567" />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>File</Label>
            <input ref={input} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            <Button type="button" variant="outline" onClick={() => input.current?.click()} className="justify-start">
              <Upload /> {files.length ? files.map((f) => f.name).join(", ") : "Choose PDF or image"}
            </Button>
          </div>
          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              Email {student.split(" ")[0]} a link to it
              {!hasEmail ? <span className="block text-[11px] text-muted-foreground">No email address on file</span> : null}
            </span>
            <Switch checked={notify && hasEmail} disabled={!hasEmail} onCheckedChange={setNotify} />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={!files.length || pct != null} onClick={go}>
            {pct != null ? <Loader2 className="animate-spin" /> : <Upload />} {pct != null ? `${Math.round(pct)}%` : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
