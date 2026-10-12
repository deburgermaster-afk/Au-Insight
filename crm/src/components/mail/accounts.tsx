"use client";

import { Loader2, MoreHorizontal, Plus, RefreshCw, Unplug } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { disconnect, syncNow } from "@/lib/connection-actions";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

type Conn = { id: string; provider: string; email: string; status: string; lastError: string | null; lastSyncAt: Date | null };

const errors: Record<string, string> = {
  not_configured: "Gmail/Outlook sign-in isn't set up for this workspace yet. An admin needs to add the Google or Microsoft app credentials.",
  expired: "That sign-in link expired. Try connecting again.",
  cancelled: "Connection cancelled.",
  access_denied: "Access wasn't granted, so nothing was connected.",
  failed: "Couldn't finish connecting. Try again.",
};

function Mark({ p }: { p: string }) {
  return p === "google" ? (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-white text-[11px] font-bold text-[#ea4335]">G</span>
  ) : (
    <span className="grid size-6 shrink-0 place-items-center rounded-md bg-[#0a64d6] text-[11px] font-bold text-white">O</span>
  );
}

/** Inbox sidebar: connected Gmail/Outlook accounts, sync and connect buttons. */
export function MailAccounts({ connections, ready }: { connections: Conn[]; ready: { google: boolean; microsoft: boolean } }) {
  const params = useSearchParams();
  const router = useRouter();
  const [pending, start] = useTransition();
  useEffect(() => {
    const ok = params.get("connected");
    const err = params.get("connect_error");
    if (ok) toast.success(`Connected ${ok}. Recent mail is syncing now.`);
    if (err) toast.error(errors[err] ?? `Couldn't connect (${err}).`);
    if (ok || err) router.replace("/app/inbox");
  }, [params, router]);
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, done: (id?: string) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else toast.success(done(r.id));
      router.refresh();
    });
  return (
    <div className="mt-auto grid gap-2 rounded-lg border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between px-0.5">
        <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">Accounts</p>
        {connections.length ? (
          <Button size="icon-xs" variant="ghost" disabled={pending} onClick={() => run(syncNow, (n) => (n === "0" ? "Up to date" : `${n} new email${n === "1" ? "" : "s"}`))} aria-label="Sync now" title="Sync now">
            {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          </Button>
        ) : null}
      </div>
      {connections.map((c) => (
        <div key={c.id} className="flex items-center gap-2 rounded-md bg-background/60 px-2 py-1.5">
          <Mark p={c.provider} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12px] font-medium">{c.email}</p>
            <p className={cn("truncate text-[10px]", c.status === "error" ? "text-rose-500" : "text-muted-foreground")} suppressHydrationWarning title={c.lastError ?? undefined}>
              {c.status === "error" ? "Needs attention" : c.lastSyncAt ? `Synced ${ago(c.lastSyncAt)}` : "Syncing…"}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="ghost" aria-label="Account options">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">{c.email}</DropdownMenuLabel>
              {c.status === "error" ? (
                <DropdownMenuItem asChild>
                  <a href={`/api/connect/${c.provider}/start`}>Reconnect</a>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => run(syncNow, (n) => `${n} new`)}>
                <RefreshCw /> Sync now
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-rose-500" onClick={() => run(() => disconnect(c.id), () => "Disconnected. Synced mail stays in Lodgely.")}>
                <Unplug /> Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-1.5">
        {(["google", "microsoft"] as const).map((p) => (
          <a
            key={p}
            href={`/api/connect/${p}/start`}
            title={ready[p] ? undefined : "An admin needs to add the app credentials first"}
            className={cn("flex items-center justify-center gap-1.5 rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium transition hover:bg-muted", !ready[p] && "opacity-60")}
          >
            <Plus className="size-3" /> {p === "google" ? "Gmail" : "Outlook"}
          </a>
        ))}
      </div>
      <p className="px-0.5 text-[10px] leading-snug text-muted-foreground">Connect your own mailbox to see and send its mail here. Your agency addresses keep working too.</p>
    </div>
  );
}
