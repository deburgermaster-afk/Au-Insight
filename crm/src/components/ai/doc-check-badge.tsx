"use client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import type { DocCheck } from "@/db/crm-schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { checkDocumentNow } from "@/lib/ai-doc-actions";
import { cn } from "@/lib/utils";

export type CheckView = { status: string; verdict: string | null; result: DocCheck | null; error: string | null } | null;

const look = {
  looks_good: { icon: CheckCircle2, label: "Looks good", cls: "text-emerald-500 bg-emerald-500/10" },
  needs_attention: { icon: AlertTriangle, label: "Check", cls: "text-amber-500 bg-amber-500/10" },
  wrong_document: { icon: XCircle, label: "Wrong document", cls: "text-rose-500 bg-rose-500/10" },
} as const;

/** AI verdict on one uploaded document, with the details and a re-check. */
export function DocCheckBadge({ documentId, check, aiOn }: { documentId: string; check: CheckView; aiOn: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    start(async () => {
      const r = await checkDocumentNow(documentId);
      if (!r.ok) toast.error(r.error);
      else toast.success(r.id === "looks_good" ? "Looks good" : r.id === "wrong_document" ? "This looks like the wrong document" : "Checked: a few things to look at");
      router.refresh();
    });
  if (pending)
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Reading…
      </span>
    );
  if (!check) {
    if (!aiOn) return null;
    return (
      <button type="button" onClick={run} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-muted hover:text-foreground" title="Check this document with AI">
        <Sparkles className="size-3" /> AI check
      </button>
    );
  }
  if (check.status !== "done" || !check.result) {
    return (
      <button type="button" onClick={aiOn ? run : undefined} className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground" title={check.error ?? undefined}>
        <Sparkles className="size-3" /> Can&apos;t check{aiOn ? <RefreshCw className="size-2.5" /> : null}
      </button>
    );
  }
  const v = look[check.verdict as keyof typeof look] ?? look.needs_attention;
  const r = check.result;
  const serious = r.issues.filter((i) => i.level !== "info").length;
  const facts = [
    ["Document", r.documentType],
    ["Name", r.nameOnDocument],
    ["Number", r.documentNumber],
    ["Date of birth", r.dateOfBirth],
    ["Issued", r.issueDate],
    ["Expires", r.expiryDate],
    ["Language", r.language],
  ].filter(([, x]) => x) as [string, string][];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn("inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium", v.cls)}>
          <v.icon className="size-3" /> {v.label}
          {serious ? <span className="opacity-70">· {serious}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0 text-[12px]">
        <div className="grid gap-1 border-b p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            <Sparkles className="size-3" /> AI document check
          </p>
          <p className="text-[13px]">{r.summary}</p>
        </div>
        {r.issues.length ? (
          <ul className="grid gap-1.5 border-b p-3">
            {r.issues.map((i) => (
              <li key={i.text} className="flex gap-1.5">
                {i.level === "block" ? <XCircle className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> : i.level === "warn" ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-500" /> : <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}
                <span>{i.text}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <dl className="grid grid-cols-[40%_1fr] gap-x-2 gap-y-1 border-b p-3">
          {facts.map(([k, x]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="truncate">{x}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center justify-between gap-2 p-2.5">
          <span className="text-[10px] text-muted-foreground">Advice only. Check the document yourself.</span>
          {aiOn ? (
            <button type="button" onClick={run} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] hover:bg-muted">
              <RefreshCw className="size-3" /> Check again
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}
