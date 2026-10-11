import { Mail, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { label, Pill, type Tone } from "@/components/app/badges";
import { FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/app/motion";
import { PageHeader } from "@/components/app/page-header";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listTeam } from "@/lib/data";
import { dmy } from "@/lib/format";
import { canAtLeast, getCtx } from "@/lib/session";
import { InviteDialog, RoleSelect } from "./team-client";

export const metadata = { title: "Team" };

const order = ["owner", "admin", "supervisor", "agent", "staff", "client"];
const roleTone: Record<string, Tone> = { owner: "violet", admin: "pink", supervisor: "blue", agent: "green", staff: "amber", client: "gray" };
const roleInfo: Record<string, string> = {
  owner: "Everything, including billing and deleting the agency",
  admin: "Manage staff, roles, settings and all records",
  supervisor: "Oversee agents, review matters before lodgement",
  agent: "Registered agents: advise clients, run matters, invoice",
  staff: "Reception and admin: clients, bookings, documents, mail",
  client: "Portal access to their own matters and documents",
};

async function Team() {
  const [{ members, invitations }, ctx] = await Promise.all([listTeam(), getCtx()]);
  const canEdit = canAtLeast(ctx.role, "admin");
  const max = Math.max(1, ...members.map((m) => m.openMatters));
  const tiers = order.map((r) => ({ role: r, people: members.filter((m) => m.role === r) })).filter((t) => t.people.length);
  return (
    <div className="grid gap-6">
      <FadeIn>
        <Section title="Organisation">
          <div className="grid gap-3">
            {tiers.map((t, i) => (
              <div key={t.role} className="grid gap-2">
                <div className="flex flex-wrap justify-center gap-2">
                  {t.people.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-full border bg-background py-1 pl-1 pr-3 shadow-xs">
                      <Avatar className="size-7">
                        <AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{initials(m.name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm font-medium">{m.name}</span>
                      <Pill t={roleTone[m.role]} className="h-5 px-1.5 text-[10px]">
                        {label(m.role)}
                      </Pill>
                    </div>
                  ))}
                </div>
                {i < tiers.length - 1 ? <div className="mx-auto h-4 w-px bg-border" /> : null}
              </div>
            ))}
          </div>
        </Section>
      </FadeIn>
      <Section title={`Members · ${members.length}`} action={canEdit ? <InviteDialog agencyId={ctx.agencyId} /> : null} bodyClassName="p-0 sm:p-0">
        <Stagger>
          {members.map((m) => (
            <StaggerItem key={m.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0 sm:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_8rem] sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-9">
                  <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(m.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.name} {m.userId === ctx.userId ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                  </p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Mail className="size-3" /> {m.email}
                  </p>
                </div>
              </div>
              <div className="col-span-2 row-start-2 flex items-center gap-2 sm:col-span-1 sm:row-start-auto">
                <ProgressBar value={m.openMatters / max} />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{m.openMatters} open</span>
              </div>
              <div className="justify-self-end">
                <RoleSelect memberId={m.id} role={m.role} canEdit={canEdit && m.userId !== ctx.userId} />
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        {invitations.length ? (
          <div className="border-t bg-muted/30 px-4 py-3 sm:px-5">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Pending invitations</p>
            {invitations.map((i) => (
              <p key={i.id} className="text-sm">
                {i.email} · {label(i.role ?? "agent")} · expires {dmy(i.expiresAt)}
              </p>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Roles">
        <ul className="grid gap-3 sm:grid-cols-2">
          {order.map((r) => (
            <li key={r} className="flex gap-3 rounded-xl border p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <Pill t={roleTone[r]}>{label(r)}</Pill>
                <p className="mt-1.5 text-sm text-muted-foreground">{roleInfo[r]}</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

export default function TeamPage() {
  return (
    <>
      <PageHeader title="Team" description="Your agency from owner to reception: roles, workload and who reports where." />
      <Suspense fallback={<PageSkeleton />}>
        <Team />
      </Suspense>
    </>
  );
}
