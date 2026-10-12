"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/** A field value that copies on click, for pasting into ImmiAccount. */
export function CopyValue({ value, className }: { value: string; className?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value);
        setOk(true);
        setTimeout(() => setOk(false), 1100);
      }}
      className={cn("group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition hover:bg-muted", className)}
      title="Copy"
    >
      <span className="truncate">{value}</span>
      {ok ? <Check className="size-3 shrink-0 text-emerald-500" /> : <Copy className="size-3 shrink-0 opacity-0 transition group-hover:opacity-60" />}
    </button>
  );
}
