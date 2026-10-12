"use client";

import { REGEXP_ONLY_DIGITS } from "input-otp";
import { ArrowLeft, Loader2, Mail } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from "@/components/ui/input-otp";
import { requestClientCode, verifyClientCode } from "@/lib/client-actions";

const RESEND_AFTER = 30;

/** Two steps: email, then the 6-digit code we email. The email also carries a one-tap link. */
export function ClientSignIn() {
  const expired = useSearchParams().get("expired");
  const [email, setEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = (to: string) =>
    start(async () => {
      const r = await requestClientCode(to);
      if (!r.ok) return void toast.error(r.error);
      setEmail(to);
      setCode("");
      setError(null);
      setWait(RESEND_AFTER);
    });

  const verify = (value: string) =>
    start(async () => {
      setError(null);
      const r = await verifyClientCode(email ?? "", value);
      if (r.ok) return void location.assign("/client");
      setError(r.error);
      setCode("");
    });

  if (!email)
    return (
      <form
        className="grid gap-2 rounded-xl border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(String(new FormData(e.currentTarget).get("email")).trim());
        }}
      >
        {expired ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500">That link has expired or was already used. Get a new code below.</p> : null}
        <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className="h-10" autoFocus />
        <Button type="submit" className="h-10 rounded-full" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Mail />} Email me a code
        </Button>
      </form>
    );

  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="text-center">
        <p className="text-sm font-medium">Enter the 6-digit code</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">Sent to {email}</p>
      </div>
      <div className="flex justify-center">
        <InputOTP
          maxLength={6}
          pattern={REGEXP_ONLY_DIGITS}
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          onComplete={verify}
          disabled={pending}
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Sign-in code"
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} className="size-11 text-lg" />
            <InputOTPSlot index={1} className="size-11 text-lg" />
            <InputOTPSlot index={2} className="size-11 text-lg" />
          </InputOTPGroup>
          <InputOTPSeparator />
          <InputOTPGroup>
            <InputOTPSlot index={3} className="size-11 text-lg" />
            <InputOTPSlot index={4} className="size-11 text-lg" />
            <InputOTPSlot index={5} className="size-11 text-lg" />
          </InputOTPGroup>
        </InputOTP>
      </div>
      {error ? <p className="text-center text-xs text-rose-500">{error}</p> : null}
      <Button className="h-10 rounded-full" disabled={pending || code.length < 6} onClick={() => verify(code)}>
        {pending ? <Loader2 className="animate-spin" /> : null} Sign in
      </Button>
      <div className="flex items-center justify-between text-xs">
        <button type="button" className="flex items-center gap-1 text-muted-foreground hover:text-foreground" onClick={() => setEmail(null)}>
          <ArrowLeft className="size-3" /> Change email
        </button>
        <button type="button" className="text-muted-foreground hover:text-foreground disabled:opacity-50" disabled={wait > 0 || pending} onClick={() => send(email)}>
          {wait > 0 ? `Resend in ${wait}s` : "Resend code"}
        </button>
      </div>
    </div>
  );
}
