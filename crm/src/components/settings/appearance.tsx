"use client";

import { Check, Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", label: "Light", icon: Sun, preview: "bg-white border-zinc-200", bar: "bg-zinc-200" },
  { value: "dark", label: "Dark", icon: Moon, preview: "bg-zinc-950 border-zinc-800", bar: "bg-zinc-800" },
  { value: "system", label: "Match device", icon: SunMoon, preview: "bg-gradient-to-r from-white from-50% to-zinc-950 to-50% border-zinc-400/40", bar: "bg-zinc-500/40" },
];

export function AppearancePicker() {
  const { theme, setTheme } = useTheme();
  // The theme is only known in the browser.
  const ready = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
  return (
    <div className="grid max-w-3xl gap-3 sm:grid-cols-3">
      {options.map((o) => {
        const on = ready && theme === o.value;
        return (
          <button key={o.value} type="button" onClick={() => setTheme(o.value)} className={cn("grid gap-3 rounded-2xl border bg-card p-3 text-left transition hover:bg-muted/40", on && "ring-2 ring-foreground")} aria-pressed={on}>
            <div className={cn("grid h-24 content-start gap-1.5 rounded-xl border p-3", o.preview)}>
              <div className={cn("h-2 w-1/2 rounded-full", o.bar)} />
              <div className={cn("h-2 w-3/4 rounded-full", o.bar)} />
              <div className={cn("h-2 w-2/5 rounded-full", o.bar)} />
            </div>
            <span className="flex items-center gap-2 text-sm font-medium">
              <o.icon className="size-4" /> {o.label}
              {on ? <Check className="ml-auto size-4" /> : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}
