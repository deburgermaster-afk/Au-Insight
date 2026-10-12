import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { type Cap, positionLabel } from "@/lib/permissions";
import { getCtx } from "@/lib/session";

const what: Record<Cap, string> = {
  immigration: "registered migration agents",
  education: "education agents and agents",
  billing: "accounts staff and agents",
  payroll: "HR and agency admins",
  team: "agency admins",
  reports: "agents and accounts",
  clients: "client-facing staff",
  mail: "staff with a mailbox",
  files: "staff",
};

/** Renders children only for people whose role includes [cap]. */
export async function Guard({ cap, children }: { cap: Cap; children: ReactNode }) {
  const ctx = await getCtx();
  if (ctx.caps.includes(cap)) return <>{children}</>;
  return (
    <Empty className="m-auto max-w-md rounded-xl border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Lock />
        </EmptyMedia>
        <EmptyTitle>Not available for your role</EmptyTitle>
        <EmptyDescription>
          This area is for {what[cap]}. You're signed in as {positionLabel(ctx.position)}. Ask an admin if you need access.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
