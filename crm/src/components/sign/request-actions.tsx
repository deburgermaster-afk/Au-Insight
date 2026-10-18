"use client";

import { BellRing, Loader2, MoreHorizontal, XCircle } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { remindSignRequest, voidSignRequest } from "@/lib/sign-actions";

/** Remind or withdraw an open signature request; discard a draft. */
export function SignRequestActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (status === "signed" || status === "void") return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Actions">
          {pending ? <Loader2 className="animate-spin" /> : <MoreHorizontal />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {status !== "draft" ? (
          <DropdownMenuItem onClick={() => start(async () => { const r = await remindSignRequest(id); if (r.ok) toast.success("Reminder sent."); else toast.error(r.error); })}>
            <BellRing /> Send a reminder
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem className="text-rose-600" onClick={() => start(async () => { const r = await voidSignRequest(id); if (r.ok) toast.success(status === "draft" ? "Draft discarded." : "Request withdrawn."); else toast.error(r.error); })}>
          <XCircle /> {status === "draft" ? "Discard draft" : "Withdraw"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
