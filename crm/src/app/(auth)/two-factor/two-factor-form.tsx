"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { authClient } from "@/lib/auth-client";

/** The second step of signing in: a code from the authenticator app, or a backup code. */
export function TwoFactorForm() {
  const router = useRouter();
  const raw = useSearchParams().get("next") ?? "/app";
  const next = /^\/(?!\/)/.test(raw) ? raw : "/app";
  const [code, setCode] = useState("");
  const [backup, setBackup] = useState(false);
  const [trust, setTrust] = useState(true);
  const [busy, setBusy] = useState(false);

  async function submit(value: string) {
    if (busy) return;
    setBusy(true);
    const { error } = backup ? await authClient.twoFactor.verifyBackupCode({ code: value.trim(), trustDevice: trust }) : await authClient.twoFactor.verifyTotp({ code: value, trustDevice: trust });
    setBusy(false);
    if (error) {
      setCode("");
      return toast.error(error.message === "Invalid code" || !error.message ? "That code didn't work. Check the time on your phone and try again." : error.message);
    }
    router.push(next);
  }

  return (
    <FadeIn>
      <div className="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-white/[0.06] text-white">
        <ShieldCheck className="size-6" />
      </div>
      <h1 className="text-center text-xl font-semibold tracking-tight text-white">{backup ? "Enter a backup code" : "Enter your sign-in code"}</h1>
      <p className="mt-1.5 text-center text-[13px] text-white/55">{backup ? "Each backup code works once. You saved them when you set up two-factor." : "Open your authenticator app and enter the 6-digit code for Lodgely."}</p>
      <form
        className="mt-8 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit(code);
        }}
      >
        {backup ? (
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="xxxxx-xxxxx" autoComplete="one-time-code" autoFocus className="h-10 border-white/10 bg-white/[0.04] text-center font-mono tracking-widest" />
        ) : (
          <div className="flex justify-center">
            <InputOTP
              maxLength={6}
              value={code}
              autoFocus
              inputMode="numeric"
              onChange={(v) => {
                setCode(v);
                if (v.length === 6) submit(v);
              }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="size-11 text-lg" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
        )}
        <label className="flex items-center justify-center gap-2 text-[13px] text-white/70">
          <Checkbox checked={trust} onCheckedChange={(v) => setTrust(Boolean(v))} /> Trust this device for 30 days
        </label>
        <Button type="submit" className="h-10 w-full rounded-lg bg-white text-black hover:bg-white/90" disabled={busy || (!backup && code.length < 6) || (backup && code.trim().length < 6)}>
          {busy ? <Loader2 className="animate-spin" /> : null} Verify
        </Button>
      </form>
      <div className="mt-6 grid gap-2 text-center text-sm text-white/55">
        <button
          type="button"
          className="underline-offset-4 hover:text-white hover:underline"
          onClick={() => {
            setBackup(!backup);
            setCode("");
          }}
        >
          {backup ? "Use the authenticator app instead" : "Lost your phone? Use a backup code"}
        </button>
        <Link href="/sign-in" className="underline-offset-4 hover:text-white hover:underline">
          Back to sign in
        </Link>
      </div>
    </FadeIn>
  );
}
