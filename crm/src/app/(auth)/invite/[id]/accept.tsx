"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { FadeIn } from "@/components/app/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/format";
import { acceptInvite } from "@/lib/team-actions";

const field = "h-10 border-white/10 bg-white/[0.04]";

export function AcceptInvite({ id, email, agency, inviter, position, about, signedInAs }: { id: string; email: string; agency: string; inviter: string; position: string | null; about: string | null; signedInAs: string | null }) {
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const matches = signedInAs?.toLowerCase() === email.toLowerCase();

  async function join() {
    const r = await acceptInvite(id);
    if (!r.ok) throw new Error(r.error);
    location.assign("/app/me");
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <FadeIn>
      <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-white/10 text-lg font-semibold text-white">{initials(agency)}</div>
      <h1 className="mt-5 text-center text-xl font-semibold tracking-tight text-white">Join {agency}</h1>
      <p className="mt-1.5 text-center text-[13px] text-white/55">
        {inviter} invited <span className="text-white/80">{email}</span>
        {position ? (
          <>
            {" "}as <span className="text-white/80">{position}</span>
          </>
        ) : null}
        .
      </p>
      {about ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3 text-center text-xs text-white/60">{about}</p> : null}

      {matches ? (
        <Button className="mt-8 h-10 w-full rounded-full" disabled={busy} onClick={() => run(join)}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Accept and continue
        </Button>
      ) : (
        <form
          className="mt-8 space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            run(async () => {
              if (signedInAs) await authClient.signOut();
              const password = String(f.get("password"));
              const { error } =
                mode === "new" ? await authClient.signUp.email({ name: String(f.get("name")).trim(), email, password }) : await authClient.signIn.email({ email, password });
              if (error) throw new Error(error.message ?? "Couldn't sign you in");
              await join();
            });
          }}
        >
          {signedInAs ? <p className="text-center text-xs text-amber-300/80">You're signed in as {signedInAs}. Continuing signs you in as {email}.</p> : null}
          {mode === "new" ? (
            <div className="space-y-2">
              <Label className="text-[13px] text-white/75" htmlFor="name">
                Your name
              </Label>
              <Input id="name" name="name" required autoComplete="name" className={field} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label className="text-[13px] text-white/75" htmlFor="email">
              Email
            </Label>
            <Input id="email" value={email} readOnly className={`${field} text-white/60`} />
          </div>
          <div className="space-y-2">
            <Label className="text-[13px] text-white/75" htmlFor="password">
              {mode === "new" ? "Choose a password" : "Password"}
            </Label>
            <Input id="password" name="password" type="password" required minLength={8} autoComplete={mode === "new" ? "new-password" : "current-password"} className={field} />
          </div>
          <Button type="submit" className="h-10 w-full rounded-full" disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {mode === "new" ? "Create account and join" : "Sign in and join"}
          </Button>
          <button type="button" onClick={() => setMode(mode === "new" ? "existing" : "new")} className="w-full text-center text-xs text-white/55 hover:text-white">
            {mode === "new" ? "Already have a Lodgely login? Sign in instead" : "New to Lodgely? Create an account"}
          </button>
        </form>
      )}
    </FadeIn>
  );
}
