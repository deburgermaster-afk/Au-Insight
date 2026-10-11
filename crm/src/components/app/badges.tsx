import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const tone = {
  gray: "bg-muted text-muted-foreground border-transparent",
  blue: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20",
  violet: "bg-primary/10 text-primary border-primary/20",
  green: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
  amber: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/25",
  red: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20",
  pink: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/20",
} as const;
export type Tone = keyof typeof tone;

export function Pill({ children, t = "gray", className }: { children: React.ReactNode; t?: Tone; className?: string }) {
  return (
    <Badge variant="outline" className={cn("rounded-full font-medium", tone[t], className)}>
      {children}
    </Badge>
  );
}

export const clientStageTone: Record<string, Tone> = { lead: "blue", prospect: "violet", active: "green", on_hold: "amber", past: "gray", lost: "red" };
export const matterStageTone: Record<string, Tone> = {
  enquiry: "gray",
  consultation: "blue",
  engaged: "violet",
  documents: "amber",
  ready: "pink",
  lodged: "blue",
  rfi: "red",
  decision: "violet",
  closed: "green",
};
export const priorityTone: Record<string, Tone> = { low: "gray", normal: "blue", high: "amber", urgent: "red" };
export const invoiceTone: Record<string, Tone> = { draft: "gray", sent: "blue", partial: "amber", paid: "green", overdue: "red", void: "gray" };
export const checklistTone: Record<string, Tone> = { needed: "gray", requested: "amber", received: "blue", approved: "green", rejected: "red", waived: "gray" };

export const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** A visa expiry, coloured by how close it is. */
export function ExpiryPill({ days }: { days: number | null }) {
  if (days == null) return <Pill>—</Pill>;
  const t: Tone = days < 0 ? "red" : days <= 30 ? "red" : days <= 90 ? "amber" : "green";
  return <Pill t={t}>{days < 0 ? `expired ${-days}d ago` : days === 0 ? "expires today" : `${days}d left`}</Pill>;
}
