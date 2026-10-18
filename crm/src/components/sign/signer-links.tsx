"use client";

import { Copy, Loader2, Mail } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { otherSignerLink } from "@/lib/sign-actions";

/** Copy or re-email another signer's personal link (a new link each time; the old one stops working). */
export function SignerLinkButtons({ id, signerId }: { id: string; signerId: string }) {
  const [pending, start] = useTransition();
  return (
    <span className="flex gap-1">
      <Button
        size="xs"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await otherSignerLink(id, signerId, false);
            if (!r.ok || !r.url) return void toast.error(r.ok ? "No link" : r.error);
            await navigator.clipboard.writeText(r.url).catch(() => {});
            toast.success("New signing link copied. The previous link no longer works.");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Copy />} Copy link
      </Button>
      <Button
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await otherSignerLink(id, signerId, true);
            if (r.ok) toast.success("Emailed a fresh link.");
            else toast.error(r.error);
          })
        }
      >
        <Mail /> Email
      </Button>
    </span>
  );
}
