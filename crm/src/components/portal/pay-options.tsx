"use client";

import { CheckCircle2, Clock, CreditCard, ExternalLink, ImageUp, Landmark, Loader2, XCircle } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { uploadClientFile } from "@/components/mail/uploader";
import { CopyValue } from "@/components/portal/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startCardPayment, submitPaymentProof } from "@/lib/client-pay-actions";
import { cn } from "@/lib/utils";

type Card = { key: string; name: string; test: boolean };
type AttemptView = { id: string; provider: string; status: string; amount: string; createdAt: Date; reviewNote: string | null };
type Props = {
  invoiceId: string;
  number: string;
  left: number;
  agencyId: string;
  clientId: string;
  cards: Card[];
  zeller: string | null;
  bank: { name: string; bsb: string; account: string } | null;
  bankOn: boolean;
  attempts: AttemptView[];
};

const money = (n: number) => `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const label = (p: string) => (p === "bank" ? "bank transfer" : p === "zeller" ? "Zeller" : p[0].toUpperCase() + p.slice(1));

/** Proof step for bank transfers and Zeller: screenshot/receipt, amount, optional note. */
function Proof({ p, method }: { p: Props; method: "bank" | "zeller" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [amount, setAmount] = useState(p.left.toFixed(2));
  const [note, setNote] = useState("");
  const [pct, setPct] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-2.5 border-t p-3">
      <p className="text-[13px] font-medium">{method === "bank" ? "2. Upload a screenshot of the transfer" : "2. Upload your Zeller receipt"}</p>
      <input ref={ref} type="file" accept="image/*,application/pdf,.heic" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button type="button" onClick={() => ref.current?.click()} className={cn("flex items-center gap-2.5 rounded-xl border-2 border-dashed px-3 py-3 text-left text-[13px] transition active:scale-[.99]", file ? "border-emerald-500/50" : "border-border")}>
        <ImageUp className={cn("size-5 shrink-0", file ? "text-emerald-500" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1 truncate">{file ? file.name : method === "bank" ? "Screenshot from your banking app, or the receipt" : "Screenshot or emailed receipt"}</span>
      </button>
      <div className="grid grid-cols-[1fr_1.4fr] gap-2">
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Amount paid
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 text-[15px]" />
        </label>
        <label className="grid gap-1 text-[11px] text-muted-foreground">
          Note (optional)
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. paid from my partner's account" className="h-10" />
        </label>
      </div>
      <Button
        className="h-11 rounded-full"
        disabled={!file || pending || pct != null}
        onClick={() =>
          start(async () => {
            try {
              setPct(0);
              const up = await uploadClientFile(p.agencyId, p.clientId, file!, setPct);
              setPct(null);
              const r = await submitPaymentProof(p.invoiceId, method, up, Number(amount), note);
              if (!r.ok) throw new Error(r.error);
              toast.success("Thanks! We'll confirm once it reaches our account.");
              setFile(null);
              router.refresh();
            } catch (e) {
              setPct(null);
              toast.error(e instanceof Error ? e.message : String(e));
            }
          })
        }
      >
        {pending || pct != null ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} {pct != null ? `Uploading ${Math.round(pct)}%` : "I've paid, send receipt"}
      </Button>
    </div>
  );
}

export function PayOptions(p: Props) {
  const params = useSearchParams();
  const result = params.get("pay");
  const options = [...p.cards.map((c) => c.key), ...(p.zeller ? ["zeller"] : []), ...(p.bankOn ? ["bank"] : [])];
  const [method, setMethod] = useState(options[0] ?? "");
  const [pending, start] = useTransition();
  const review = p.attempts.filter((a) => a.status === "review");
  const rejected = p.attempts.find((a) => a.status === "rejected");

  return (
    <div className="grid gap-3 print:hidden">
      {result === "paid" ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-3 py-2.5 text-[13px]">
          <CheckCircle2 className="size-4 shrink-0 text-emerald-500" /> Payment received. Thank you!
        </div>
      ) : result === "pending" ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/30 px-3 py-2.5 text-[13px]">
          <Clock className="size-4 shrink-0 text-amber-500" /> We haven&apos;t had confirmation from the payment provider yet. If you completed the payment, it will show here shortly.
        </div>
      ) : result === "cancelled" ? (
        <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] text-muted-foreground">Payment cancelled. Nothing was charged.</div>
      ) : null}
      {review.map((a) => (
        <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/[0.05] px-3 py-2.5 text-[13px]">
          <Clock className="size-4 shrink-0 text-sky-500" />
          <span>
            Checking your {label(a.provider)} of {money(Number(a.amount))}. We&apos;ll confirm once it reaches our account.
          </span>
        </div>
      ))}
      {rejected && !review.length ? (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 px-3 py-2.5 text-[13px]">
          <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" />
          <span>We couldn&apos;t match your {label(rejected.provider)}: {rejected.reviewNote}</span>
        </div>
      ) : null}

      {options.length ? (
        <section className="overflow-hidden rounded-xl border bg-card">
          <p className="border-b px-3 py-2 text-xs font-medium">Pay {money(p.left)}</p>
          <div className="grid gap-1.5 p-2">
            {options.map((k) => {
              const card = p.cards.find((c) => c.key === k);
              const title = card ? `Card with ${card.name}` : k === "zeller" ? "Card with Zeller" : "Bank transfer";
              const sub = card ? (k === "paypal" ? "PayPal balance or card" : "Visa, Mastercard, Apple Pay, Google Pay") + (card.test ? " · test mode" : "") : k === "zeller" ? "Pay on Zeller, then upload the receipt" : "Transfer from your bank, then upload a screenshot";
              const Icon = k === "bank" ? Landmark : CreditCard;
              return (
                <button key={k} type="button" onClick={() => setMethod(k)} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition", method === k ? "border-foreground/60 bg-muted/40" : "border-transparent hover:bg-muted/30")}>
                  <span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", method === k && "border-foreground")}>{method === k ? <span className="size-2 rounded-full bg-foreground" /> : null}</span>
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{title}</span>
                    <span className="block text-[11px] text-muted-foreground">{sub}</span>
                  </span>
                </button>
              );
            })}
          </div>

          {p.cards.some((c) => c.key === method) ? (
            <div className="border-t p-3">
              <Button
                className="h-11 w-full rounded-full text-[15px]"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await startCardPayment(p.invoiceId, method);
                    if (!r.ok || !r.id) return void toast.error(("error" in r && r.error) || "Couldn't start the payment.");
                    window.location.assign(r.id);
                  })
                }
              >
                {pending ? <Loader2 className="animate-spin" /> : <CreditCard />} Pay {money(p.left)}
              </Button>
              <p className="mt-2 text-center text-[11px] text-muted-foreground">You&apos;ll pay on {p.cards.find((c) => c.key === method)?.name}&apos;s secure page, then come back here.</p>
            </div>
          ) : null}

          {method === "zeller" && p.zeller ? (
            <>
              <div className="border-t p-3">
                <p className="mb-2 text-[13px] font-medium">1. Pay on Zeller</p>
                <Button asChild variant="outline" className="h-10 w-full rounded-full">
                  <a href={p.zeller} target="_blank" rel="noreferrer">
                    Open Zeller payment page <ExternalLink />
                  </a>
                </Button>
              </div>
              <Proof p={p} method="zeller" />
            </>
          ) : null}

          {method === "bank" ? (
            <>
              <div className="border-t">
                <p className="px-3 pt-3 text-[13px] font-medium">1. Transfer to our client account</p>
                {p.bank ? (
                  <div className="divide-y">
                    <CopyValue label="Account name" value={p.bank.name} />
                    <CopyValue label="BSB" value={p.bank.bsb} />
                    <CopyValue label="Account" value={p.bank.account} />
                    <CopyValue label="Reference" value={p.number} />
                    <CopyValue label="Amount" value={p.left.toFixed(2)} />
                  </div>
                ) : (
                  <p className="p-3 text-xs text-muted-foreground">Your agent will send bank details. Use {p.number} as the reference.</p>
                )}
              </div>
              <Proof p={p} method="bank" />
            </>
          ) : null}
          <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">Payments in advance are held in our client trust account until the work is done, as the Code of Conduct requires.</p>
        </section>
      ) : null}
    </div>
  );
}
