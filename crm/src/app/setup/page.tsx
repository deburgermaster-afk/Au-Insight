import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AgencySetup } from "@/components/onboarding/agency-setup";
import { db, schema as s } from "@/db";
import { ensureMailboxes } from "@/lib/mail";
import { canAtLeast, getCtx } from "@/lib/session";

export const metadata = { title: "Set up your agency", robots: { index: false } };

async function Setup() {
  const ctx = await getCtx();
  if (!canAtLeast(ctx.role, "admin")) redirect("/welcome");
  const [[profile], [me], boxes] = await Promise.all([
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId)),
    db.select({ marnExpiry: s.staffProfiles.marnExpiry }).from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, ctx.userId))),
    ensureMailboxes(ctx).catch(() => []),
  ]);
  return <AgencySetup org={ctx.agencyName} firstName={ctx.name.split(" ")[0]} profile={profile ?? null} marnExpiry={me?.marnExpiry ?? null} mailboxes={boxes.filter((b) => b.kind === "shared" || b.userId === ctx.userId).map((b) => ({ address: b.address, kind: b.kind }))} />;
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-black" />}>
      <Setup />
    </Suspense>
  );
}
