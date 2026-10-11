"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/app/motion";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapAgency } from "@/lib/actions";
import { authClient } from "@/lib/auth-client";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agency";

export function SignUpForm({ existingUser = false }: { existingUser?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(true);
  return (
    <FadeIn>
      <Logo className="mb-6 size-10 lg:hidden" />
      <h1 className="text-2xl font-semibold tracking-tight">{existingUser ? "Create your agency" : "Start your agency workspace"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">Free while you set up. No card needed.</p>
      <form
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const agency = String(f.get("agency")).trim();
          setBusy(true);
          try {
            if (!existingUser) {
              const { error } = await authClient.signUp.email({
                name: String(f.get("name")).trim(),
                email: String(f.get("email")).trim(),
                password: String(f.get("password")),
              });
              if (error) throw new Error(error.message ?? "Couldn't create your account");
            }
            const { data: org, error: orgError } = await authClient.organization.create({
              name: agency,
              slug: `${slugify(agency)}-${Math.random().toString(36).slice(2, 6)}`,
            });
            if (orgError || !org) throw new Error(orgError?.message ?? "Couldn't create the agency");
            await authClient.organization.setActive({ organizationId: org.id });
            const r = await bootstrapAgency(demo);
            if (r && !r.ok) throw new Error(r.error);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="agency">Agency name</Label>
          <Input id="agency" name="agency" required placeholder="Harbour Migration" className="h-11" />
        </div>
        {existingUser ? null : (
          <>
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" required autoComplete="name" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="h-11" />
            </div>
          </>
        )}
        <label className="flex items-start gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
          <Checkbox checked={demo} onCheckedChange={(v) => setDemo(v === true)} className="mt-0.5" />
          <span>
            <span className="font-medium">Fill with a demo workspace</span>
            <span className="block text-muted-foreground">Sample clients, matters, invoices and mail so you can explore. Delete any time.</span>
          </span>
        </label>
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Create workspace
        </Button>
      </form>
      {existingUser ? null : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </FadeIn>
  );
}
