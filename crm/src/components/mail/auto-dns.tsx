"use client";

import { Check, CircleAlert, ExternalLink, KeyRound, Loader2, Minus, Unplug, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { configureDns, connectCloudflare, disconnectCloudflare } from "@/lib/dns-actions";
import type { DnsStep } from "@/lib/dns-connect";
import { cn } from "@/lib/utils";

/**
 * One-click DNS: with a Cloudflare token (DNS edit), Lodgely writes the email records into the zone
 * and verifies them, so the domain goes live without copying anything.
 */
export function AutoDns({ connected, account, tokenUrl, host, hasDomain, verified }: { connected: boolean; account: string | null; tokenUrl: string; host: string | null; hasDomain: boolean; verified: boolean }) {
  const [token, setToken] = useState("");
  const [steps, setSteps] = useState<DnsStep[] | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const elsewhere = host && host !== "Cloudflare";
  const done = (s?: DnsStep[], status?: string) => {
    if (s) setSteps(s);
    const added = s?.filter((x) => x.result === "added" || x.result === "updated").length ?? 0;
    toast.success(status === "verified" ? "DNS set up and verified. Mailboxes are ready." : `DNS set up${added ? ` (${added} record${added === 1 ? "" : "s"} written)` : ""}. Verifying now: usually a minute or two.`);
    router.refresh();
  };
  if (verified && !connected) return null;
  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b bg-gradient-to-r from-orange-500/10 to-transparent px-4 py-3">
        <span className="grid size-9 place-items-center rounded-xl bg-orange-500/15 text-orange-500">
          <Wand2 className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">Automatic DNS with Cloudflare</p>
          <p className="text-xs text-muted-foreground">{connected ? `Connected${account ? ` · ${account}` : ""}. Lodgely writes your email records and verifies them for you.` : "Connect once and Lodgely adds every record for you, now and for future domains. Free Cloudflare DNS works."}</p>
        </div>
        {connected ? (
          <div className="flex gap-2">
            {hasDomain && !verified ? (
              <Button size="sm" className="rounded-full" disabled={pending} onClick={() => start(async () => {
                const r = await configureDns();
                if (!r.ok) return void toast.error(r.error);
                done(r.steps, r.status);
              })}>
                {pending ? <Loader2 className="animate-spin" /> : <Wand2 />} Set up DNS now
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => confirm("Disconnect Cloudflare? Records already added stay in place.") && start(async () => {
              const r = await disconnectCloudflare();
              if (!r.ok) return void toast.error(r.error);
              router.refresh();
            })}>
              <Unplug /> Disconnect
            </Button>
          </div>
        ) : null}
      </div>
      {!connected ? (
        <div className="grid gap-3 p-4">
          {elsewhere ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700 dark:text-amber-400">Your DNS is at {host}, so add the records below there, or move your domain&apos;s DNS to Cloudflare (free) to have it done automatically.</p> : null}
          <ol className="grid gap-3 text-[13px]">
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">1</span>
              <span className="flex-1">
                Create a token in Cloudflare. The permissions are already filled in (DNS edit, zone read): just pick your domain and press <b>Create token</b>.
                <a href={tokenUrl} target="_blank" rel="noreferrer" className="mt-1.5 flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium hover:bg-muted">
                  Open Cloudflare <ExternalLink className="size-3" />
                </a>
              </span>
            </li>
            <li className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-semibold">2</span>
              <span className="grid flex-1 gap-2">
                Paste the token here. It&apos;s checked, encrypted and only used to manage your email records.
                <span className="flex gap-2">
                  <span className="relative flex-1">
                    <KeyRound className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Cloudflare API token" className="h-9 pl-8" />
                  </span>
                  <Button size="sm" className="h-9 rounded-full" disabled={pending || token.trim().length < 30} onClick={() => start(async () => {
                    const r = await connectCloudflare(token);
                    if (!r.ok) return void toast.error(r.error);
                    setToken("");
                    if (r.steps) done(r.steps);
                    else {
                      toast.success(`Cloudflare connected (${r.zones.length} domain${r.zones.length === 1 ? "" : "s"}).`);
                      router.refresh();
                    }
                  })}>
                    {pending ? <Loader2 className="animate-spin" /> : null} Connect{hasDomain && !verified ? " & set up" : ""}
                  </Button>
                </span>
              </span>
            </li>
          </ol>
        </div>
      ) : null}
      {steps?.length ? (
        <ul className="divide-y border-t text-[12px]">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 px-4 py-2">
              <span className={cn("mt-0.5", s.result === "skipped" ? "text-amber-500" : s.result === "exists" ? "text-muted-foreground" : "text-emerald-500")}>{s.result === "skipped" ? <CircleAlert className="size-3.5" /> : s.result === "exists" ? <Minus className="size-3.5" /> : <Check className="size-3.5" />}</span>
              <span className="w-24 shrink-0 font-medium">{s.record}</span>
              <span className="font-mono text-muted-foreground">{s.type}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{s.name}</span>
              <span className="shrink-0 capitalize">{s.result === "exists" ? "Already there" : s.result}</span>
              {s.note ? <span className="basis-full pl-6 text-amber-600">{s.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
