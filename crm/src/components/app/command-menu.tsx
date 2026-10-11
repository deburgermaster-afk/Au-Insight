"use client";

import { CalendarPlus, FilePlus2, Moon, Search, Sun, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
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
      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-9 w-full min-w-0 max-w-sm shrink justify-start gap-2 rounded-xl bg-muted/40 px-3 text-muted-foreground shadow-none sm:w-64"
      >
        <Search className="size-4" />
        <span className="flex-1 truncate text-left text-sm font-normal">Search or jump to…</span>
        <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Lodgely">
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
      </CommandDialog>
    </>
  );
}
