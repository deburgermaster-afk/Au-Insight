"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requestClientLink } from "@/lib/client-actions";

export function ClientSignIn() {
  const expired = useSearchParams().get("expired");
  const [sent, setSent] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (sent)
    return (
      <div className="rounded-xl border bg-card p-5 text-center">
        <MailCheck className="mx-auto size-8 text-emerald-500" />
        <p className="mt-3 text-sm font-medium">Check your email</p>
        <p className="mt-1 text-xs text-muted-foreground">If {sent} has a portal, a sign-in link is on its way. It works once, for an hour.</p>
        <Button variant="ghost" size="sm" className="mt-3" onClick={() => setSent(null)}>
          Use another email
        </Button>
      </div>
    );
  return (
    <form
      className="grid gap-2 rounded-xl border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email"));
        start(async () => {
          const r = await requestClientLink(email);
          if (r.ok) setSent(email);
          else toast.error(r.error);
        });
      }}
    >
      {expired ? <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-500">That link has expired or was already used. Request a new one.</p> : null}
      <Input name="email" type="email" required autoComplete="email" inputMode="email" placeholder="you@example.com" className="h-10" />
      <Button type="submit" className="h-10 rounded-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null} Email me a sign-in link
      </Button>
    </form>
  );
}
