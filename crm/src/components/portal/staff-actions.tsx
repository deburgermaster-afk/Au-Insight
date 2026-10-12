"use client";

import { ExternalLink, Loader2, Smartphone } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { inviteClientToPortal, viewAsClient } from "@/lib/client-actions";

/** Staff controls for a client's portal: invite by email, or preview it as them. */
export function PortalMenu({ clientId, enabled, hasEmail }: { clientId: string; enabled: boolean; hasEmail: boolean }) {
  const [pending, start] = useTransition();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Smartphone />} Portal{enabled ? "" : " (off)"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">{enabled ? "Client portal is on" : "Client portal is off"}</DropdownMenuLabel>
        <DropdownMenuItem
          disabled={!hasEmail}
          onClick={() =>
            start(async () => {
              const r = await inviteClientToPortal(clientId);
              if (!r.ok) toast.error(r.error);
              else toast.success(r.id === "sent" ? "Portal invite emailed" : "Portal turned on (email not sent for test addresses)");
            })
          }
        >
          {enabled ? "Email a new sign-in link" : "Turn on and email invite"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            start(async () => {
              const r = await viewAsClient(clientId);
              if (!r.ok || !r.id) return void toast.error(r.ok ? "Couldn't open" : r.error);
              window.open(r.id, "_blank", "noopener");
            })
          }
        >
          <ExternalLink /> View as client
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
