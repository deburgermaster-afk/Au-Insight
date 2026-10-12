import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SettingsSection } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

/** A settings page: back to the hub, the section's title, and its tabs as links (so each tab has a URL). */
export function SettingsShell({ section, tab, actions, children }: { section: SettingsSection; tab?: string; actions?: ReactNode; children: ReactNode }) {
  const Icon = section.icon;
  return (
    <div className="grid gap-5">
      <div className="grid gap-4 border-b pb-0">
        <div className="flex flex-wrap items-start gap-3">
          <Link href="/app/settings" className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="All settings">
            <ArrowLeft className="size-4" />
          </Link>
          <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br", section.tone)}>
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-semibold tracking-tight">{section.title}</h1>
            <p className="text-[13px] text-muted-foreground">{section.blurb}</p>
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {section.tabs?.length ? (
          <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label={`${section.title} sections`}>
            {section.tabs.map((t) => (
              <Link
                key={t.key}
                href={`/app/settings/${section.slug}?tab=${t.key}`}
                scroll={false}
                aria-current={t.key === tab ? "page" : undefined}
                className={cn("shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition", t.key === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
              >
                {t.label}
              </Link>
            ))}
          </nav>
        ) : (
          <div />
        )}
      </div>
      {children}
    </div>
  );
}
