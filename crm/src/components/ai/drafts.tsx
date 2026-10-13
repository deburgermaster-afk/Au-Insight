"use client";

import { Check, Copy, Download, FileText, Loader2, Save, Sparkles, Trash2, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createDraft, deleteDraft, saveDraft } from "@/lib/ai-doc-actions";
import { cn } from "@/lib/utils";

type Kind = { key: string; title: string; blurb: string };

/** Pick a draft type, add instructions, and let the AI write it from the case file. */
export function NewDraft({ matterId, kinds, enabled }: { matterId: string; kinds: Kind[]; enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState(kinds[0]?.key ?? "");
  const [notes, setNotes] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={(v) => !pending && setOpen(v)}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline" className="rounded-full" disabled={!enabled} title={enabled ? undefined : "Turn on AI drafting in Settings → AI assistant"}>
          <Wand2 /> New draft
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Draft with AI</DialogTitle>
          <DialogDescription>Written from this case file only. Anything missing becomes a [[placeholder]] to fill in. You edit and approve every word.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          {kinds.map((k) => (
            <button key={k.key} type="button" onClick={() => setKind(k.key)} disabled={pending} className={cn("flex items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition", kind === k.key ? "border-foreground/60 bg-muted/40" : "hover:bg-muted/30")}>
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <span>
                <span className="block text-[13px] font-medium">{k.title}</span>
                <span className="block text-[12px] text-muted-foreground">{k.blurb}</span>
              </span>
            </button>
          ))}
        </div>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} placeholder="Instructions (optional), e.g. emphasise her 3 years at Northline; keep it to one page" />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">{pending ? "Writing… this takes up to a minute." : ""}</span>
          <Button
            className="rounded-full"
            disabled={pending || !kind}
            onClick={() =>
              start(async () => {
                const r = await createDraft(matterId, kind, notes);
                if (!r.ok || !r.id) return void toast.error(("error" in r && r.error) || "Couldn't write the draft.");
                setOpen(false);
                router.push(`/app/matters/${matterId}/drafts/${r.id}`);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Write draft
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Full-page editor for a draft. */
export function DraftEditor({ id, matterId, title: t0, body: b0, checks }: { id: string; matterId: string; title: string; body: string; checks: string[] }) {
  const [title, setTitle] = useState(t0);
  const [body, setBody] = useState(b0);
  const [copied, setCopied] = useState(false);
  const [done, setDone] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dirty = title !== t0 || body !== b0;
  const placeholders = body.match(/\[\[[^\]]+\]\]/g)?.length ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="grid content-start gap-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-11 text-base font-semibold" />
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[65dvh] font-[Georgia,serif] text-[15px] leading-relaxed" />
        <div className="flex flex-wrap items-center gap-2">
          <Button className="rounded-full" disabled={pending || !dirty} onClick={() => start(async () => {
            const r = await saveDraft(id, title, body);
            if (!r.ok) toast.error(r.error);
            else toast.success("Saved");
            router.refresh();
          })}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          <Button variant="outline" className="rounded-full" onClick={() => {
            navigator.clipboard?.writeText(`${title}\n\n${body}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}>
            {copied ? <Check /> : <Copy />} Copy
          </Button>
          <Button asChild variant="outline" className="rounded-full">
            <a href={`/api/drafts/${id}/doc`}>
              <Download /> Word
            </a>
          </Button>
          <Button variant="ghost" className="ml-auto rounded-full text-muted-foreground" disabled={pending} onClick={() => confirm("Delete this draft?") && start(async () => {
            const r = await deleteDraft(id);
            if (!r.ok) return void toast.error(r.error);
            router.push(`/app/matters/${matterId}`);
          })}>
            <Trash2 /> Delete
          </Button>
        </div>
        {dirty ? <p className="text-[11px] text-amber-500">Unsaved changes. The Word download uses the saved version.</p> : null}
      </div>
      <aside className="grid content-start gap-3">
        <section className="rounded-2xl border bg-card p-4">
          <p className="text-sm font-medium">Before you use it</p>
          <p className="mb-2 text-[12px] text-muted-foreground">{placeholders ? `${placeholders} [[placeholder${placeholders === 1 ? "" : "s"}]] left to fill.` : "No placeholders left."}</p>
          <ul className="grid gap-2">
            {checks.map((c) => (
              <li key={c}>
                <label className="flex items-start gap-2 text-[13px]">
                  <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={done.includes(c)} onChange={(e) => setDone(e.target.checked ? [...done, c] : done.filter((x) => x !== c))} />
                  <span className={cn(done.includes(c) && "text-muted-foreground line-through")}>{c}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
        <p className="px-1 text-[11px] text-muted-foreground">AI drafts are a starting point. As the registered migration agent you are responsible for everything submitted. <Link href={`/app/matters/${matterId}`} className="underline">Back to the matter</Link></p>
      </aside>
    </div>
  );
}
