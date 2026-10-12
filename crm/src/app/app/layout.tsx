import { Bell, Mail } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { Crumbs } from "@/components/app/crumbs";
import { UserMenu } from "@/components/app/user-menu";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getNavData } from "@/lib/data";
import { getCtx } from "@/lib/session";

// The chrome is static and prerenders; the agency name, user menu and nav counts read the session,
// each behind its own boundary, so navigation never waits on them.

async function AgencyName() {
  const ctx = await getCtx();
  return <>{ctx.agencyName}</>;
}

async function UserChip() {
  const ctx = await getCtx();
  return <UserMenu name={ctx.name} email={ctx.email} role={ctx.role} />;
}

const agency = (
  <Suspense fallback={<span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" />}>
    <AgencyName />
  </Suspense>
);

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <SidebarProvider>
      <AppSidebar
        agency={agency}
        nav={getNavData()}
        user={
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-lg" />}>
            <UserChip />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0 border md:peer-data-[variant=inset]:shadow-none">
        <header className="sticky top-0 z-20 flex h-13 items-center gap-2 rounded-t-xl border-b bg-background/85 px-3 backdrop-blur-md sm:px-5">
          <SidebarTrigger className="-ml-1 md:hidden" />
          <Crumbs agency={agency} />
          <div id="header-actions" className="ml-auto flex min-w-0 items-center gap-1.5 overflow-x-auto [&_button]:shrink-0" />
          <div className="flex shrink-0 items-center gap-1.5 border-l pl-2">
            <Link href="/app/inbox" aria-label="Inbox" className="grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground transition hover:text-foreground">
              <Mail className="size-4" />
            </Link>
            <Link href="/app/tasks" aria-label="Notifications" className="relative grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground transition hover:text-foreground">
              <Bell className="size-4" />
              <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-[var(--chart-2)]" />
            </Link>
          </div>
        </header>
        <main className="flex w-full min-w-0 flex-1 flex-col p-3">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
