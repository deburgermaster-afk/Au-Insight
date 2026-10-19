"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { setRequire2fa } from "@/lib/security-actions";
import { setRequireSignoff } from "@/lib/signoff-actions";

export function PracticeRules({ requireSignoff, require2fa = false, isOwner }: { requireSignoff: boolean; require2fa?: boolean; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-3">
      <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-500/12 text-sky-500">
          <ShieldCheck className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Sign-off before lodging</span>
          <span className="block text-[13px] text-muted-foreground">A second registered agent approves the lodgement pack before a matter can move to Lodged. If anything changes after approval, it needs approving again. A sole practitioner signs off their own.</span>
        </span>
        <Switch
          checked={requireSignoff}
          disabled={!isOwner || pending}
          onCheckedChange={(v) =>
            start(async () => {
              const r = await setRequireSignoff(v);
              if (!r.ok) toast.error(r.error);
              else toast.success(v ? "Sign-off is now required before lodging" : "Sign-off is now optional");
              router.refresh();
            })
          }
        />
      </label>
      <label className="flex items-start gap-3 rounded-2xl border bg-card p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-emerald-500/12 text-emerald-500">
          <KeyRound className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">Require two-factor sign-in</span>
          <span className="block text-[13px] text-muted-foreground">Everyone in the agency signs in with a password and a code from an authenticator app. Anyone who hasn&apos;t set it up is asked to before they can continue. Recommended: you hold passports, health records and client money.</span>
        </span>
        <Switch
          checked={require2fa}
          disabled={!isOwner || pending}
          onCheckedChange={(v) =>
            start(async () => {
              const r = await setRequire2fa(v);
              if (!r.ok) toast.error(r.error);
              else toast.success(v ? "Two-factor sign-in is now required" : "Two-factor sign-in is now optional");
              router.refresh();
            })
          }
        />
      </label>
      {!isOwner ? <p className="text-[12px] text-muted-foreground">Only the owner can change practice rules.</p> : null}
    </div>
  );
}
