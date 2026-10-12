"use client";

import { Briefcase, FolderOpen, House, MessageSquare, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/client", label: "Home", icon: House },
  { href: "/client/cases", label: "Cases", icon: Briefcase },
  { href: "/client/documents", label: "Files", icon: FolderOpen },
  { href: "/client/payments", label: "Pay", icon: Wallet },
  { href: "/client/messages", label: "Messages", icon: MessageSquare },
];

/** Bottom tab bar: thumb-reachable on phones, a floating pill on larger screens. */
export function PortalNav({ due, messages }: { due: number; messages: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl sm:bottom-4 sm:mx-auto sm:max-w-md sm:rounded-2xl sm:border sm:pb-0 sm:shadow-2xl">
      <ul className="grid grid-cols-5">
        {tabs.map((t) => {
          const active = t.href === "/client" ? path === "/client" : path.startsWith(t.href);
          const badge = t.href === "/client/payments" ? due : t.href === "/client/messages" ? messages : 0;
          return (
            <li key={t.href}>
              <Link href={t.href} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition", active ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
                <span className={cn("grid h-7 w-12 place-items-center rounded-full transition", active && "bg-muted")}>
                  <t.icon className="size-[18px]" strokeWidth={active ? 2.2 : 1.8} />
                </span>
                {t.label}
                {badge ? <span className="absolute top-1 left-1/2 ml-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">{badge}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
