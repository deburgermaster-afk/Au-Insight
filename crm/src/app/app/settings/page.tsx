import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { Mark } from "@/components/settings/marks";
import { UsageBars } from "@/components/settings/usage-meter";
import { ConnectToasts } from "@/components/settings/connect-toasts";
import { getSettings } from "@/lib/data";
import { llmEnabled } from "@/lib/llm";
import { usageFor } from "@/lib/mail-usage";
import { getCtx } from "@/lib/session";
import { settingsSections } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

const Chip = ({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "ok" | "warn" | "bad" }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]",
      tone === "ok" && "bg-emerald-500/12 text-emerald-500",
      tone === "warn" && "bg-amber-500/12 text-amber-500",
      tone === "bad" && "bg-rose-500/12 text-rose-500",
      tone === "muted" && "bg-muted text-muted-foreground",
    )}
  >
    {children}
  </span>
);

async function Hub() {
  await connection();
  const [ctx, st] = await Promise.all([getCtx(), getSettings()]);
  const usage = await usageFor(ctx.agencyId);
  const p = st.profile;
  const mine = st.connections.filter((c) => c.userId === ctx.userId);
  const connectedCount = (st.resend ? 1 : 0) + mine.length;
  const missing = [!p?.legalName && "legal name", !p?.abn && "ABN", !p?.marn && "MARN", !p?.bankAccount && "trust account"].filter(Boolean) as string[];

  const status: Record<string, ReactNode> = {
    agency: missing.length ? <Chip tone="warn">Add {missing.slice(0, 2).join(" and ")}{missing.length > 2 ? ` +${missing.length - 2}` : ""}</Chip> : <Chip tone="ok">Complete</Chip>,
    email: (
      <div className="grid w-full gap-2">
        <div className="flex flex-wrap gap-1.5">
          {p?.mailDomain ? <Chip tone={p.mailDomainStatus === "verified" ? "ok" : "warn"}>{p.mailDomain} · {(p.mailDomainStatus ?? "pending").replace(/_/g, " ")}</Chip> : <Chip>Shared Lodgely domain</Chip>}
          <Chip>{usage.source === "resend" ? `Your Resend${usage.plan === "free" ? " (free plan)" : ""}` : "Lodgely sending"}</Chip>
        </div>
        <UsageBars usage={usage.usage} compact />
      </div>
    ),
    connectors: (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          {st.resend ? <Mark kind="resend" size="sm" className="ring-2 ring-card" /> : null}
          {mine.map((c) => (
            <Mark key={c.id} kind={c.provider} size="sm" className="ring-2 ring-card" />
          ))}
          <Mark kind="xkiro" size="sm" className="ring-2 ring-card" />
        </div>
        <Chip tone={connectedCount ? "ok" : "muted"}>{connectedCount ? `${connectedCount} connected` : "Nothing connected yet"}</Chip>
      </div>
    ),
    ai: p?.aiMailEnabledAt ? <Chip tone="ok">Mail assistant on</Chip> : <Chip>{llmEnabled() ? "Mail assistant off" : "AI not configured"}</Chip>,
    plans: <Chip>Beta: everything unlocked</Chip>,
    appearance: <Chip>Light · Dark · System</Chip>,
    team: <Chip>{st.members} {st.members === 1 ? "member" : "members"}</Chip>,
    audit: <Chip>Owners and admins</Chip>,
  };

  return (
    <div className="grid gap-5">
      <ConnectToasts />
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground">Everything about how {ctx.agencyName} runs on Lodgely. Pick an area to open it.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {settingsSections.map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.slug}
              href={s.href ?? `/app/settings/${s.slug}`}
              className="group flex min-h-36 flex-col gap-3 rounded-2xl border bg-card p-4 transition hover:border-foreground/20 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <div className="flex items-start gap-3">
                <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br", s.tone)}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{s.title}</p>
                  <p className="text-[13px] leading-snug text-muted-foreground">{s.blurb}</p>
                </div>
                <ChevronRight className="mt-1 size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
              </div>
              <div className="mt-auto flex min-h-6 items-end">{status[s.slug]}</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="team">
        <Hub />
      </Guard>
    </Suspense>
  );
}
