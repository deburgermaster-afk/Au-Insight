import { Bell, HelpCircle } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AppSidebar } from "@/components/app/app-sidebar";
import { CommandMenu } from "@/components/app/command-menu";
import { UserMenu } from "@/components/app/user-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { getCtx } from "@/lib/session";

// The chrome is static and prerenders; only the agency name and the user menu read the session,
// each behind its own boundary, so navigation never waits on it.

async function AgencyName() {
  const ctx = await getCtx();
  return <>{ctx.agencyName}</>;
}

async function UserChip() {
  const ctx = await getCtx();
  return <UserMenu name={ctx.name} email={ctx.email} role={ctx.role} />;
}

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <SidebarProvider>
      <AppSidebar
        agency={
          <Suspense fallback={<span className="inline-block h-3 w-24 animate-pulse rounded bg-muted" />}>
            <AgencyName />
          </Suspense>
        }
        user={
          <Suspense fallback={<Skeleton className="h-12 w-full rounded-lg" />}>
            <UserChip />
          </Suspense>
        }
      />
      <SidebarInset className="min-w-0">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 rounded-t-xl border-b bg-background/80 px-3 backdrop-blur-md sm:px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-1 h-5" />
          <CommandMenu />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" className="rounded-full" asChild>
              <Link href="/app/features" aria-label="What's new">
                <HelpCircle />
              </Link>
            </Button>
            <Button variant="ghost" size="icon" className="relative rounded-full" asChild>
              <Link href="/app/inbox" aria-label="Inbox">
                <Bell />
                <span className="absolute right-2 top-2 size-2 rounded-full bg-primary ring-2 ring-background" />
              </Link>
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
