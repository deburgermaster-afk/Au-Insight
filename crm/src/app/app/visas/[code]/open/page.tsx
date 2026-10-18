import { and, asc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { db, schema as s } from "@/db";
import { agencyTemplates } from "@/lib/agency-templates";
import { listOccupations } from "@/lib/occupations";
import { marnCurrent } from "@/lib/permissions";
import { liveProcessing } from "@/lib/processing-times";
import { getCtx } from "@/lib/session";
import { visaByCode } from "@/lib/visas";
import { checklistFor, feesFor } from "@/lib/workflow";
import { workflowFor } from "@/lib/workflow-server";
import { OpenFileWizard } from "./wizard";

export const metadata = { title: "Open a file" };

const PACK = ["privacy", "authority-to-act", "consumer-guide", "electronic-communication"];

async function Wizard({ params, searchParams }: PageProps<"/app/visas/[code]/open">) {
  await connection();
  const [{ code: raw }, sp, ctx] = await Promise.all([params, searchParams, getCtx()]);
  const visa = visaByCode(decodeURIComponent(raw));
  if (!visa) notFound();
  const [wf, clients, deps, staff, employers, templates, live, occupations] = await Promise.all([
    workflowFor(ctx.agencyId),
    db.select().from(s.clients).where(eq(s.clients.agencyId, ctx.agencyId)).orderBy(asc(s.clients.firstName)).limit(2000),
    db.select({ id: s.dependants.id, clientId: s.dependants.clientId, fullName: s.dependants.fullName, relationship: s.dependants.relationship }).from(s.dependants).where(eq(s.dependants.agencyId, ctx.agencyId)),
    db
      .select({ id: s.user.id, name: s.user.name, role: s.member.role, position: s.staffProfiles.position, marn: s.staffProfiles.marn, marnExpiry: s.staffProfiles.marnExpiry })
      .from(s.member)
      .innerJoin(s.user, eq(s.user.id, s.member.userId))
      .leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.member.userId), eq(s.staffProfiles.agencyId, s.member.organizationId)))
      .where(eq(s.member.organizationId, ctx.agencyId)),
    db.select({ id: s.employers.id, name: s.employers.name }).from(s.employers).where(eq(s.employers.agencyId, ctx.agencyId)).orderBy(asc(s.employers.name)),
    agencyTemplates(ctx.agencyId),
    liveProcessing(visa.code).catch(() => null),
    ["Skilled", "Employer", "Graduate"].includes(visa.category) ? listOccupations().catch(() => []) : Promise.resolve([]),
  ]);
  const fees = feesFor(wf, visa.code);
  // Consent forms: the new-client pack plus any template meant for this visa.
  const suggested = templates.filter((t) => PACK.includes(t.key) || t.suggestFor?.includes(visa.code)).map((t) => t.key);
  const pre = typeof sp.client === "string" ? sp.client : null;
  return (
    <OpenFileWizard
      visa={{ code: visa.code, name: visa.name, category: visa.category, streams: visa.streams ?? [], summary: visa.summary, permanent: visa.permanent }}
      clients={clients.map((c) => ({
        id: c.id,
        name: `${c.firstName} ${c.lastName}`,
        email: c.email,
        phone: c.phone,
        dateOfBirth: c.dateOfBirth,
        nationality: c.nationality,
        onshore: c.onshore,
        currentVisa: c.currentVisa,
        visaExpiry: c.visaExpiry,
        conditions: c.visaConditions ?? [],
        englishTest: c.englishTest,
        englishScore: c.englishScore,
        occupation: c.occupation,
        anzsco: c.anzsco,
        dependants: deps.filter((d) => d.clientId === c.id).map((d) => ({ id: d.id, fullName: d.fullName, relationship: d.relationship })),
      }))}
      staff={staff.map((m) => ({ id: m.id, name: m.name, registered: (m.position === "principal" || m.position === "migration_agent") && marnCurrent(m.marn, m.marnExpiry), marn: m.marn }))}
      employers={employers}
      checklist={checklistFor(wf, visa.code).items.map((i) => ({ category: i.category, label: i.label, required: i.required !== false }))}
      fees={{ professional: fees?.professional ?? null, government: fees?.government ?? null }}
      templates={templates.map((t) => ({ key: t.key, title: t.title, group: t.group, summary: t.summary }))}
      suggested={suggested}
      live={live ? { p50Months: live.p50Months, p90Months: live.p90Months, p50: live.p50, p90: live.p90 } : null}
      occupations={occupations.map((o) => ({ title: o.title, anzsco: o.anzsco, lists: o.lists ?? [] }))}
      me={ctx.userId}
      preselect={pre}
    />
  );
}

export default function OpenFilePage(props: PageProps<"/app/visas/[code]/open">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Wizard {...props} />
      </Guard>
    </Suspense>
  );
}
