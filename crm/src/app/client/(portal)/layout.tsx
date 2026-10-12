import { and, eq, inArray } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PortalNav } from "@/components/portal/nav";
import { Skeleton } from "@/components/ui/skeleton";
import { db, schema as s } from "@/db";
import { requireClient } from "@/lib/client-auth";
import { initials } from "@/lib/format";

export const metadata: Metadata = { title: { template: "%s · Client portal", default: "Client portal" }, robots: { index: false, follow: false } };

async function Header() {
  const c = await requireClient();
  return (
    <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-12 max-w-2xl items-center gap-2.5 px-3">
        <Link href="/client" className="flex min-w-0 items-center gap-2">
          <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-orange-400 to-fuchsia-500 text-[11px] font-bold text-white">{initials(c.agency.name)}</span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] leading-tight font-semibold">{c.agency.name}</span>
            <span className="block truncate text-[10px] leading-tight text-muted-foreground">{c.profile?.marn ? `MARN ${c.profile.marn} · ` : ""}Client portal</span>
          </span>
        </Link>
        <Link href="/client/profile" className="ml-auto grid size-8 place-items-center rounded-full bg-muted text-[11px] font-semibold ring-1 ring-border" aria-label="My profile">
          {initials(`${c.client.firstName} ${c.client.lastName}`)}
        </Link>
      </div>
    </header>
  );
}

async function Nav() {
  const c = await requireClient();
  const owing = await db
    .select({ id: s.invoices.id })
    .from(s.invoices)
    .where(and(eq(s.invoices.agencyId, c.client.agencyId), eq(s.invoices.clientId, c.client.id), inArray(s.invoices.status, ["sent", "partial", "overdue"])));
  return <PortalNav due={owing.length} messages={0} />;
}

export default function PortalLayout({ children }: LayoutProps<"/client">) {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Suspense fallback={<div className="h-12 border-b" />}>
        <Header />
      </Suspense>
      <main className="mx-auto w-full max-w-2xl px-3 pt-3 pb-28">
        <Suspense
          fallback={
            <div className="grid gap-3">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-28 rounded-xl" />
              <Skeleton className="h-40 rounded-xl" />
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
      <Suspense>
        <Nav />
      </Suspense>
    </div>
  );
}
