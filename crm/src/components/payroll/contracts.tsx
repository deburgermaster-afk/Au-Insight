"use client";

import { AlertTriangle, BookTemplate, CheckCircle2, FilePlus2, FileText, Loader2, Pencil, Sparkles, Trash2, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ContractReview } from "@/db/crm-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ActionResult } from "@/lib/actions";
import { addBuiltinTemplate, aiDraftContractTemplate, aiImportContractTemplate, deleteContractTemplate, issueContract, reviewContractTemplate, saveContractTemplate, saveContractDraft, sendContract, signContract, voidContract } from "@/lib/contract-actions";
import { BUILTIN_TEMPLATES, MERGE_FIELDS } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import { ContractText } from "./contract-text";

type Template = { id: string; name: string; employment: string; body: string; source: string; analysis: ContractReview | null; updatedAt: Date | string };
const EMP: Record<string, string> = { full_time: "Full time", part_time: "Part time", casual: "Casual", contractor: "Contractor" };
const SOURCE: Record<string, string> = { builtin: "Lodgely template", ai_description: "Written by AI", ai_import: "Imported by AI", manual: "Custom" };

function useRun() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>, ok: string, go?: (id: string) => string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      after?.();
      if (go && r.id) router.push(go(r.id));
      else router.refresh();
    });
  return { pending, run };
}

export function ReviewView({ review }: { review: ContractReview | null }) {
  if (!review) return null;
  return (
    <div className="grid gap-2 text-[12px]">
      <p className="text-muted-foreground">{review.summary}</p>
      {review.issues.map((i) => (
        <p key={i.text} className="flex gap-1.5">
          {i.level === "block" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> : i.level === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
          {i.text}
        </p>
      ))}
      {review.missing.length ? (
        <p className="flex gap-1.5">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> Missing: {review.missing.join(", ")}
        </p>
      ) : null}
    </div>
  );
}

const reviewTone = (r: ContractReview | null) => (!r ? "muted" : r.issues.some((i) => i.level === "block") ? "bad" : r.missing.length || r.issues.some((i) => i.level === "warn") ? "warn" : "ok");

/** The agency's contract templates: built in, written by AI from a description, or imported from a file. */
export function ContractLibrary({ templates, aiOn }: { templates: Template[]; aiOn: boolean }) {
  const { pending, run } = useRun();
  const [describe, setDescribe] = useState(false);
  const [upload, setUpload] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-[12px] text-muted-foreground">Templates fill in each person&apos;s details when you issue a contract. Every template is checked against the National Employment Standards.</p>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="rounded-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <FilePlus2 />} New template
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onSelect={() => setDescribe(true)} disabled={!aiOn}>
              <Sparkles /> Describe the role, AI writes it
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setUpload(true)} disabled={!aiOn}>
              <Upload /> Upload your contract, AI turns it into a template
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[11px] text-muted-foreground">Start from Lodgely&apos;s templates</DropdownMenuLabel>
            {BUILTIN_TEMPLATES.map((t) => (
              <DropdownMenuItem key={t.key} onSelect={() => run(() => addBuiltinTemplate(t.key), "Template added")}>
                <BookTemplate /> {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <DescribeDialog open={describe} onOpenChange={setDescribe} />
      <UploadDialog open={upload} onOpenChange={setUpload} />
      {templates.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {templates.map((t) => (
            <li key={t.id} className="grid gap-2 rounded-2xl border bg-card p-3.5">
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {EMP[t.employment]} · {SOURCE[t.source] ?? t.source}
                  </p>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-[10px]", { ok: "bg-emerald-500/12 text-emerald-500", warn: "bg-amber-500/12 text-amber-500", bad: "bg-rose-500/12 text-rose-500", muted: "bg-muted text-muted-foreground" }[reviewTone(t.analysis)])}>
                  {{ ok: "NES checks pass", warn: "Check", bad: "Fix first", muted: "Not reviewed" }[reviewTone(t.analysis)]}
                </span>
              </div>
              <ReviewView review={t.analysis} />
              <div className="flex flex-wrap gap-1.5">
                <TemplateEditor t={t} />
                {aiOn ? (
                  <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => reviewContractTemplate(t.id), "Reviewed")}>
                    <Sparkles /> AI review
                  </Button>
                ) : null}
                <Button size="xs" variant="ghost" className="ml-auto text-muted-foreground" disabled={pending} onClick={() => confirm(`Delete "${t.name}"? Contracts already issued keep their text.`) && run(() => deleteContractTemplate(t.id), "Deleted")}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">No templates yet. Add Lodgely&apos;s full-time, casual, fixed-term or contractor template, describe a role for AI to write, or upload the contract you already use.</p>
      )}
    </div>
  );
}

function DescribeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pending, run } = useRun();
  const [text, setText] = useState("");
  const [emp, setEmp] = useState("full_time");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Describe the role</DialogTitle>
          <DialogDescription>Write it the way you&apos;d tell a colleague. AI writes a full contract that meets the Fair Work rules, using merge fields for each person&apos;s details, and checks it.</DialogDescription>
        </DialogHeader>
        <Textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder="Part-time receptionist, 3 days a week (Mon, Wed, Fri), Clerks award level 2, answers phones and books consultations, handles client documents so needs strong privacy terms, 6 month probation, can work from home on Fridays." />
        <div className="flex flex-wrap items-center gap-2">
          <select value={emp} onChange={(e) => setEmp(e.target.value)} className="h-9 rounded-md border bg-transparent px-2 text-sm">
            {Object.entries(EMP).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <Button className="ml-auto rounded-full" disabled={pending || text.trim().length < 20} onClick={() => run(() => aiDraftContractTemplate(text, emp), "Contract template written", undefined, () => (onOpenChange(false), setText("")))}>
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Writing… (up to a minute)" : "Write contract"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pending, run } = useRun();
  const [file, setFile] = useState<File | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload a contract you already use</DialogTitle>
          <DialogDescription>Word (.docx), PDF or text. AI keeps your clauses, swaps names, dates and pay for merge fields, adds anything the National Employment Standards require, and lists what it changed.</DialogDescription>
        </DialogHeader>
        <label className="grid cursor-pointer place-items-center gap-1 rounded-2xl border border-dashed p-8 text-center text-sm hover:bg-muted/40">
          <Upload className="size-5 text-muted-foreground" />
          {file ? file.name : "Choose a file"}
          <input type="file" accept=".docx,.pdf,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button
          className="justify-self-end rounded-full"
          disabled={pending || !file}
          onClick={() => {
            const f = new FormData();
            f.set("file", file!);
            run(() => aiImportContractTemplate(f), "Contract imported as a template", undefined, () => (onOpenChange(false), setFile(null)));
          }}
        >
          {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} {pending ? "Reading… (up to 2 minutes)" : "Import"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function TemplateEditor({ t }: { t: Template }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(t.body);
  const [preview, setPreview] = useState(false);
  const { pending, run } = useRun();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <Pencil /> Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Edit template</DialogTitle>
          <DialogDescription>Markdown: # title, ## headings, - bullets, **bold**. Merge fields in double braces are filled for each person.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            f.set("body", body);
            run(() => saveContractTemplate(t.id, f), "Template saved", undefined, () => setOpen(false));
          }}
        >
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input name="name" defaultValue={t.name} className="h-9 rounded-md border bg-transparent px-3 text-sm" />
            <select name="employment" defaultValue={t.employment} className="h-9 rounded-md border bg-transparent px-2 text-sm">
              {Object.entries(EMP).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="grid gap-1.5">
              <div className="flex gap-1">
                <Button type="button" size="xs" variant={preview ? "ghost" : "secondary"} onClick={() => setPreview(false)}>
                  Write
                </Button>
                <Button type="button" size="xs" variant={preview ? "secondary" : "ghost"} onClick={() => setPreview(true)}>
                  Preview
                </Button>
              </div>
              {preview ? <ContractText body={body} className="grid max-h-[60dvh] gap-2.5 overflow-y-auto rounded-xl border p-4 text-[13px] leading-relaxed" /> : <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={24} className="font-mono text-[12px]" />}
            </div>
            <div className="grid content-start gap-1">
              <Label className="text-[11px] text-muted-foreground">Merge fields (click to add)</Label>
              {MERGE_FIELDS.map((f) => (
                <button key={f.key} type="button" onClick={() => setBody((b) => `${b}{{${f.key}}}`)} className="rounded-md px-2 py-1 text-left text-[11px] hover:bg-muted">
                  <code className="text-sky-500">{`{{${f.key}}}`}</code>
                  <span className="block text-muted-foreground">{f.label}</span>
                </button>
              ))}
            </div>
          </div>
          <Button className="justify-self-end rounded-full" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save template
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Issue a contract to one staff member from a template. */
export function IssueContract({ userId, templates }: { userId: string; templates: { id: string; name: string }[] }) {
  const { pending, run } = useRun();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" className="rounded-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <FilePlus2 />} Issue contract
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        {templates.length ? (
          templates.map((t) => (
            <DropdownMenuItem key={t.id} onSelect={() => run(() => issueContract(userId, t.id), "Draft contract ready", (id) => `/app/hr/contracts/${id}`)}>
              <FileText /> {t.name}
            </DropdownMenuItem>
          ))
        ) : (
          <DropdownMenuItem asChild>
            <Link href="/app/hr?tab=contracts">Add a template first</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** HR's actions on one issued contract. */
export function ContractActions({ id, status, body, gaps }: { id: string; status: string; body: string; gaps: string[] }) {
  const { pending, run } = useRun();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        {status === "draft" ? (
          <>
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => setEditing((e) => !e)}>
              <Pencil /> {editing ? "Close editor" : "Edit text"}
            </Button>
            <Button size="sm" className="rounded-full" disabled={pending || gaps.length > 0} title={gaps.length ? `Fill in: ${gaps.join(", ")}` : undefined} onClick={() => run(() => sendContract(id), "Sent to sign in their Me portal")}>
              {pending ? <Loader2 className="animate-spin" /> : null} Send to sign
            </Button>
          </>
        ) : null}
        {status === "draft" || status === "sent" ? (
          <Button size="sm" variant="ghost" className="rounded-full text-rose-500" disabled={pending} onClick={() => confirm("Void this contract?") && run(() => voidContract(id), "Voided")}>
            Void
          </Button>
        ) : null}
        {status === "signed" ? (
          <Button size="sm" variant="outline" className="rounded-full" asChild>
            <a href={`/api/contracts/${id}/pdf`}>Download signed PDF</a>
          </Button>
        ) : null}
      </div>
      {gaps.length && status === "draft" ? <p className="text-[12px] text-amber-500">Fill these in on their record or in the text before sending: {gaps.join(", ")}.</p> : null}
      {editing ? (
        <div className="grid gap-2">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={22} className="font-mono text-[12px]" />
          <Button size="sm" className="justify-self-end rounded-full" disabled={pending} onClick={() => run(() => saveContractDraft(id, text), "Saved", undefined, () => setEditing(false))}>
            Save
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** The employee's acceptance: type full name, agree, sign. */
export function SignContract({ id, suggested }: { id: string; suggested: string }) {
  const { pending, run } = useRun();
  const [name, setName] = useState("");
  const [agree, setAgree] = useState(false);
  return (
    <div className="grid gap-3 rounded-2xl border bg-card p-4">
      <p className="text-sm font-medium">Sign your contract</p>
      <label className="flex items-start gap-2 text-[13px]">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1" />I have read this contract and the Fair Work Information Statement, and I agree to these terms.
      </label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`Type your full name, e.g. ${suggested}`} className="h-10 rounded-md border bg-transparent px-3 font-serif text-lg italic" />
      <Button className="justify-self-start rounded-full" disabled={pending || !agree || name.trim().length < 3} onClick={() => run(() => signContract(id, name, agree), "Signed. A copy is saved to your record.")}>
        {pending ? <Loader2 className="animate-spin" /> : null} Sign contract
      </Button>
      <p className="text-[11px] text-muted-foreground">Signing electronically is legally binding (Electronic Transactions Act 1999). We record the time, your IP address and device with the signed copy.</p>
    </div>
  );
}
