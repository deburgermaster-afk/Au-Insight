"use client";

import { Check, CircleAlert, ClipboardCopy, Copy, ExternalLink, Globe, Loader2, RefreshCw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addMailDomain, checkMailDomain, dnsHost, removeMailDomain } from "@/lib/domain-actions";
import { AutoDns } from "./auto-dns";
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
const purpose = (r: Rec) => (r.record === "Receiving" || (r.type === "MX" && r.record !== "SPF") ? "Receive mail" : r.record === "DKIM" ? "Signature (DKIM)" : r.record === "SPF" ? "Sending (SPF)" : r.record);

/** Live DNS check: quietly re-reads status every 15s while the page is open, asks Resend to re-check every 2 minutes. */
function useAutoVerify(active: boolean, onVerified: () => void) {
  const [checking, setChecking] = useState(false);
  const [last, setLast] = useState<Date | null>(null);
  const tick = useRef(0);
  const done = useRef(onVerified);
  useEffect(() => {
    done.current = onVerified;
  });
  useEffect(() => {
    if (!active) return;
    const started = Date.now();
    const id = setInterval(async () => {
      if (document.hidden || Date.now() - started > 45 * 60_000) return;
      tick.current++;
      setChecking(true);
      const r = await checkMailDomain({ quick: tick.current % 8 !== 0 }).catch(() => null);
      setChecking(false);
      setLast(new Date());
      if (r?.ok && r.id === "verified") done.current();
    }, 15_000);
    return () => clearInterval(id);
  }, [active]);
  return { checking, last };
}

/** Email & domain → Domain: send and receive as you@youragency.com.au instead of the shared domain. */
export function DomainCard({ domain, status, records, checkedAt, sharedDomain, canRemove, canEdit, via, suggested, resendConnected, cloudflare }: { domain: string | null; status: string | null; records: Rec[] | null; checkedAt: string | null; sharedDomain: string | null; canRemove: boolean; canEdit: boolean; via: string | null; suggested: string | null; resendConnected: boolean; cloudflare?: { connected: boolean; account: string | null; tokenUrl: string } }) {
  const [name, setName] = useState(suggested ?? "");
  const [pending, start] = useTransition();
  const [host, setHost] = useState<{ name: string; url: string | null } | null>(null);
  const router = useRouter();
  const verified = status === "verified";
  const { checking, last } = useAutoVerify(Boolean(domain && !verified && canEdit), () => {
    toast.success(`${domain} is verified`, { description: "Mailboxes on your domain are ready." });
    router.refresh();
  });
  useEffect(() => {
    if (domain && !verified && canEdit) dnsHost(domain).then(setHost).catch(() => null);
  }, [domain, verified, canEdit]);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, msg: (id?: string) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg(r.id));
      router.refresh();
    });
  const copyAll = () => {
    const text = (records ?? []).map((r) => [r.type, r.name || "@", r.value, r.priority ?? ""].join("\t")).join("\n");
    navigator.clipboard?.writeText(text);
    toast.success("All records copied", { description: "Type, name, value and priority, one per line." });
  };

  return (
    <div className="grid gap-4">
      <div className="overflow-hidden rounded-2xl border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <span className={cn("grid size-11 shrink-0 place-items-center rounded-2xl", verified ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground")}>
            <Globe className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {domain ?? "Your own domain"}
              {domain ? <span className={cn("rounded-full bg-muted px-2 py-0.5 text-[11px] capitalize", tone(status ?? ""))}>{(status ?? "pending").replace(/_/g, " ")}</span> : null}
              {domain ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{via === "resend" ? "In your Resend account" : "Via Lodgely"}</span> : null}
            </p>
            <p className="text-xs text-muted-foreground">
              {verified
                ? `Your team sends and receives as name@${domain} (shared inbox info@${domain}). Older @${sharedDomain} addresses keep working.`
                : domain
                  ? "Add the records below where your domain's DNS is managed. Lodgely keeps checking on its own and sets up your mailboxes the moment they're live."
                  : `Right now mail uses the shared ${sharedDomain ?? "Lodgely"} domain. Use your website's domain so clients see your agency's address.`}
            </p>
          </div>
          {!domain && canEdit ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                run(() => addMailDomain(name), (st) => (st === "verified" ? "Verified straight away. Mailboxes are ready." : "Domain added. Add the DNS records below."));
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="youragency.com.au" className="h-9 w-56" />
              <Button size="sm" className="h-9 rounded-full" disabled={pending || !name.trim()}>
                {pending ? <Loader2 className="animate-spin" /> : null} Use this domain
              </Button>
            </form>
          ) : domain && canEdit ? (
            <div className="flex gap-2">
              {!verified ? (
                <Button size="sm" variant="outline" className="rounded-full" disabled={pending} onClick={() => run(() => checkMailDomain(), (st) => (st === "verified" ? "Verified! Mailboxes created on your domain." : `Not live yet (${(st ?? "pending").replace(/_/g, " ")}). Still checking automatically.`))}>
                  {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check now
                </Button>
              ) : null}
              {canRemove ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-muted-foreground"
                  disabled={pending}
                  onClick={() => {
                    if (confirm(`Stop using ${domain}? Addresses on it stop sending and receiving. Mail already in Lodgely stays.`)) run(removeMailDomain, () => "Domain removed");
                  }}
                >
                  <Trash2 /> Remove
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {!domain && !resendConnected && canEdit ? (
          <div className="flex flex-wrap items-center gap-2 border-t bg-muted/20 px-4 py-2.5 text-[12px] text-muted-foreground">
            Already use Resend? Connect it and Lodgely picks up your verified domain automatically, nothing to type.
            <Link href="/app/settings/connectors" className="font-medium text-foreground underline-offset-2 hover:underline">
              Connect Resend
            </Link>
          </div>
        ) : null}
        {domain && !verified ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/20 px-4 py-2.5 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className={cn("size-1.5 rounded-full", checking ? "animate-pulse bg-amber-500" : "bg-emerald-500")} />
              {checking ? "Checking DNS…" : last ? `Checked ${last.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", second: "2-digit" })}` : "Watching for your records"}
            </span>
            {host ? (
              <span>
                DNS is managed at <b className="font-medium text-foreground">{host.name}</b>
                {host.url ? (
                  <>
                    {" · "}
                    <a href={host.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline">
                      Open {host.name} DNS <ExternalLink className="size-3" />
                    </a>
                  </>
                ) : null}
              </span>
            ) : null}
            {checkedAt ? <span suppressHydrationWarning>Last full check {checkedAt}</span> : null}
          </div>
        ) : null}
      </div>

      {cloudflare && canEdit ? <AutoDns connected={cloudflare.connected} account={cloudflare.account} tokenUrl={cloudflare.tokenUrl} host={host?.name ?? null} hasDomain={Boolean(domain)} verified={verified} /> : null}

      {domain && records?.length && !verified ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <p className="text-[13px] font-medium">{cloudflare?.connected ? "DNS records (set up automatically)" : "Or add the records yourself"}</p>
            <Button size="sm" variant="ghost" className="rounded-full" onClick={copyAll}>
              <ClipboardCopy /> Copy all
            </Button>
          </div>
          <div className="overflow-x-auto">
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
                    <td className="px-4 py-2">{purpose(r)}</td>
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
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">
            The “Receive mail” MX record routes the domain’s email to Lodgely. If the domain already receives mail elsewhere (Google Workspace, Microsoft 365), use a subdomain such as mail.youragency.com.au instead, or connect those mailboxes under Connectors.
          </p>
        </div>
      ) : null}
    </div>
  );
}
