"use client";

import { CalendarPlus, FilePlus2, Moon, Search, Sun, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import { visas } from "@/lib/visas";
import { nav } from "./nav";

/** ⌘K: jump anywhere, create anything, look up a visa. */
export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-sidebar-border bg-sidebar-accent/40 px-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate text-left group-data-[collapsible=icon]:hidden">Search</span>
        <Kbd className="bg-transparent text-[11px] group-data-[collapsible=icon]:hidden">⌘K</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Lodgely">
        <Command className="rounded-xl">
        <CommandInput placeholder="Type a page, an action or a visa subclass…" />
        <CommandList>
          <CommandEmpty>Nothing found.</CommandEmpty>
          <CommandGroup heading="Create">
            <CommandItem onSelect={() => go("/app/clients/new")}>
              <UserPlus /> New client <CommandShortcut>C</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/app/matters?new=1")}>
              <FilePlus2 /> New matter <CommandShortcut>M</CommandShortcut>
            </CommandItem>
            <CommandItem onSelect={() => go("/app/calendar?new=1")}>
              <CalendarPlus /> Book appointment
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
          {nav.map((g) => (
            <CommandGroup key={g.label} heading={g.label}>
              {g.items.map((i) => (
                <CommandItem key={i.href} value={`${i.title} ${i.keywords ?? ""}`} onSelect={() => go(i.href)}>
                  <i.icon /> {i.title}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
          <CommandSeparator />
          <CommandGroup heading="Visa library">
            {visas.map((v) => (
              <CommandItem key={v.code} value={`${v.code} ${v.name} ${v.category}`} onSelect={() => go(`/app/visas/${encodeURIComponent(v.code)}`)}>
                <span className="w-14 font-mono text-xs text-muted-foreground">{v.code}</span> {v.name}
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Preferences">
            <CommandItem onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
              {resolvedTheme === "dark" ? <Sun /> : <Moon />} Toggle dark mode
            </CommandItem>
          </CommandGroup>
        </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
