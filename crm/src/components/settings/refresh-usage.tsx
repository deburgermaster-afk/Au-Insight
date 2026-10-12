"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshUsage } from "@/lib/connector-actions";

export function RefreshUsage() {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Button
      size="sm"
      variant="outline"
      className="rounded-full"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshUsage();
          if (!r.ok) toast.error(r.error);
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Refresh
    </Button>
  );
}
