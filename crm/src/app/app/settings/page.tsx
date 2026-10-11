import { connection } from "next/server";
import { Suspense } from "react";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { getAgencyProfile } from "@/lib/data";
import { getCtx } from "@/lib/session";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

async function Form() {
  await connection();
  const [profile, ctx] = await Promise.all([getAgencyProfile(), getCtx()]);
  return <SettingsForm profile={profile} slug={ctx.agencySlug} mailDomain={process.env.MAIL_FROM_DOMAIN ?? null} />;
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Settings" description="Your agency's registration, invoicing and appearance." />
      <Suspense fallback={<PageSkeleton />}>
        <Form />
      </Suspense>
    </div>
  );
}
