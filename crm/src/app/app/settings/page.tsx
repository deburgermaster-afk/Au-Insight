import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageHeader } from "@/components/app/page-header";
import { PageSkeleton } from "@/components/app/skeletons";
import { getAgencyProfile } from "@/lib/data";
import { getCtx } from "@/lib/session";
import { AiMailCard } from "@/components/mail-ai/controls";
import { dmy } from "@/lib/format";
import { SettingsForm } from "./settings-form";

export const metadata = { title: "Settings" };

async function Form() {
  await connection();
  const [profile, ctx] = await Promise.all([getAgencyProfile(), getCtx()]);
  return (
    <div className="grid gap-4">
      <AiMailCard on={Boolean(profile?.aiMailEnabledAt)} by={profile?.aiMailEnabledBy ?? null} at={profile?.aiMailEnabledAt ? dmy(profile.aiMailEnabledAt) : null} available={Boolean(process.env.LLM_API_KEY)} />
      <SettingsForm profile={profile} slug={ctx.agencySlug} mailDomain={process.env.MAIL_FROM_DOMAIN ?? null} />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings & subscription" description="Upgrade, manage your agency details, email and appearance." />
      <Suspense fallback={<PageSkeleton />}>
        <Guard cap="team"><Form /></Guard>
      </Suspense>
    </div>
  );
}
