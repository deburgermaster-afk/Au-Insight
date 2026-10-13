"use client";

import { Check, CreditCard, ExternalLink, Landmark, Loader2, Unplug } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { connectPaymentProvider, disconnectPaymentProvider, setPaymentPrefs, toggleProvider } from "@/lib/payment-actions";
import { cn } from "@/lib/utils";

type Def = { key: string; name: string; blurb: string; fields: { key: string; label: string; placeholder: string; secret?: boolean }[]; help: string; fee: string; auto: boolean };
type Conn = { provider: string; enabled: boolean; status: string; mode: string; account: string | null; lastError: string | null };

const colors: Record<string, string> = { stripe: "bg-[#635bff] text-white", square: "bg-black text-white dark:bg-white dark:text-black", paypal: "bg-[#003087] text-white", airwallex: "bg-[#ff4f42] text-white", zeller: "bg-[#0a0a0a] text-[#c9f25d]" };

function Connect({ def, connected }: { def: Def; connected: boolean }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={connected ? "outline" : "default"} className="rounded-full">
          {connected ? "Update" : "Connect"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect {def.name}</DialogTitle>
          <DialogDescription>{def.help}</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const r = await connectPaymentProvider(def.key, vals);
              if (!r.ok) return void toast.error(r.error);
              toast.success(`${def.name} connected${r.id === "test" ? " in test mode" : ""}`);
              setOpen(false);
              router.refresh();
            });
          }}
        >
          {def.fields.map((f) => (
            <label key={f.key} className="grid gap-1.5 text-[13px]">
              <span className="text-muted-foreground">{f.label}</span>
              <Input type={f.secret ? "password" : "text"} autoComplete="off" placeholder={f.placeholder} value={vals[f.key] ?? ""} onChange={(e) => setVals({ ...vals, [f.key]: e.target.value })} />
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground">Checked with {def.name} before saving, stored encrypted, never shown again. Test keys work too and are labelled as test mode.</p>
          <div className="flex justify-end">
            <Button className="rounded-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Check />} Check and connect
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PaymentSettings({ defs, conns, bankOn, account, bankReady, canEdit }: { defs: Def[]; conns: Conn[]; bankOn: boolean; account: string; bankReady: boolean; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      router.refresh();
    });
  return (
    <div className="grid max-w-5xl gap-5">
      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Card payments</h2>
        <p className="-mt-2 text-[13px] text-muted-foreground">Connect any you use. Clients choose from the ones switched on when they pay an invoice in the portal. Card payments are confirmed with the provider before they&apos;re recorded.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {defs.map((d) => {
            const c = conns.find((x) => x.provider === d.key);
            return (
              <div key={d.key} className={cn("grid gap-3 rounded-2xl border bg-card p-4", c?.enabled && "border-emerald-500/30")}>
                <div className="flex items-start gap-3">
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold", colors[d.key])}>{d.name[0]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {d.name}
                      {c ? <span className={cn("rounded-full px-2 py-0.5 text-[11px]", c.status === "active" ? "bg-emerald-500/12 text-emerald-500" : "bg-rose-500/12 text-rose-500")}>{c.status === "active" ? (c.mode === "test" ? "Connected · test mode" : "Connected") : "Needs attention"}</span> : null}
                    </p>
                    <p className="text-[12px] text-muted-foreground">{d.blurb}</p>
                    {c?.account ? <p className="mt-1 truncate text-[11px] text-muted-foreground">{c.account}</p> : null}
                  </div>
                  {c ? <Switch checked={c.enabled} disabled={!canEdit || pending} onCheckedChange={(v) => run(() => toggleProvider(d.key, v), v ? `${d.name} on` : `${d.name} off`)} aria-label={`Offer ${d.name}`} /> : null}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">{d.fee}</span>
                  {canEdit ? (
                    <span className="flex gap-1.5">
                      {c ? (
                        <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => confirm(`Disconnect ${d.name}? Clients won't see it as a payment option.`) && run(() => disconnectPaymentProvider(d.key), `${d.name} disconnected`)}>
                          <Unplug />
                        </Button>
                      ) : null}
                      {d.auto ? (
                        <Connect def={d} connected={Boolean(c)} />
                      ) : !c ? (
                        <Button size="sm" className="rounded-full" disabled={pending} onClick={() => run(() => connectPaymentProvider(d.key, {}), `${d.name} turned on. Add a link to each invoice under Billing.`)}>
                          Turn on
                        </Button>
                      ) : null}
                    </span>
                  ) : null}
                </div>
                {!d.auto ? <p className="text-[11px] text-muted-foreground">{d.help}</p> : null}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Bank transfer</h2>
        <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/12 text-sky-500">
            <Landmark className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Let clients pay by bank transfer</span>
            <span className="block text-[13px] text-muted-foreground">They see your trust account details and the invoice number as reference, then upload a screenshot of the transfer. Someone in accounts checks it against the bank and approves it.</span>
            {!bankReady ? (
              <span className="mt-1 block text-[12px] text-amber-500">
                Add your trust account details in Agency profile → Invoicing & trust account.{" "}
                <Link href="/app/settings/agency?tab=invoicing" className="underline">
                  Open
                </Link>
              </span>
            ) : null}
          </span>
          <Switch checked={bankOn} disabled={!canEdit || pending} onCheckedChange={(v) => run(() => setPaymentPrefs({ bankTransfer: v }), v ? "Bank transfer on" : "Bank transfer off")} />
        </label>
      </section>

      <section className="grid gap-3">
        <h2 className="text-sm font-medium">Where payments are recorded</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            { v: "trust", t: "Trust account", d: "Money for work not yet done (the usual case for advance payments). Move it to office when earned, under Billing → Trust." },
            { v: "office", t: "Office account", d: "Only if invoices are issued for work already completed." },
          ].map((o) => (
            <button key={o.v} type="button" disabled={!canEdit || pending} onClick={() => run(() => setPaymentPrefs({ account: o.v as "trust" | "office" }), `Payments now go to the ${o.t.toLowerCase()}`)} className={cn("grid gap-1 rounded-2xl border bg-card p-4 text-left transition", account === o.v ? "border-foreground/60" : "hover:bg-muted/30")}>
              <span className="flex items-center gap-2 text-sm font-medium">
                <CreditCard className="size-4" /> {o.t} {account === o.v ? <Check className="ml-auto size-4" /> : null}
              </span>
              <span className="text-[12px] text-muted-foreground">{o.d}</span>
            </button>
          ))}
        </div>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          Card providers pay out to the bank account set in their dashboard; point it at the right account.
          <ExternalLink className="size-3" />
        </p>
      </section>
    </div>
  );
}
