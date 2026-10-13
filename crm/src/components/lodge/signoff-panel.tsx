"use client";

import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, Undo2, UserCheck, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { decideSignoff, requestSignoff, withdrawSignoff } from "@/lib/signoff-actions";
import { cn } from "@/lib/utils";

type Signoff = { id: string; status: string; requestedBy: string; requestedByName: string; reviewerId: string; reviewerName: string; requestNote: string | null; decisionNote: string | null; createdAt: Date; decidedAt: Date | null; blockingAtRequest: number | null };
type Props = {
  matterId: string;
  me: string;
  required: boolean;
  current: boolean;
  stale: boolean;
  blocking: number;
  history: Signoff[];
  agents: { id: string; name: string; role: string }[];
  defaultReviewer: string | null;
};

const when = (d: Date | null) => (d ? new Date(d).toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" }) : "");

/** Ask a registered agent to sign off, or (as the reviewer) approve / send back. */
export function SignoffPanel(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const others = p.agents.filter((a) => a.id !== p.me);
  const options = others.length ? others : p.agents; // a sole practitioner reviews their own
  const [reviewer, setReviewer] = useState(p.defaultReviewer && options.some((a) => a.id === p.defaultReviewer) ? p.defaultReviewer : (options[0]?.id ?? ""));
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState("");
  const open = p.history.find((h) => h.status === "pending");
  const latest = p.history[0];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      setNote("");
      setDecision("");
      router.refresh();
    });

  const status = p.current
    ? { icon: CheckCircle2, tone: "border-emerald-500/30 text-emerald-500", title: `Signed off by ${latest?.reviewerName}`, text: `${when(latest?.decidedAt ?? null)}. You can lodge. If any value or document changes, it needs signing off again.` }
    : p.stale
      ? { icon: AlertTriangle, tone: "border-amber-500/30 text-amber-500", title: "Changed since sign-off", text: `${latest?.reviewerName} approved an earlier version. Ask for sign-off again before lodging.` }
      : open
        ? { icon: Clock, tone: "border-sky-500/30 text-sky-500", title: `Waiting for ${open.reviewerName}`, text: `Requested by ${open.requestedByName} ${when(open.createdAt)}.` }
        : latest?.status === "changes"
          ? { icon: XCircle, tone: "border-rose-500/30 text-rose-500", title: `${latest.reviewerName} asked for changes`, text: latest.decisionNote ?? "" }
          : { icon: ShieldCheck, tone: "border-border text-muted-foreground", title: p.required ? "Needs sign-off before lodging" : "Sign-off is optional in this agency", text: "A second registered agent checks the data sheet, documents and checks, then approves." };

  return (
    <div className="grid max-w-3xl gap-4">
      <div className={cn("flex items-start gap-3 rounded-2xl border bg-card p-4", status.tone)}>
        <status.icon className="mt-0.5 size-5 shrink-0" />
        <div className="min-w-0">
          <p className="font-medium text-foreground">{status.title}</p>
          <p className="text-[13px] text-muted-foreground">{status.text}</p>
        </div>
      </div>

      {open && open.reviewerId === p.me ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserCheck className="size-4" /> Your review
          </p>
          {open.requestNote ? <p className="rounded-xl bg-muted/40 px-3 py-2 text-[13px]">&ldquo;{open.requestNote}&rdquo; · {open.requestedByName}</p> : null}
          {p.blocking ? <p className="text-[13px] text-rose-500">{p.blocking} item{p.blocking === 1 ? " is" : "s are"} still marked to fix under Before lodging.</p> : null}
          <p className="text-[12px] text-muted-foreground">Approving records exactly this data sheet and document list. Check them in the other tabs first.</p>
          <Textarea value={decision} onChange={(e) => setDecision(e.target.value)} placeholder="Note for the agent (needed if you ask for changes)" rows={3} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" className="rounded-full" disabled={pending} onClick={() => run(() => decideSignoff(open.id, "changes", decision), "Sent back with your note")}>
              <XCircle /> Ask for changes
            </Button>
            <Button className="rounded-full" disabled={pending} onClick={() => run(() => decideSignoff(open.id, "approved", decision), "Signed off")}>
              {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Approve for lodging
            </Button>
          </div>
        </section>
      ) : null}

      {!open && !p.current ? (
        <section className="grid gap-3 rounded-2xl border bg-card p-4">
          <p className="text-sm font-medium">Request sign-off</p>
          {options.length ? (
            <>
              <label className="grid gap-1.5 text-[13px]">
                <span className="text-muted-foreground">Reviewer (registered migration agent)</span>
                <select value={reviewer} onChange={(e) => setReviewer(e.target.value)} className="h-9 rounded-lg border bg-background px-3 text-sm">
                  {options.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                      {a.id === p.me ? " (you: the only registered agent)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything they should look at? (optional)" rows={2} />
              {p.blocking ? <p className="text-[12px] text-amber-500">{p.blocking} item{p.blocking === 1 ? " is" : "s are"} still marked to fix. You can still ask; the reviewer will see them.</p> : null}
              <div className="flex justify-end">
                <Button className="rounded-full" disabled={pending || !reviewer} onClick={() => run(() => requestSignoff(p.matterId, reviewer, note), reviewer === p.me ? "Ready for your own review" : "Sign-off requested")}>
                  {pending ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Request sign-off
                </Button>
              </div>
            </>
          ) : (
            <p className="text-[13px] text-muted-foreground">No one in the agency has a current MARN recorded. Add MARNs under Team.</p>
          )}
        </section>
      ) : null}

      {open && open.reviewerId !== p.me ? (
        <div className="flex justify-end">
          <Button variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => run(() => withdrawSignoff(open.id), "Request withdrawn")}>
            <Undo2 /> Withdraw request
          </Button>
        </div>
      ) : null}

      {p.history.length ? (
        <section className="rounded-2xl border bg-card">
          <header className="border-b px-4 py-2.5 text-[13px] font-medium">History</header>
          <ol className="divide-y">
            {p.history.map((h) => (
              <li key={h.id} className="grid gap-0.5 px-4 py-2.5 text-[13px]">
                <p>
                  <span className={cn("mr-2 rounded-full px-2 py-0.5 text-[11px]", h.status === "approved" ? "bg-emerald-500/12 text-emerald-500" : h.status === "changes" ? "bg-rose-500/12 text-rose-500" : h.status === "pending" ? "bg-sky-500/12 text-sky-500" : "bg-muted text-muted-foreground")}>
                    {h.status === "changes" ? "changes requested" : h.status}
                  </span>
                  {h.requestedByName} → {h.reviewerName}
                </p>
                <p className="text-[12px] text-muted-foreground" suppressHydrationWarning>
                  Asked {when(h.createdAt)}
                  {h.decidedAt ? ` · decided ${when(h.decidedAt)}` : ""}
                  {h.blockingAtRequest ? ` · ${h.blockingAtRequest} to fix at the time` : ""}
                </p>
                {h.decisionNote ? <p className="text-[12px]">&ldquo;{h.decisionNote}&rdquo;</p> : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
