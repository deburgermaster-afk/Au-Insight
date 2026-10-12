"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapAgency } from "@/lib/actions";
import { authClient } from "@/lib/auth-client";

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "agency";

export function SignUpForm({ existingUser = false }: { existingUser?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <FadeIn>
            <h1 className="text-center text-xl font-semibold tracking-tight text-white">{existingUser ? "Create your agency" : "Start your agency workspace"}</h1>
      <p className="mt-1.5 text-center text-[13px] text-white/55">Free while you set up. No card needed. Next, a two-minute guided setup.</p>
      <form
        className="mt-8 space-y-3.5"
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
            const r = await bootstrapAgency(false);
            if (r && !r.ok) throw new Error(r.error);
            location.assign("/setup");
          } catch (err) {
            toast.error(err instanceof Error ? err.message : String(err));
            setBusy(false);
          }
        }}
      >
        <div className="space-y-2">
          <Label className="text-[13px] text-white/75" htmlFor="agency">Agency name</Label>
          <Input id="agency" name="agency" required placeholder="Harbour Migration" className="h-10 border-white/10 bg-white/[0.04]" />
        </div>
        {existingUser ? null : (
          <>
            <div className="space-y-2">
              <Label className="text-[13px] text-white/75" htmlFor="name">Your name</Label>
              <Input id="name" name="name" required autoComplete="name" className="h-10 border-white/10 bg-white/[0.04]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-white/75" htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" required autoComplete="email" className="h-10 border-white/10 bg-white/[0.04]" />
            </div>
            <div className="space-y-2">
              <Label className="text-[13px] text-white/75" htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" className="h-10 border-white/10 bg-white/[0.04]" />
            </div>
          </>
        )}
        <Button type="submit" className="h-10 w-full rounded-lg bg-white text-black hover:bg-white/90" disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : null} Create workspace
        </Button>
      </form>
      {existingUser ? null : (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/sign-in" className="font-medium text-white underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      )}
    </FadeIn>
  );
}
