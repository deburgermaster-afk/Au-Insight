"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "./logo";
import { nav } from "./nav";

export function AppSidebar({ agency, user }: { agency: ReactNode; user: ReactNode }) {
  const { setOpenMobile } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/app" onClick={() => setOpenMobile(false)}>
                <Logo className="size-8 shrink-0" />
                <div className="grid min-w-0 leading-tight">
                  <span className="font-semibold tracking-tight">Lodgely</span>
                  <span className="truncate text-xs text-muted-foreground">{agency}</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup className="py-0">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="New client" className="bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground">
                <Link href="/app/clients/new" onClick={() => setOpenMobile(false)}>
                  <Plus />
                  <span>New client</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <Suspense fallback={<NavGroups path={null} />}>
          <ActiveNav />
        </Suspense>
      </SidebarContent>
      <SidebarFooter>{user}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveNav() {
  return <NavGroups path={usePathname()} />;
}

/** The nav links; [path] marks the active one (null while the URL streams in on dynamic routes). */
function NavGroups({ path }: { path: string | null }) {
  const { setOpenMobile } = useSidebar();
  const close = () => setOpenMobile(false);
  const active = (href: string) => path != null && (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`));
  return (
    <>
        {nav.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active(item.href)} tooltip={item.title}>
                    <Link href={item.href} onClick={close}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
