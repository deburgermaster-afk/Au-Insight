import { and, desc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { StaffWelcome } from "@/components/onboarding/staff-welcome";
import { db, schema as s } from "@/db";
import { ensureMailboxes } from "@/lib/mail";
import { positions } from "@/lib/permissions";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Welcome", robots: { index: false } };

async function Welcome() {
  const ctx = await getCtx();
  const [[p], [brand], [inv], boxes] = await Promise.all([
    db.select().from(s.staffProfiles).where(and(eq(s.staffProfiles.agencyId, ctx.agencyId), eq(s.staffProfiles.userId, ctx.userId))),
    db.select({ color: s.agencyProfile.brandColor }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId)),
    db
      .select({ inviter: s.user.name })
      .from(s.invitation)
      .innerJoin(s.user, eq(s.user.id, s.invitation.inviterId))
      .where(and(eq(s.invitation.organizationId, ctx.agencyId), eq(s.invitation.email, ctx.email.toLowerCase()), eq(s.invitation.status, "accepted")))
      .orderBy(desc(s.invitation.createdAt))
      .limit(1),
    ensureMailboxes(ctx).catch(() => []),
  ]);
  const pos = positions.find((x) => x.key === ctx.position);
  return (
    <StaffWelcome
      org={ctx.agencyName}
      inviter={inv?.inviter ?? null}
      name={ctx.name}
      position={ctx.position}
      positionLabel={pos?.label ?? ctx.position}
      about={pos?.about ?? ""}
      caps={ctx.caps}
      brand={brand?.color ?? null}
      mailbox={boxes.find((b) => b.userId === ctx.userId)?.address ?? null}
      profile={{
        title: p?.title ?? null,
        phone: p?.phone ?? null,
        emergencyName: p?.emergencyName ?? null,
        emergencyPhone: p?.emergencyPhone ?? null,
        marn: p?.marn ?? null,
        marnExpiry: p?.marnExpiry ?? null,
        qeac: p?.qeac ?? null,
        bankBsb: p?.bankBsb ?? null,
        bankAccount: p?.bankAccount ?? null,
        superFund: p?.superFund ?? null,
        taxFreeThreshold: p?.taxFreeThreshold ?? true,
      }}
    />
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-black" />}>
      <Welcome />
    </Suspense>
  );
}
