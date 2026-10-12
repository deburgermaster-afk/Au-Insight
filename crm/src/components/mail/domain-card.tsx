"use client";

import { Check, CircleAlert, Copy, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMailDomain, checkMailDomain, removeMailDomain } from "@/lib/domain-actions";
import { cn } from "@/lib/utils";

type Rec = { record: string; name: string; type: string; value: string; priority?: number; status: string };

function CopyCell({ v }: { v: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(v);
        setOk(true);
        setTimeout(() => setOk(false), 1200);
      }}
      className="group flex min-w-0 items-center gap-1.5 text-left"
      title="Copy"
    >
      <span className="truncate font-mono text-[11px]">{v || "@"}</span>
      {ok ? <Check className="size-3 shrink-0 text-emerald-500" /> : <Copy className="size-3 shrink-0 opacity-40 group-hover:opacity-100" />}
    </button>
  );
}

const tone = (st: string) => (st === "verified" ? "text-emerald-500" : st === "failed" || st === "temporary_failure" ? "text-rose-500" : "text-amber-500");

/** Settings: send and receive as you@youragency.com.au instead of the shared domain. */
export function DomainCard({ domain, status, records, checkedAt, sharedDomain, canRemove }: { domain: string | null; status: string | null; records: Rec[] | null; checkedAt: string | null; sharedDomain: string | null; canRemove: boolean }) {
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, msg: (id?: string) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg(r.id));
      router.refresh();
    });
  const verified = status === "verified";
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", verified ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
          <Globe className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            Email domain{" "}
            {domain ? <span className={cn("ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize", tone(status ?? ""))}>{(status ?? "pending").replace(/_/g, " ")}</span> : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {verified
              ? `Your team sends and receives as name@${domain} (shared inbox info@${domain}). Older @${sharedDomain} addresses keep working.`
              : domain
                ? `Add these DNS records at your domain registrar, then check. It can take from a few minutes to a few hours.`
                : `Right now mail uses the shared ${sharedDomain ?? "Lodgely"} domain. Add your own so clients see your agency's address.`}
          </p>
        </div>
        {!domain ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => addMailDomain(name), () => "Domain added. Now add the DNS records.");
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="youragency.com.au" className="h-9 w-56" />
            <Button size="sm" className="h-9 rounded-full" disabled={pending || !name.trim()}>
              {pending ? <Loader2 className="animate-spin" /> : null} Add domain
            </Button>
          </form>
        ) : (
          <div className="flex gap-2">
            {!verified ? (
              <Button size="sm" className="rounded-full" disabled={pending} onClick={() => run(checkMailDomain, (st) => (st === "verified" ? "Verified! Mailboxes created on your domain." : `Not verified yet (${(st ?? "pending").replace(/_/g, " ")}). DNS can take a while.`))}>
                {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check DNS
              </Button>
            ) : null}
            {canRemove ? (
              <Button
                size="sm"
                variant="ghost"
                className="rounded-full text-muted-foreground"
                disabled={pending}
                onClick={() => {
                  if (confirm(`Remove ${domain}? Addresses on it will stop sending and receiving. Mail already in Lodgely stays.`)) run(removeMailDomain, () => "Domain removed");
                }}
              >
                <Trash2 /> Remove
              </Button>
            ) : null}
          </div>
        )}
      </div>
      {domain && records?.length && !verified ? (
        <div className="overflow-x-auto border-t">
          <table className="w-full min-w-[720px] table-fixed text-left text-xs">
            <colgroup>
              <col className="w-36" />
              <col className="w-16" />
              <col className="w-52" />
              <col />
              <col className="w-16" />
              <col className="w-28" />
            </colgroup>
            <thead className="bg-muted/40 text-[11px] text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Purpose</th>
                <th className="px-2 py-2 font-medium">Type</th>
                <th className="px-2 py-2 font-medium">Name / host</th>
                <th className="px-2 py-2 font-medium">Value</th>
                <th className="px-2 py-2 font-medium">Priority</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r, i) => (
                <tr key={i}>
                  <td className="px-4 py-2">{r.record === "Receiving" || (r.type === "MX" && r.record !== "SPF") ? "Receive mail" : r.record === "DKIM" ? "Signature (DKIM)" : r.record === "SPF" ? "Sending (SPF)" : r.record}</td>
                  <td className="px-2 py-2 font-mono">{r.type}</td>
                  <td className="overflow-hidden px-2 py-2">
                    <CopyCell v={r.name} />
                  </td>
                  <td className="overflow-hidden px-2 py-2">
                    <CopyCell v={r.value} />
                  </td>
                  <td className="px-2 py-2 font-mono">{r.priority ?? ""}</td>
                  <td className={cn("px-4 py-2 capitalize", tone(r.status))}>
                    <span className="inline-flex items-center gap-1">
                      {r.status === "verified" ? <Check className="size-3" /> : <CircleAlert className="size-3" />}
                      {r.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            The "Receive mail" MX record routes the domain's email to Lodgely. If the domain already receives mail elsewhere (Google Workspace, Microsoft 365), use a subdomain such as mail.youragency.com.au instead, or connect those mailboxes from the Inbox.
            {checkedAt ? ` Last checked ${checkedAt}.` : ""}
          </p>
        </div>
      ) : null}
    </div>
  );
}
