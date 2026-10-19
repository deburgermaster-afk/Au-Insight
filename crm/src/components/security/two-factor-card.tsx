"use client";

import { Check, Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

type Step = "idle" | "password" | "scan" | "codes" | "disable" | "regen";

/** Turn two-factor sign-in on or off, and keep backup codes. */
export function TwoFactorCard({ enabled, required }: { enabled: boolean; required: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [password, setPassword] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const reset = () => {
    setStep("idle");
    setPassword("");
    setCode("");
    setQr(null);
  };

  async function start() {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.enable({ password, issuer: "Lodgely" });
    setBusy(false);
    if (error || !data) return toast.error(error?.message === "Invalid password" ? "That password isn't right." : (error?.message ?? "Couldn't start setup."));
    if (!("totpURI" in data)) return toast.error("Couldn't start authenticator setup.");
    setSecret(new URL(data.totpURI).searchParams.get("secret") ?? "");
    setQr(await QRCode.toDataURL(data.totpURI, { margin: 1, width: 220 }));
    setCodes(data.backupCodes);
    setStep("scan");
  }

  async function confirm(v: string) {
    setBusy(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: v });
    setBusy(false);
    if (error) {
      setCode("");
      return toast.error("That code didn't match. Wait for a new one and try again.");
    }
    toast.success("Two-factor sign-in is on");
    setStep("codes");
  }

  async function disable() {
    setBusy(true);
    const { error } = await authClient.twoFactor.disable({ password });
    setBusy(false);
    if (error) return toast.error(error.message === "Invalid password" ? "That password isn't right." : (error.message ?? "Couldn't turn it off."));
    toast.success("Two-factor sign-in is off");
    reset();
    router.refresh();
  }

  async function regenerate() {
    setBusy(true);
    const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
    setBusy(false);
    if (error || !data) return toast.error(error?.message === "Invalid password" ? "That password isn't right." : (error?.message ?? "Couldn't make new codes."));
    setCodes(data.backupCodes);
    setStep("codes");
  }

  const passwordField = (onGo: () => void, label: string, destructive = false) => (
    <form
      className="grid gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onGo();
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="pw">Your password</Label>
        <Input id="pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant={destructive ? "destructive" : "default"} disabled={busy || !password}>
          {busy ? <Loader2 className="animate-spin" /> : null} {label}
        </Button>
        <Button type="button" variant="ghost" onClick={reset}>
          Cancel
        </Button>
      </div>
    </form>
  );

  return (
    <div className="grid gap-4 rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${enabled || step === "codes" ? "bg-emerald-500/12 text-emerald-500" : "bg-amber-500/12 text-amber-500"}`}>{enabled || step === "codes" ? <ShieldCheck className="size-5" /> : <ShieldOff className="size-5" />}</span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Two-factor sign-in</p>
          <p className="text-sm text-muted-foreground">
            {enabled || step === "codes" ? "On. Signing in needs your password and a code from your authenticator app." : "Off. Add a code from an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password) so a stolen password isn't enough to get in."}
          </p>
          {required && !enabled && step !== "codes" ? <p className="mt-1 text-sm font-medium text-amber-600 dark:text-amber-400">Your agency requires two-factor sign-in. Set it up to keep using Lodgely.</p> : null}
        </div>
      </div>

      {step === "idle" ? (
        <div className="flex flex-wrap gap-2">
          {enabled ? (
            <>
              <Button variant="outline" onClick={() => setStep("regen")}>
                <KeyRound /> New backup codes
              </Button>
              {!required ? (
                <Button variant="ghost" className="text-destructive" onClick={() => setStep("disable")}>
                  Turn off
                </Button>
              ) : null}
            </>
          ) : (
            <Button onClick={() => setStep("password")}>
              <ShieldCheck /> Set up two-factor
            </Button>
          )}
        </div>
      ) : null}

      {step === "password" ? passwordField(start, "Continue") : null}
      {step === "disable" ? passwordField(disable, "Turn off two-factor", true) : null}
      {step === "regen" ? passwordField(regenerate, "Make new backup codes") : null}

      {step === "scan" && qr ? (
        <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="rounded-xl border bg-white p-2" />
          <div className="grid gap-3">
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Open your authenticator app and add an account.</li>
              <li>Scan the code, or enter this key: <code className="break-all rounded bg-muted px-1.5 py-0.5 text-foreground">{secret}</code></li>
              <li>Enter the 6-digit code it shows.</li>
            </ol>
            <InputOTP
              maxLength={6}
              value={code}
              autoFocus
              inputMode="numeric"
              onChange={(v) => {
                setCode(v);
                if (v.length === 6) confirm(v);
              }}
            >
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="size-10" />
                ))}
              </InputOTPGroup>
            </InputOTP>
            <div className="flex items-center gap-2">
              {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              <Button variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "codes" ? (
        <div className="grid gap-3">
          <p className="text-sm">Save these backup codes somewhere safe, like a password manager. Each one signs you in once if you lose your phone. They won&apos;t be shown again.</p>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-5">
            {codes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(codes.join("\n"));
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check /> : <Copy />} Copy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob([`Lodgely backup codes\n\n${codes.join("\n")}\n`], { type: "text/plain" }));
                a.download = "lodgely-backup-codes.txt";
                a.click();
              }}
            >
              <Download /> Download
            </Button>
            <Button
              size="sm"
              onClick={() => {
                reset();
                setCodes([]);
                router.refresh();
              }}
            >
              I&apos;ve saved them
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
