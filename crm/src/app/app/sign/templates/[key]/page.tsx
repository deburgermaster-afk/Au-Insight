import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { TemplateEditor } from "@/components/sign/template-editor";
import { agencyTemplates } from "@/lib/agency-templates";
import { consentByKey } from "@/lib/consent-templates";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Edit consent template" };

async function Editor({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  await connection();
  const ctx = await getCtx();
  if (!["admin", "owner"].includes(ctx.role)) return <p className="rounded-xl border p-6 text-sm text-muted-foreground">Only agency admins can edit consent templates.</p>;
  const all = await agencyTemplates(ctx.agencyId, { includeDisabled: true });
  const t = key === "new" ? null : all.find((x) => x.key === key);
  if (key !== "new" && !t) notFound();
  return <TemplateEditor templateKey={key} initial={t ?? null} original={t && !t.custom ? (consentByKey(key) ?? null) : null} />;
}

export default function TemplatePage({ params }: PageProps<"/app/sign/templates/[key]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Editor params={params} />
      </Guard>
    </Suspense>
  );
}
