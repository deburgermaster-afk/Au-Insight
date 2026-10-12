import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { positions } from "@/lib/permissions";
import { AcceptInvite } from "./accept";

export const metadata = { title: "Join your agency" };

async function Invite({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [row] = await db
    .select({ inv: s.invitation, agency: s.organization.name, inviter: s.user.name, position: s.invitePositions.position })
    .from(s.invitation)
    .innerJoin(s.organization, eq(s.organization.id, s.invitation.organizationId))
    .innerJoin(s.user, eq(s.user.id, s.invitation.inviterId))
    .leftJoin(s.invitePositions, eq(s.invitePositions.invitationId, s.invitation.id))
    .where(eq(s.invitation.id, id));
  const valid = row && row.inv.status === "pending" && row.inv.expiresAt > new Date();
  if (!valid) {
    return (
      <div className="text-center">
        <h1 className="text-xl font-semibold text-white">{row?.inv.status === "accepted" ? "Invitation already used" : "Invitation not valid"}</h1>
        <p className="mt-2 text-[13px] text-white/55">{row?.inv.status === "accepted" ? "You've already joined. Sign in to continue." : "It may have expired or been cancelled. Ask your agency for a new one."}</p>
        <Link href="/sign-in" className="mt-6 inline-block text-sm text-white underline underline-offset-4">
          Sign in
        </Link>
      </div>
    );
  }
  const session = await auth.api.getSession({ headers: await headers() });
  const pos = positions.find((p) => p.key === row.position);
  return (
    <AcceptInvite
      id={id}
      email={row.inv.email}
      agency={row.agency}
      inviter={row.inviter}
      position={pos?.label ?? null}
      about={pos?.about ?? null}
      signedInAs={session?.user.email ?? null}
    />
  );
}

export default function Page({ params }: PageProps<"/invite/[id]">) {
  return (
    <Suspense>
      <Invite params={params} />
    </Suspense>
  );
}
