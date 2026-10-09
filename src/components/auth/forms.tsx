"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { LockIcon, MailIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { createClient } from "@/lib/supabase/client";
import { AuthShell, IconInput, OTP_LENGTH, authErrorMessage } from "./auth-shell";

const MIN_PASSWORD = 8;

function SubmitButton({ busy, children }: { busy: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" size="lg" disabled={busy} className="mt-2 h-12 rounded-full text-[15px]">
      {busy ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
    </Button>
  );
}

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <InputOTP maxLength={OTP_LENGTH} value={value} onChange={onChange} autoFocus inputMode="numeric" pattern="^[0-9]+$">
      <InputOTPGroup className="w-full justify-between gap-2">
        {Array.from({ length: OTP_LENGTH }, (_, i) => (
          <InputOTPSlot key={i} index={i} className="h-14 flex-1 rounded-xl border-none bg-muted/60 text-xl first:rounded-xl last:rounded-xl" />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}

function useResendTimer() {
  const [left, setLeft] = useState(60);
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);
  return { left, restart: () => setLeft(60) };
}

export function SignInForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setBusy(false);
      if (/not confirmed/i.test(error.message)) {
        await supabase.auth.resend({ type: "signup", email });
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error(authErrorMessage(error.message));
      return;
    }
    router.replace("/app");
    router.refresh();
  }

  return (
    <AuthShell
      title={
        <>
          Hey,
          <br />
          Welcome back
        </>
      }
      footer={
        <>
          Don&apos;t have an account?{" "}
          <Link href="/sign-up" className="font-medium text-foreground">
            Sign up
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <IconInput icon={MailIcon} type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <IconInput
          icon={LockIcon}
          type="password"
          autoComplete="current-password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Link href={`/forgot-password${email ? `?email=${encodeURIComponent(email)}` : ""}`} className="self-center py-1 text-sm text-muted-foreground hover:text-foreground">
          Forgot password?
        </Link>
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function SignUpForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) return toast.error(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    const { error } = await createClient().auth.signUp({ email, password });
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error.message));
    router.push(`/verify?email=${encodeURIComponent(email)}`);
  }

  return (
    <AuthShell
      title={
        <>
          Let&apos;s get
          <br />
          started
        </>
      }
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-foreground">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <IconInput icon={MailIcon} type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <IconInput icon={LockIcon} type="password" autoComplete="new-password" placeholder="Password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <IconInput icon={LockIcon} type="password" autoComplete="new-password" placeholder="Confirm password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <SubmitButton busy={busy}>Sign up</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function VerifyForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer();

  async function verify(token: string) {
    setBusy(true);
    const { error } = await createClient().auth.verifyOtp({ email, token, type: "email" });
    if (error) {
      setBusy(false);
      setCode("");
      return toast.error(authErrorMessage(error.message));
    }
    router.replace("/app");
    router.refresh();
  }

  async function resend() {
    const { error } = await createClient().auth.resend({ type: "signup", email });
    if (error) return toast.error(authErrorMessage(error.message));
    timer.restart();
    toast.success("New code sent.");
  }

  return (
    <AuthShell
      back="/sign-up"
      title={
        <>
          Verify
          <br />
          your email
        </>
      }
      subtitle={
        <>
          Enter the {OTP_LENGTH}-digit code sent to <span className="text-foreground">{email || "your email"}</span>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          verify(code);
        }}
        className="flex flex-col gap-3"
      >
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === OTP_LENGTH) verify(v);
          }}
        />
        <button type="button" disabled={timer.left > 0} onClick={resend} className="self-center py-2 text-sm text-muted-foreground underline-offset-4 enabled:hover:text-foreground enabled:hover:underline">
          {timer.left > 0 ? `Resend code in ${timer.left}s` : "Resend code"}
        </button>
        <SubmitButton busy={busy}>Verify</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function ForgotPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState(useSearchParams().get("email") ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await createClient().auth.resetPasswordForEmail(email);
    setBusy(false);
    if (error) return toast.error(authErrorMessage(error.message));
    router.push(`/reset-password?email=${encodeURIComponent(email)}`);
  }

  return (
    <AuthShell back="/sign-in" title="Forgot password?" subtitle="Enter your email and we'll send you a code.">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <IconInput icon={MailIcon} type="email" autoComplete="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <SubmitButton busy={busy}>Send code</SubmitButton>
      </form>
    </AuthShell>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const email = useSearchParams().get("email") ?? "";
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useResendTimer();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== OTP_LENGTH) return toast.error(`Enter the ${OTP_LENGTH}-digit code.`);
    if (password.length < MIN_PASSWORD) return toast.error(`Use at least ${MIN_PASSWORD} characters.`);
    if (password !== confirm) return toast.error("Passwords don't match.");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: "recovery" });
    if (error) {
      setBusy(false);
      return toast.error(authErrorMessage(error.message));
    }
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      return toast.error(authErrorMessage(updateError.message));
    }
    toast.success("Password updated.");
    router.replace("/app");
    router.refresh();
  }

  async function resend() {
    const { error } = await createClient().auth.resetPasswordForEmail(email);
    if (error) return toast.error(authErrorMessage(error.message));
    timer.restart();
    toast.success("New code sent.");
  }

  return (
    <AuthShell
      back="/forgot-password"
      title={
        <>
          Create new
          <br />
          password
        </>
      }
      subtitle={
        <>
          Enter the code sent to <span className="text-foreground">{email}</span> and choose a new password.
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-3">
        <CodeInput value={code} onChange={setCode} />
        <button type="button" disabled={timer.left > 0} onClick={resend} className="self-center py-1 text-sm text-muted-foreground enabled:hover:text-foreground">
          {timer.left > 0 ? `Resend code in ${timer.left}s` : "Resend code"}
        </button>
        <IconInput icon={LockIcon} type="password" autoComplete="new-password" placeholder="New password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <IconInput icon={LockIcon} type="password" autoComplete="new-password" placeholder="Confirm password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        <SubmitButton busy={busy}>Save</SubmitButton>
      </form>
    </AuthShell>
  );
}
