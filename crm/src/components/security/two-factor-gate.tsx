"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/** When the agency requires two-factor and this person hasn't set it up, keep them on the Security page. */
export function TwoFactorGate({ mustSetUp }: { mustSetUp: boolean }) {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (mustSetUp && !path.startsWith("/app/me/security")) router.replace("/app/me/security");
  }, [mustSetUp, path, router]);
  return null;
}
