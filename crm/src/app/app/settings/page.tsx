import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { ConnectToasts } from "@/components/settings/connect-toasts";
import { settingsSections } from "@/lib/settings-sections";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

/** A compact list of settings areas; details live inside each one. */
export default function SettingsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="team">
        <ConnectToasts />
        <div className="grid gap-4">
          <h1 className="text-lg font-semibold tracking-tight">Settings</h1>
          <nav className="grid gap-2 md:grid-cols-2">
            {settingsSections.map((s) => {
              const Icon = s.icon;
              return (
                <Link
                  key={s.slug}
                  href={s.href ?? `/app/settings/${s.slug}`}
                  className="group flex items-center gap-3 rounded-xl border bg-card px-3 py-2.5 transition hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg bg-gradient-to-br", s.tone)}>
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="truncate text-[12px] text-muted-foreground">{s.short}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </Link>
              );
            })}
          </nav>
        </div>
      </Guard>
    </Suspense>
  );
}
