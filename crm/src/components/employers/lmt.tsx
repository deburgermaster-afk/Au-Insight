"use client";

import { FileText, Loader2, Paperclip, Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadFile } from "@/components/mail/uploader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { deleteLmtAd, type LmtAdInput, saveLmtAd, setLmtExemption } from "@/lib/lmt-actions";
import { LMT_EXEMPTIONS, LMT_PLATFORMS, type LmtAd } from "@/lib/lmt";
import { cn } from "@/lib/utils";

const blank = (title: string, today: string): LmtAdInput => ({ platform: "workforce_australia", adTitle: title, url: "", publishedOn: today, endsOn: "", showsTitle: true, showsEmployer: true, showsSkills: true, showsSalary: true, applicants: null, evidence: [], notes: "" });

/** Add or edit one ad, with its screenshots, invoices and applicant reports. */
export function AdDialog({ nominationId, agencyId, ad, positionTitle, today }: { nominationId: string; agencyId: string; ad?: LmtAd; positionTitle: string; today: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [v, setV] = useState<LmtAdInput>(() => (ad ? { ...ad, url: ad.url ?? "", endsOn: ad.endsOn ?? "", notes: ad.notes ?? "" } : blank(positionTitle, today)));
  const [uploading, setUploading] = useState(0);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const put = (p: Partial<LmtAdInput>) => setV({ ...v, ...p });
  const check = (key: "showsTitle" | "showsEmployer" | "showsSkills" | "showsSalary", label: string) => (
    <label className="flex items-center gap-2 text-sm">
      <Checkbox checked={v[key]} onCheckedChange={(x) => put({ [key]: x === true })} /> {label}
    </label>
  );
  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading((n) => n + files.length);
    for (const f of Array.from(files)) {
      try {
        const a = await uploadFile(agencyId, `nominations/${nominationId}/lmt`, f);
        setV((x) => ({ ...x, evidence: [...x.evidence, a] }));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading((n) => n - 1);
      }
    }
  }
  return (
    <>
      {ad ? (
        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${ad.adTitle}`} onClick={() => setOpen(true)}>
          <Pencil />
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus /> Add an ad
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{ad ? "Edit ad" : "Add an ad"}</DialogTitle>
            <DialogDescription>Where it ran, for how long, what it showed, and the proof.</DialogDescription>
          </DialogHeader>
          <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
            <div className="grid gap-1.5">
              <Label>Where</Label>
              <div className="flex flex-wrap gap-1.5">
                {LMT_PLATFORMS.map((p) => (
                  <button key={p.value} type="button" onClick={() => put({ platform: p.value })} className={cn("rounded-full border px-3 py-1 text-xs", v.platform === p.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lmt-title">Ad title</Label>
              <Input id="lmt-title" value={v.adTitle} onChange={(e) => put({ adTitle: e.target.value })} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lmt-url">Link (optional)</Label>
              <Input id="lmt-url" value={v.url ?? ""} onChange={(e) => put({ url: e.target.value })} placeholder="https://www.workforceaustralia.gov.au/…" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="lmt-pub">Published</Label>
                <Input id="lmt-pub" type="date" max={today} value={v.publishedOn} onChange={(e) => put({ publishedOn: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lmt-end">Closed (blank = open)</Label>
                <Input id="lmt-end" type="date" value={v.endsOn ?? ""} onChange={(e) => put({ endsOn: e.target.value })} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="lmt-app">Applicants</Label>
                <Input id="lmt-app" type="number" min={0} value={v.applicants ?? ""} onChange={(e) => put({ applicants: e.target.value === "" ? null : Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2 rounded-lg border p-3">
              <p className="text-xs font-medium text-muted-foreground">The ad shows</p>
              {check("showsTitle", "The position title or a description of it")}
              {check("showsEmployer", "The sponsor's or recruitment agency's name")}
              {check("showsSkills", "The skills or experience needed")}
              {check("showsSalary", "The salary or a salary range")}
            </div>
            <div className="grid gap-1.5">
              <Label>Evidence</Label>
              <p className="text-[11px] text-muted-foreground">Screenshots showing the dates, invoices or receipts, and applicant reports.</p>
              <ul className="grid gap-1">
                {v.evidence.map((f, i) => (
                  <li key={f.key} className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
                    <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{f.name}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => put({ evidence: v.evidence.filter((_, k) => k !== i) })}>
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <input ref={input} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => onFiles(e.target.files).then(() => (e.target.value = ""))} />
              <Button type="button" size="sm" variant="outline" className="justify-self-start" onClick={() => input.current?.click()} disabled={uploading > 0}>
                {uploading ? <Loader2 className="animate-spin" /> : <Paperclip />} {uploading ? "Uploading…" : "Upload files"}
              </Button>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="lmt-notes">Notes</Label>
              <Textarea id="lmt-notes" rows={2} value={v.notes ?? ""} onChange={(e) => put({ notes: e.target.value })} placeholder="Why applicants weren't suitable, reference numbers…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || uploading > 0}
              onClick={() =>
                start(async () => {
                  const r = await saveLmtAd(nominationId, ad?.id ?? null, v);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success("Saved");
                  setOpen(false);
                  if (!ad) setV(blank(positionTitle, today));
                  router.refresh();
                })
              }
            >
              {pending ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeleteAd({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label={`Delete ${title}`}
      disabled={pending}
      onClick={() => {
        if (!confirm(`Delete the "${title}" ad and its evidence list?`)) return;
        start(async () => {
          const r = await deleteLmtAd(id);
          if (!r.ok) return void toast.error(r.error);
          router.refresh();
        });
      }}
    >
      <Trash2 />
    </Button>
  );
}

/** Not needed for this nomination: record why, or clear it. */
export function Exemption({ nominationId, reason }: { nominationId: string; reason: string | null }) {
  const router = useRouter();
  const [pick, setPick] = useState(reason ?? "");
  const [pending, start] = useTransition();
  const save = (r: string | null) =>
    start(async () => {
      const x = await setLmtExemption(nominationId, r);
      if (!x.ok) return void toast.error(x.error);
      toast.success(r ? "Recorded as exempt" : "Exemption cleared");
      router.refresh();
    });
  if (reason)
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="min-w-0 flex-1">
          Exempt: <span className="text-muted-foreground">{reason}</span>
        </span>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => save(null)}>
          Clear
        </Button>
      </div>
    );
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1.5">
        {LMT_EXEMPTIONS.map((e) => (
          <button key={e} type="button" onClick={() => setPick(e)} className={cn("rounded-lg border px-3 py-1.5 text-left text-xs", pick === e ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted")}>
            {e}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Input value={pick} onChange={(e) => setPick(e.target.value)} placeholder="Or describe the exemption" className="h-8" />
        <Button size="sm" variant="outline" disabled={pending || !pick.trim()} onClick={() => save(pick)}>
          Mark exempt
        </Button>
      </div>
    </div>
  );
}
