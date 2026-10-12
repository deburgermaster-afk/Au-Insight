import { FileUp, Flag, Mail, Receipt, type LucideIcon } from "lucide-react";
import { stages } from "@/lib/visas";
import { ago } from "@/lib/format";

const icons: Record<string, LucideIcon> = { stage: Flag, document: FileUp, invoice: Receipt, email: Mail };

/** Turns internal activity titles into client-friendly wording. */
function friendly(kind: string, title: string) {
  if (kind === "stage") {
    const key = title.match(/moved to (\w+)/)?.[1];
    const st = stages.find((s) => s.key === key);
    if (st) return `Your case moved to ${st.label.toLowerCase()}`;
  }
  return title.replace(/^Client uploaded /, "You uploaded ");
}

export function PortalTimeline({ items, empty = "No updates yet." }: { items: { id: string; kind: string; title: string; body: string | null; createdAt: Date }[]; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative grid gap-3 before:absolute before:top-2 before:bottom-2 before:left-[13px] before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = icons[a.kind] ?? Flag;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="z-10 grid size-7 shrink-0 place-items-center rounded-full border bg-card text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[13px] leading-snug">{friendly(a.kind, a.title)}</p>
              {a.body && a.kind !== "stage" ? <p className="truncate text-xs text-muted-foreground">{a.body}</p> : null}
              <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
                {ago(a.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
