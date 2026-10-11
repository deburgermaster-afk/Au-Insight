import { CalendarCheck, FileText, Flag, Mail, MessageSquareText, Phone, Pin, Receipt, Sparkles, SquareCheck } from "lucide-react";
import { ago, dmy, time } from "@/lib/format";

const kinds = {
  note: { icon: MessageSquareText, color: "var(--chart-4)" },
  call: { icon: Phone, color: "var(--chart-1)" },
  meeting: { icon: CalendarCheck, color: "var(--chart-5)" },
  email: { icon: Mail, color: "var(--chart-4)" },
  stage: { icon: Flag, color: "var(--chart-2)" },
  document: { icon: FileText, color: "var(--success)" },
  task: { icon: SquareCheck, color: "var(--success)" },
  invoice: { icon: Receipt, color: "var(--chart-3)" },
  system: { icon: Sparkles, color: "var(--muted-foreground)" },
} as const;

type Activity = { id: string; kind: string; title: string; body: string | null; actorName: string | null; pinned: boolean; createdAt: Date };

/** A tracking-style timeline: coloured stops joined by a line. */
export function Timeline({ items, empty = "Nothing yet." }: { items: Activity[]; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="grid">
      {items.map((a, i) => {
        const k = kinds[a.kind as keyof typeof kinds] ?? kinds.system;
        return (
          <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
            {i < items.length - 1 ? <span className="absolute bottom-0 left-[11px] top-6 w-0.5 rounded" style={{ background: `color-mix(in oklch, ${k.color} 55%, transparent)` }} /> : null}
            <span className="relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-[var(--card)]" style={{ background: k.color }}>
              <k.icon className="size-3.5" strokeWidth={2.5} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-start gap-2 text-[13px]">
                <span className="tabular-nums text-muted-foreground">
                  {dmy(a.createdAt)} {time(a.createdAt)}
                </span>
                <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{a.actorName ?? "System"}</span>
              </p>
              <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium">
                {a.pinned ? <Pin className="size-3 text-[var(--chart-2)]" /> : null}
                {a.title}
              </p>
              {a.body ? <p className="mt-0.5 whitespace-pre-line text-[13px] text-muted-foreground">{a.body}</p> : null}
              <span className="sr-only">{ago(a.createdAt)}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
