"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, use } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";
import { Logo } from "./logo";
import { nav } from "./nav";
import type { Cap } from "@/lib/permissions";

type Counts = Record<string, number>;
type NavData = { counts: Counts; caps: Cap[] };

export function AppSidebar({ agency, user, nav: data }: { agency: ReactNode; user: ReactNode; nav: Promise<NavData> }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="inset" className="border-none">
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex items-center gap-2 px-1">
          <Link href="/app" onClick={() => setOpenMobile(false)} className="flex min-w-0 flex-1 items-center gap-2.5">
            <Logo className="size-7 shrink-0" />
            <span className="truncate text-sm font-semibold tracking-tight text-sidebar-accent-foreground group-data-[collapsible=icon]:hidden">{agency}</span>
          </Link>
          <SidebarTrigger className="size-7 rounded-md border border-sidebar-border text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </div>
        <CommandMenu />
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <Suspense fallback={<NavGroups path={null} counts={{}} caps={null} />}>
          <ActiveNav data={data} />
        </Suspense>
      </SidebarContent>
      <SidebarFooter className="gap-1">
        <div className="border-t border-sidebar-border pt-2">{user}</div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNav({ data }: { data: Promise<NavData> }) {
  const d = use(data);
  return <NavGroups path={usePathname()} counts={d.counts} caps={d.caps} />;
}

/** The nav links; [path] marks the active one (null while the URL streams in on dynamic routes). */
function NavGroups({ path, counts, caps }: { path: string | null; counts: Counts; caps: Cap[] | null }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const active = (href: string) => path != null && (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));
  return (
    <>
      {nav
        .map((g) => ({ ...g, items: g.items.filter((i) => !i.cap || Boolean(caps?.includes(i.cap))) }))
        .filter((g) => g.items.length)
        .map((group, gi) => (
        <SidebarGroup key={group.label} className={gi ? "border-t border-sidebar-border" : undefined}>
          <SidebarGroupLabel className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">{group.label}</SidebarGroupLabel>
          {group.label === "Practice" ? (
            <SidebarGroupAction asChild title="New client">
              <Link href="/app/clients/new" onClick={close}>
                <Plus />
              </Link>
            </SidebarGroupAction>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active(item.href)}
                    tooltip={item.title}
                    className="h-8 text-[13px] text-sidebar-foreground/85 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_var(--sidebar-border)]"
                  >
                    <Link href={item.href} onClick={close}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                  {counts[item.href] ? <SidebarMenuBadge className="text-[11px] font-normal tabular-nums text-muted-foreground">{counts[item.href]}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
