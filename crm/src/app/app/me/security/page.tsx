import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/app/skeletons";
import { TwoFactorCard } from "@/components/security/two-factor-card";
import { db, schema as s } from "@/db";
import { auth } from "@/lib/auth";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Security" };

async function Security() {
  await connection();
  const ctx = await getCtx();
  const session = await auth.api.getSession({ headers: await headers() });
  const [u] = await db.select({ on: s.user.twoFactorEnabled }).from(s.user).where(eq(s.user.id, ctx.userId));
  const [p] = await db.select({ required: s.agencyProfile.require2fa }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Security</h1>
        <p className="text-sm text-muted-foreground">How you sign in to {ctx.agencyName}. Signed in as {session?.user.email ?? ctx.email}.</p>
      </div>
      <TwoFactorCard enabled={Boolean(u?.on)} required={Boolean(p?.required)} />
    </div>
  );
}

export default function SecurityPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Security />
    </Suspense>
  );
}
