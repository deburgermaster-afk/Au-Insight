"use client";

import { Check, Loader2, Lock, Puzzle, ShieldCheck } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveExtension } from "@/lib/ext-actions";

type ChromeLike = { runtime?: { sendMessage?: (id: string, msg: unknown, cb: (r: unknown) => void) => void; lastError?: { message?: string } } };

export function PairApprove({ ext, browser, user, allowed }: { ext: string | null; browser: string; user: { name: string; email: string; agency: string }; allowed: boolean }) {
  const [state, setState] = useState<"ask" | "done" | "error">("ask");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const approve = () =>
    start(async () => {
      const chrome = (globalThis as { chrome?: ChromeLike }).chrome;
      if (!ext || !chrome?.runtime?.sendMessage) {
        setState("error");
        setError("Open this page from the Lodgely extension's Connect button, in the browser where it's installed.");
        return;
      }
      const r = await approveExtension(browser);
      if (!r.ok || !r.token) {
        setState("error");
        setError(("error" in r && r.error) || "Couldn’t approve.");
        return;
      }
      chrome.runtime.sendMessage(ext, { type: "lodgely:paired", token: r.token, base: location.origin, user: r.user }, (reply) => {
        if (chrome.runtime?.lastError || !(reply as { ok?: boolean } | undefined)?.ok) {
          setState("error");
          setError("The extension didn't answer. Make sure it's installed and enabled, then press Connect in it again.");
        } else setState("done");
      });
    });

  if (state === "done")
    return (
      <div className="grid justify-items-center gap-3 rounded-3xl border bg-card p-8 text-center">
        <span className="grid size-12 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500">
          <Check className="size-6" />
        </span>
        <h1 className="text-lg font-semibold">Connected</h1>
        <p className="text-sm text-muted-foreground">The ImmiAccount helper is signed in as {user.name}. You can close this tab and open ImmiAccount.</p>
        <Button asChild className="mt-2 rounded-full">
          <a href="https://online.immi.gov.au/lusc/login">Open ImmiAccount</a>
        </Button>
      </div>
    );

  return (
    <div className="grid gap-5 rounded-3xl border bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-sky-500/25 to-sky-500/5 text-sky-500">
          <Puzzle className="size-6" />
        </span>
        <div>
          <h1 className="font-semibold">Lodgely for ImmiAccount wants access</h1>
          <p className="text-[13px] text-muted-foreground">
            {browser} · {user.email} · {user.agency}
          </p>
        </div>
      </div>
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 text-[13px]">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-3.5" /> It will be able to
        </p>
        {["List your agency's open cases", "Read a case's data sheet when you pick it", "Fill ImmiAccount fields on the page you're on, when you click Fill"].map((t) => (
          <p key={t} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> {t}
          </p>
        ))}
        <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <Lock className="size-3.5" /> It never
        </p>
        {["Sees or stores your ImmiAccount password", "Clicks Next, Submit or Pay", "Changes anything in Lodgely"].map((t) => (
          <p key={t} className="flex gap-2 text-muted-foreground">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" /> {t}
          </p>
        ))}
      </div>
      {error ? <p className="text-[13px] text-rose-500">{error}</p> : null}
      {!allowed ? <p className="text-[13px] text-amber-500">Your role doesn&apos;t include client files, so the helper can&apos;t be connected for you.</p> : null}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" className="rounded-full" onClick={() => window.close()}>
          Cancel
        </Button>
        <Button className="rounded-full" disabled={pending || !allowed} onClick={approve}>
          {pending ? <Loader2 className="animate-spin" /> : null} Allow
        </Button>
      </div>
      <p className="text-center text-[11px] text-muted-foreground">You can disconnect it any time in Settings → Connectors.</p>
    </div>
  );
}
