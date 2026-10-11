import { cn } from "@/lib/utils";

const listTone: Record<string, string> = {
  MLTSSL: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  STSOL: "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  ROL: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  CSOL: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};

export function ListBadge({ list, className }: { list: string; className?: string }) {
  return <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-medium", listTone[list] ?? "bg-muted text-muted-foreground", className)}>{list}</span>;
}
