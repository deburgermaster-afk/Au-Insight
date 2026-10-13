import { ArrowRightLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { connection } from "next/server";
import { BadgeCheck, CircleAlert, Mail, ShieldCheck } from "lucide-react";
import { Suspense } from "react";
import { label, Pill, type Tone } from "@/components/app/badges";
import { FadeIn, ProgressBar, Stagger, StaggerItem } from "@/components/app/motion";
import { HeaderActions } from "@/components/app/header-actions";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { initials } from "@/lib/format";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { listTeam } from "@/lib/data";
import { dmy } from "@/lib/format";
import { marnCurrent, positionLabel, positions } from "@/lib/permissions";
import { canAtLeast, getCtx } from "@/lib/session";
import { CancelInvite, InviteDialog, RoleSelect } from "./team-client";

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
  await connection();
  const [{ members, invitations }, ctx] = await Promise.all([listTeam(), getCtx()]);
  const canEdit = canAtLeast(ctx.role, "admin");
  const max = Math.max(1, ...members.map((m) => m.openMatters));
  const tiers = order.map((r) => ({ role: r, people: members.filter((m) => m.role === r) })).filter((t) => t.people.length);
  return (
    <div className="grid gap-3">
      {canEdit ? (
        <HeaderActions>
          <Button size="sm" variant="outline" asChild>
            <Link href="/app/team/handover">
              <ArrowRightLeft /> Handover & swaps
            </Link>
          </Button>
          <InviteDialog />
        </HeaderActions>
      ) : null}
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
                        {positionLabel(m.position ?? "consultant")}
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
      <Section title={`Members · ${members.length}`} bodyClassName="p-0 sm:p-0">
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
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                    <span>{m.title ?? positionLabel(m.position ?? "consultant")}</span>
                    {m.position === "principal" || m.position === "migration_agent" ? (
                      marnCurrent(m.marn, m.marnExpiry) ? (
                        <span className="inline-flex items-center gap-1 text-sky-500">
                          <BadgeCheck className="size-3" /> MARN {m.marn}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-rose-500">
                          <CircleAlert className="size-3" /> {m.marn ? "MARN expired" : "No MARN"}
                        </span>
                      )
                    ) : m.qeac ? (
                      <span className="text-muted-foreground">QEAC {m.qeac}</span>
                    ) : null}
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
              <div key={i.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">
                  {i.email} · {positionLabel(i.position ?? i.role ?? "agent")} · expires {dmy(i.expiresAt)}
                </span>
                {canEdit ? <CancelInvite id={i.id} /> : null}
              </div>
            ))}
          </div>
        ) : null}
      </Section>
      <Section title="Positions and what they can do">
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {positions.map((p) => (
            <li key={p.key} className="flex gap-3 rounded-xl border p-3">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">{p.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.about}</p>
                <p className="mt-1.5 text-xs text-muted-foreground">{members.filter((m) => (m.position ?? "consultant") === p.key).length} on the team</p>
              </div>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Login levels">
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
    <Suspense fallback={<PageSkeleton />}>
      <Team />
    </Suspense>
  );
}
