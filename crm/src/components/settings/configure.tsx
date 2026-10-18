"use client";

import { Settings2 } from "lucide-react";
import { createContext, type ReactNode, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const Ctx = createContext<{ close: () => void } | null>(null);
/** Inside a Configure popup: lets a form close it after saving. */
export const useConfigure = () => useContext(Ctx);

/** The "Configure" button on a settings summary, opening the real settings in a popup. */
export function Configure({ title, description, label = "Configure", size = "md", variant = "default", defaultOpen = false, children }: { title: string; description?: string; label?: string; size?: "md" | "lg" | "xl"; variant?: "default" | "outline"; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="rounded-full">
          <Settings2 /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent className={cn("max-h-[90dvh] overflow-y-auto", size === "md" ? "sm:max-w-xl" : size === "lg" ? "sm:max-w-3xl" : "sm:max-w-5xl")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <Ctx.Provider value={{ close: () => setOpen(false) }}>{children}</Ctx.Provider>
      </DialogContent>
    </Dialog>
  );
}
