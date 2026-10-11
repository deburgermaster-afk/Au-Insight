import { Grip } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A titled panel. */
export function Section({
  title,
  action,
  children,
  className,
  bodyClassName,
  icon = true,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: boolean;
}) {
  return (
    <section className={cn("rounded-xl border bg-card", className)}>
      {title ? (
        <header className="flex min-h-11 items-center gap-2 border-b px-4 py-2.5">
          {icon ? <Grip className="size-3.5 text-muted-foreground/60" /> : null}
          <h2 className="text-[13px] font-medium text-foreground/90">{title}</h2>
          {action ? <div className="ml-auto flex items-center gap-2">{action}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}
