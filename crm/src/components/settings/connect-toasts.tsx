"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { toast } from "sonner";

const names: Record<string, string> = { resend: "Resend", google: "Gmail", microsoft: "Outlook" };
const errors: Record<string, string> = {
  not_configured: "Gmail/Outlook sign-in isn't set up for this workspace yet. The Google or Microsoft app credentials need adding on the server.",
  expired: "That sign-in took too long or was opened in another browser. Try connecting again.",
  cancelled: "Connection cancelled. Nothing was changed.",
  access_denied: "Access wasn't granted, so nothing was connected.",
  admin_only: "Only owners and admins can connect agency-wide apps.",
  failed: "Couldn't finish connecting. Try again.",
};

function Toasts() {
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  useEffect(() => {
    const ok = params.get("connected");
    const err = params.get("connect_error");
    const domain = params.get("domain");
    if (!ok && !err) return;
    if (ok) toast.success(names[ok] ? `${names[ok]} connected` : `Connected ${ok}`, { description: ok === "resend" ? (domain ? `Picked up ${domain} from your Resend account.` : "Mail on your domain now sends from your own Resend plan.") : names[ok] ? undefined : "Recent mail is syncing now." });
    if (err) toast.error(errors[err] ?? `Couldn't connect (${err}).`);
    const keep = new URLSearchParams(params);
    ["connected", "connect_error", "domain"].forEach((k) => keep.delete(k));
    router.replace(keep.size ? `${path}?${keep}` : path, { scroll: false });
  }, [params, router, path]);
  return null;
}

/** Shows the result of an OAuth round trip once, then tidies the URL. */
export function ConnectToasts() {
  return (
    <Suspense>
      <Toasts />
    </Suspense>
  );
}
