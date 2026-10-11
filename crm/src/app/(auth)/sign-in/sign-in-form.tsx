"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/app/motion";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/app";
  const [busy, setBusy] = useState(false);
  return (
    <FadeIn>
      <Logo className="mb-6 size-10 lg:hidden" />
      <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
      <p className="mt-1 text-sm text-muted-foreground">Sign in to your agency workspace.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          setBusy(true);
          const { error } = await authClient.signIn.email({ email: String(f.get("email")), password: String(f.get("password")) });
          setBusy(false);
          if (error) return toast.error(error.message ?? "Couldn't sign in");
          router.push(next.startsWith("/") ? next : "/app");
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required placeholder="you@agency.com.au" className="h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New agency?{" "}
        <Link href="/sign-up" className="font-medium text-primary hover:underline">
          Start free
        </Link>
      </p>
    </FadeIn>
  );
}
