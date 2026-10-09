"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { FolderIcon, LogOutIcon, MessageCircleIcon, ScaleIcon } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/app", label: "Ask", icon: MessageCircleIcon },
  { href: "/app/assess", label: "Assess", icon: ScaleIcon },
  { href: "/app/documents", label: "Documents", icon: FolderIcon },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const active = nav.findLast((n) => pathname === n.href || pathname.startsWith(n.href + "/"))?.href ?? "/app";

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <div className="flex h-dvh">
      {/* Desktop rail */}
      <aside className="hidden w-60 shrink-0 flex-col border-r px-3 py-5 md:flex">
        <div className="mb-6 flex items-center gap-2 px-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon.svg" alt="" className="size-7" />
          <span className="font-medium">Immi Insight</span>
        </div>
        <nav className="flex flex-col gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm">
              {active === n.href && <motion.span layoutId="rail" className="absolute inset-0 rounded-xl bg-muted" transition={spring.snappy} />}
              <n.icon className={cn("relative size-4", active === n.href ? "text-foreground" : "text-muted-foreground")} />
              <span className={cn("relative", active === n.href ? "text-foreground" : "text-muted-foreground")}>{n.label}</span>
            </Link>
          ))}
        </nav>
        <button onClick={signOut} className="mt-auto flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <LogOutIcon className="size-4" /> Sign out
        </button>
      </aside>

      <div className="relative flex min-w-0 flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="flex min-h-0 flex-1 flex-col"
          >
            {children}
          </motion.div>
        </AnimatePresence>

        {/* Mobile tab bar */}
        <nav className="pb-safe sticky bottom-0 z-20 flex justify-center px-4 pt-2 md:hidden">
          <div className="flex gap-1 rounded-full border bg-card/80 p-1 shadow-xl shadow-black/30 backdrop-blur-xl">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="relative flex items-center gap-2 rounded-full px-4 py-2.5 text-sm">
                {active === n.href && <motion.span layoutId="tab" className="absolute inset-0 rounded-full bg-foreground" transition={spring.snappy} />}
                <n.icon className={cn("relative size-4 transition-colors", active === n.href ? "text-background" : "text-muted-foreground")} />
                <span className={cn("relative transition-colors", active === n.href ? "text-background" : "text-muted-foreground")}>{n.label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>
    </div>
  );
}
