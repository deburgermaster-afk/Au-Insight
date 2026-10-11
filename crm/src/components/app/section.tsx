import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled card section. */
export function Section({ title, action, children, className, bodyClassName }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-xs", className)}>
      {title ? (
        <header className="flex items-center gap-2 border-b px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}
