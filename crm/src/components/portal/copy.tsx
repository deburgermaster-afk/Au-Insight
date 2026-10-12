"use client";

import { Check, Copy, Printer } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function CopyValue({ label, value }: { label: string; value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value.replace(/\s/g, label === "Account name" ? " " : ""));
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="flex w-full items-center gap-2 px-3 py-2 text-left active:bg-muted/50"
    >
      <span className="w-24 shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[13px]">{value}</span>
      {done ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5 text-muted-foreground" />}
    </button>
  );
}

export function PrintButton() {
  return (
    <Button size="sm" variant="outline" className="rounded-full print:hidden" onClick={() => window.print()}>
      <Printer /> Save PDF
    </Button>
  );
}
