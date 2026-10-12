"use client";

import { Bot, Check, ChevronDown, Loader2, Paperclip, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { fileUrl } from "@/components/mail/file-icon";
import { SenderLogo } from "@/components/mail/sender";
import { Button } from "@/components/ui/button";
import { ago } from "@/lib/format";
import { analyzeNow, applyInsight, dismissInsight } from "@/lib/mail-ai-actions";
import { cn } from "@/lib/utils";

export const categoryStyle: Record<string, { label: string; tone: string }> = {
  grant: { label: "Visa granted", tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-500" },
  refusal: { label: "Refused", tone: "border-rose-500/30 bg-rose-500/5 text-rose-500" },
  rfi: { label: "Information requested", tone: "border-amber-500/30 bg-amber-500/5 text-amber-500" },
  health: { label: "Health examinations", tone: "border-violet-500/30 bg-violet-500/5 text-violet-400" },
  biometrics: { label: "Biometrics", tone: "border-violet-500/30 bg-violet-500/5 text-violet-400" },
  bridging: { label: "Bridging visa", tone: "border-sky-500/30 bg-sky-500/5 text-sky-400" },
  acknowledgement: { label: "Acknowledgement", tone: "border-sky-500/30 bg-sky-500/5 text-sky-400" },
  skills_outcome: { label: "Skills assessment", tone: "border-sky-500/30 bg-sky-500/5 text-sky-400" },
  invitation: { label: "Invitation", tone: "border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-400" },
  nomination: { label: "Nomination", tone: "border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-400" },
  offer: { label: "Offer", tone: "border-sky-500/30 bg-sky-500/5 text-sky-400" },
  coe: { label: "CoE", tone: "border-sky-500/30 bg-sky-500/5 text-sky-400" },
  payment: { label: "Payment", tone: "border-border bg-muted/30 text-muted-foreground" },
  client_message: { label: "From client", tone: "border-border bg-muted/30 text-muted-foreground" },
  other: { label: "Other", tone: "border-border bg-muted/30 text-muted-foreground" },
  unrelated: { label: "Not about a case", tone: "border-border bg-muted/30 text-muted-foreground" },
};
const factLabel: Record<string, string> = { visa: "Subclass", trn: "TRN", grantNumber: "Grant", decisionDate: "Decided", dueDate: "Due", applicantName: "Applicant", conditions: "Conditions", outcome: "Outcome" };

export type InsightRow = { id: string; category: string; title: string; summary: string; facts: unknown; action: string; actionLabel: string | null; actionDue: string | null; actionStatus: string; actionBy: string | null; confidence: string; matchedBy: string | null; model: string | null; createdAt: Date };

/** What the AI understood from one email, with the one action a person can apply. */
export function InsightCard({ i, from, compact = false }: { i: InsightRow; from?: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const st = categoryStyle[i.category] ?? categoryStyle.other;
  const facts = Object.entries((i.facts ?? {}) as Record<string, string | null>).filter(([, v]) => v);
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  return (
    <div className={cn("rounded-xl border p-3", st.tone.split(" ").slice(0, 2).join(" "))}>
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-fuchsia-500 text-white">
          <Bot className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-[13px] font-medium text-foreground">
            {i.title}
            <span className={cn("rounded-full border px-1.5 py-px text-[10px] font-normal", st.tone)}>{st.label}</span>
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{i.summary}</p>
          {!compact && facts.length ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {facts.map(([k, v]) => (
                <span key={k} className="rounded-md bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-foreground/80">
                  <span className="text-muted-foreground">{factLabel[k] ?? k}</span> {v}
                </span>
              ))}
            </div>
          ) : null}
          <p className="mt-1 text-[10px] text-muted-foreground" suppressHydrationWarning>
            {from ? `${from} · ` : ""}
            {ago(i.createdAt)} · {i.confidence} confidence{i.matchedBy ? ` · matched by ${i.matchedBy.replace("ai+", "AI + ")}` : ""}
          </p>
        </div>
      </div>
      {i.actionStatus === "open" && i.action !== "none" ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5 pl-8">
          <Button size="xs" className="rounded-full" disabled={pending} onClick={() => act(() => applyInsight(i.id), "Done")}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />}
            {i.actionLabel ?? (i.action === "create_task" ? "Create task" : i.action === "set_rfi_due" ? "Set response deadline" : "Record the decision")}
            {i.actionDue && i.action !== "set_stage_decision" ? ` · ${i.actionDue}` : ""}
          </Button>
          <Button size="xs" variant="ghost" className="rounded-full" disabled={pending} onClick={() => act(() => dismissInsight(i.id), "Dismissed")}>
            <X /> Dismiss
          </Button>
        </div>
      ) : i.actionStatus === "applied" ? (
        <p className="mt-1.5 pl-8 text-[11px] text-emerald-500">Applied by {i.actionBy}</p>
      ) : null}
    </div>
  );
}

type Email = { id: string; folder: string; fromName: string | null; fromAddress: string; subject: string; bodyText: string | null; sentAt: Date; attachments: { name: string; key: string }[]; auth: { verified: boolean } | null };

/** The client file's Emails tab: every email to or about the client, with what AI made of it. */
export function ClientEmails({ emails, insights, aiOn }: { emails: Email[]; insights: (InsightRow & { messageId: string })[]; aiOn: boolean }) {
  const [openId, setOpenId] = useState<string | null>(emails[0]?.id ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();
  const byMessage = new Map(insights.map((x) => [x.messageId, x]));
  if (!emails.length) return <p className="py-8 text-center text-sm text-muted-foreground">No emails with this client yet. Mail to or from them, and AI-linked mail from Home Affairs and assessing bodies, appears here.</p>;
  return (
    <ul className="divide-y overflow-hidden rounded-xl border">
      {emails.map((m) => {
        const ins = byMessage.get(m.id);
        const open = openId === m.id;
        const st = ins ? (categoryStyle[ins.category] ?? categoryStyle.other) : null;
        return (
          <li key={m.id} className={cn(open && "bg-muted/20")}>
            <button type="button" onClick={() => setOpenId(open ? null : m.id)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/30">
              <SenderLogo name={m.folder === "sent" ? "You" : (m.fromName ?? m.fromAddress)} address={m.fromAddress} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13px]">
                  <span className="truncate font-medium">{m.folder === "sent" ? "You" : (m.fromName ?? m.fromAddress)}</span>
                  {st && ins?.category !== "unrelated" ? <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[10px]", st.tone)}>{st.label}</span> : null}
                  {m.attachments.length ? <Paperclip className="size-3 shrink-0 text-muted-foreground" /> : null}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  <span className="text-foreground/80">{m.subject}</span> · {(m.bodyText ?? "").slice(0, 120)}
                </p>
              </div>
              <span className="shrink-0 text-[11px] text-muted-foreground" suppressHydrationWarning>
                {ago(m.sentAt)}
              </span>
              <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition", open && "rotate-180")} />
            </button>
            {open ? (
              <div className="grid gap-3 px-3 pb-3 pl-14">
                {ins ? (
                  <InsightCard i={ins} />
                ) : aiOn && m.folder !== "sent" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="w-fit rounded-full"
                    disabled={busy === m.id}
                    onClick={async () => {
                      setBusy(m.id);
                      const r = await analyzeNow(m.id);
                      setBusy(null);
                      if (!r.ok) toast.error(r.error);
                      router.refresh();
                    }}
                  >
                    {busy === m.id ? <Loader2 className="animate-spin" /> : <Sparkles />} Analyse with AI
                  </Button>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  {m.folder === "sent" ? "To client" : `From ${m.fromAddress}`}
                  {m.auth?.verified ? " · verified sender" : ""}
                </p>
                <p className="max-h-72 overflow-y-auto text-xs leading-relaxed whitespace-pre-line">{m.bodyText}</p>
                {m.attachments.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <a key={a.key} href={fileUrl(a.key, a.name)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted">
                        <Paperclip className="size-3" /> {a.name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
