"use client";

import { ArrowUpRight, Check, CircleAlert, ExternalLink, Loader2, Lock, Plus, RefreshCw, ShieldCheck, Unplug, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { MailUsage } from "@/db/crm-schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { disconnect, syncNow } from "@/lib/connection-actions";
import { disconnectResend, repairResend } from "@/lib/connector-actions";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Mark } from "./marks";
import { UsageBars } from "./usage-meter";

type Resend = { status: string; account: string | null; connectedByName: string | null; createdAt: Date; webhookReady: boolean; lastError: string | null } | null;
type Conn = { id: string; provider: string; email: string; status: string; lastError: string | null; lastSyncAt: Date | null };
type Props = {
  tab: string;
  resend: Resend;
  usage: { source: "resend" | "lodgely"; plan: string; usage: MailUsage };
  mine: Conn[];
  ready: { google: boolean; microsoft: boolean };
  domain: { name: string; status: string | null } | null;
  ai: { on: boolean; available: boolean };
  canAdmin: boolean;
};

type Tile = { key: string; name: string; by: string; blurb: string; state: "connected" | "available" | "builtin" | "attention" | "setup"; detail: string };

const back = "/app/settings/connectors";

function Badge({ state }: { state: Tile["state"] }) {
  const map = {
    connected: ["Connected", "bg-emerald-500/12 text-emerald-500"],
    builtin: ["Built in", "bg-sky-500/12 text-sky-500"],
    attention: ["Needs attention", "bg-rose-500/12 text-rose-500"],
    setup: ["Needs setup", "bg-amber-500/12 text-amber-500"],
    available: ["", ""],
  } as const;
  const [label, cls] = map[state];
  return label ? <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", cls)}>{label}</span> : null;
}

function Perms({ can, cannot }: { can: string[]; cannot?: string[] }) {
  return (
    <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 text-[13px]">
      <div className="grid gap-1.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-3.5" /> Lodgely will be able to
        </p>
        {can.map((c) => (
          <p key={c} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> {c}
          </p>
        ))}
      </div>
      {cannot?.length ? (
        <div className="grid gap-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            <Lock className="size-3.5" /> It won’t
          </p>
          {cannot.map((c) => (
            <p key={c} className="flex gap-2 text-muted-foreground">
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" /> {c}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ConnectLink({ href, children, disabled, title }: { href: string; children: React.ReactNode; disabled?: boolean; title?: string }) {
  return disabled ? (
    <Button className="rounded-full" disabled title={title}>
      {children}
    </Button>
  ) : (
    <Button asChild className="rounded-full">
      <a href={href}>{children}</a>
    </Button>
  );
}

/** Claude-style connectors: a tile per app; open one to see what it can access, then connect with one click. */
export function Connectors(p: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; id?: string }>, msg: (id?: string) => string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg(r.id));
      router.refresh();
    });

  const tiles: Tile[] = [
    {
      key: "resend",
      name: "Resend",
      by: "Agency-wide · owners and admins",
      blurb: "Send from your own domain on your own Resend plan. Replies come back into Lodgely, and usage is tracked against your limits.",
      state: p.resend ? (p.resend.status === "active" ? "connected" : "attention") : "available",
      detail: p.resend ? `${p.resend.account ?? "Resend account"} · ${p.usage.plan === "free" ? "Free plan" : "Paid plan"}` : "Free plan: 3,000 emails a month, 100 a day",
    },
    {
      key: "google",
      name: "Gmail",
      by: "Just you",
      blurb: "See your Gmail inbox in Lodgely, file emails to clients, and send as your Gmail address.",
      state: p.mine.some((c) => c.provider === "google" && c.status === "error") ? "attention" : p.mine.some((c) => c.provider === "google") ? "connected" : p.ready.google ? "available" : "setup",
      detail: p.mine.filter((c) => c.provider === "google").map((c) => c.email).join(", ") || "Google Workspace or personal Gmail",
    },
    {
      key: "microsoft",
      name: "Outlook",
      by: "Just you",
      blurb: "See your Outlook or Microsoft 365 inbox in Lodgely, file emails to clients, and send as you.",
      state: p.mine.some((c) => c.provider === "microsoft" && c.status === "error") ? "attention" : p.mine.some((c) => c.provider === "microsoft") ? "connected" : p.ready.microsoft ? "available" : "setup",
      detail: p.mine.filter((c) => c.provider === "microsoft").map((c) => c.email).join(", ") || "Microsoft 365, Outlook.com or Exchange Online",
    },
    {
      key: "domain",
      name: "Your domain",
      by: "Agency-wide",
      blurb: "Your website's domain for email, so clients see name@youragency.com.au. Verified automatically once DNS is in place.",
      state: p.domain ? (p.domain.status === "verified" ? "connected" : "setup") : "available",
      detail: p.domain ? `${p.domain.name} · ${(p.domain.status ?? "pending").replace(/_/g, " ")}` : "Not added yet",
    },
    {
      key: "xkiro",
      name: "Lodgely AI",
      by: "Agency-wide",
      blurb: "Understands Home Affairs and assessing-body emails, and suggests pathways. Runs on Lodgely's AI service, nothing to sign in to.",
      state: p.ai.available ? "builtin" : "setup",
      detail: p.ai.on ? "Mail assistant on" : "Mail assistant off",
    },
  ];
  const shown = p.tab === "connected" ? tiles.filter((t) => t.state === "connected" || t.state === "builtin" || t.state === "attention") : tiles;
  const current = tiles.find((t) => t.key === open);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setOpen(t.key)}
            className="group flex min-h-40 flex-col gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-foreground/20 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="flex items-start gap-3">
              <Mark kind={t.key} />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 font-medium">
                  {t.name} <Badge state={t.state} />
                </p>
                <p className="text-[11px] text-muted-foreground">{t.by}</p>
              </div>
              {t.state === "available" ? (
                <span className="rounded-full border px-2.5 py-1 text-[12px] font-medium transition group-hover:bg-foreground group-hover:text-background">Connect</span>
              ) : (
                <ArrowUpRight className="size-4 text-muted-foreground transition group-hover:text-foreground" />
              )}
            </div>
            <p className="text-[13px] leading-snug text-muted-foreground">{t.blurb}</p>
            <p className="mt-auto truncate text-[11px] text-muted-foreground/80">{t.detail}</p>
          </button>
        ))}
        {!shown.length ? <p className="text-sm text-muted-foreground">Nothing connected yet. Connect Resend to send from your own domain, or Gmail/Outlook to bring your mailbox in.</p> : null}
      </div>

      <Dialog open={Boolean(current)} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          {current ? (
            <>
              <DialogHeader className="flex-row items-center gap-3 text-left">
                <Mark kind={current.key} size="lg" />
                <div className="min-w-0">
                  <DialogTitle className="flex items-center gap-2">
                    {current.name} <Badge state={current.state} />
                  </DialogTitle>
                  <DialogDescription>{current.by}</DialogDescription>
                </div>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{current.blurb}</p>

              {current.key === "resend" ? (
                p.resend ? (
                  <div className="grid gap-3">
                    <div className="grid gap-1 rounded-xl border p-3.5 text-[13px]">
                      <p>
                        <span className="text-muted-foreground">Account</span> {p.resend.account ?? "Your Resend team"}
                      </p>
                      <p suppressHydrationWarning>
                        <span className="text-muted-foreground">Connected</span> {ago(p.resend.createdAt)}
                        {p.resend.connectedByName ? ` by ${p.resend.connectedByName}` : ""}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <span className="text-muted-foreground">Incoming mail</span>
                        {p.resend.webhookReady ? (
                          <span className="inline-flex items-center gap-1 text-emerald-500">
                            <Check className="size-3.5" /> Flowing into Lodgely
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-500">
                            <CircleAlert className="size-3.5" /> Not set up, use Repair
                          </span>
                        )}
                      </p>
                      {p.resend.lastError ? <p className="text-rose-500">{p.resend.lastError}</p> : null}
                    </div>
                    {p.usage.source === "resend" ? <UsageBars usage={p.usage.usage} compact /> : null}
                    <Perms can={["Send email from domains in your Resend account", "Add your domain and check its DNS for you", "Receive replies to your domain (Lodgely adds one webhook)", "Read your plan's usage, to warn you before you hit a limit"]} cannot={["Change your Resend plan or billing", "Delete your domains or other webhooks", "Send anything you didn't write or approve"]} />
                    <div className="flex flex-wrap justify-end gap-2">
                      {p.canAdmin ? (
                        <>
                          <Button variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => confirm("Disconnect Resend? Mail on your own domain stops sending until you reconnect. Mail already in Lodgely stays.") && run(disconnectResend, () => "Resend disconnected")}>
                            <Unplug /> Disconnect
                          </Button>
                          <Button variant="outline" className="rounded-full" disabled={pending} onClick={() => run(repairResend, (d) => (d ? `Set up again. Using ${d}.` : "Set up again"))}>
                            {pending ? <Loader2 className="animate-spin" /> : <Wrench />} Repair setup
                          </Button>
                          {p.resend.status !== "active" ? <ConnectLink href={`/api/connect/resend/start?return=${back}`}>Reconnect</ConnectLink> : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    <Perms can={["Send email from domains in your Resend account", "Add your domain and check its DNS for you", "Receive replies to your domain (Lodgely adds one webhook)", "Read your plan's usage, to warn you before you hit a limit"]} cannot={["Change your Resend plan or billing", "Delete your domains or other webhooks", "Send anything you didn't write or approve"]} />
                    <p className="text-[12px] text-muted-foreground">You’ll sign in to Resend and approve access. No API keys to copy. No Resend account yet? You can create a free one on the same screen (3,000 emails a month, 100 a day).</p>
                    <div className="flex justify-end">
                      <ConnectLink href={`/api/connect/resend/start?return=${back}`} disabled={!p.canAdmin} title="Owners and admins only">
                        <Mark kind="resend" size="sm" className="size-5 rounded-md text-[10px]" /> Connect Resend
                      </ConnectLink>
                    </div>
                  </div>
                )
              ) : null}

              {current.key === "google" || current.key === "microsoft" ? (
                <div className="grid gap-3">
                  {p.mine
                    .filter((c) => c.provider === current.key)
                    .map((c) => (
                      <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{c.email}</p>
                          <p className={cn("text-[11px]", c.status === "error" ? "text-rose-500" : "text-muted-foreground")} suppressHydrationWarning title={c.lastError ?? undefined}>
                            {c.status === "error" ? "Needs reconnecting" : c.lastSyncAt ? `Synced ${ago(c.lastSyncAt)}` : "Syncing…"}
                          </p>
                        </div>
                        <Button size="icon-sm" variant="ghost" disabled={pending} title="Sync now" onClick={() => run(syncNow, (n) => (n === "0" ? "Up to date" : `${n} new`))}>
                          <RefreshCw />
                        </Button>
                        <Button size="icon-sm" variant="ghost" disabled={pending} title="Disconnect" onClick={() => confirm(`Disconnect ${c.email}? Mail already synced stays in Lodgely.`) && run(() => disconnect(c.id), () => "Disconnected")}>
                          <Unplug />
                        </Button>
                      </div>
                    ))}
                  <Perms can={["Read new mail in your inbox and save it in Lodgely", "Send email as you when you choose this address", "See your name and email address"]} cannot={["Delete or change mail in your mailbox", "Read other folders or other people's mailboxes"]} />
                  {current.state === "setup" ? <p className="text-[12px] text-amber-500">This needs the {current.key === "google" ? "Google" : "Microsoft"} app credentials added on the server first (a one-time setup for the whole of Lodgely).</p> : null}
                  <div className="flex justify-end">
                    <ConnectLink href={`/api/connect/${current.key}/start?return=${back}`} disabled={current.state === "setup"}>
                      <Plus /> {p.mine.some((c) => c.provider === current.key) ? "Connect another" : `Connect ${current.name}`}
                    </ConnectLink>
                  </div>
                </div>
              ) : null}

              {current.key === "domain" ? (
                <div className="grid gap-3">
                  <Perms can={["Send and receive as name@yourdomain", "Create info@ and a first-name address for each staff member", "Check DNS automatically until it's verified"]} cannot={["Change your website or its hosting", "Touch DNS records other than the ones listed for email"]} />
                  {!p.resend ? <p className="text-[12px] text-muted-foreground">Tip: connect Resend first. If your domain is already set up there, Lodgely picks it up with nothing to add.</p> : null}
                  <div className="flex justify-end">
                    <Button asChild className="rounded-full">
                      <Link href="/app/settings/email?tab=domain">{p.domain ? "Open domain settings" : "Add your domain"}</Link>
                    </Button>
                  </div>
                </div>
              ) : null}

              {current.key === "xkiro" ? (
                <div className="grid gap-3">
                  <Perms can={["Read emails from Home Affairs, assessing bodies and tracked cases, once an admin turns it on", "Suggest pathways from your agency's past outcomes"]} cannot={["Reply to anyone", "Change a case without a person approving it"]} />
                  <div className="flex justify-end">
                    <Button asChild variant="outline" className="rounded-full">
                      <Link href="/app/settings/ai">
                        AI settings <ExternalLink />
                      </Link>
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
