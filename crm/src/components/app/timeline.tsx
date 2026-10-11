import { CalendarCheck, FileText, Flag, Mail, MessageSquareText, Phone, Pin, Receipt, Sparkles, SquareCheck } from "lucide-react";
import { ago } from "@/lib/format";

const icons = {
  note: MessageSquareText,
  call: Phone,
  meeting: CalendarCheck,
  email: Mail,
  stage: Flag,
  document: FileText,
  task: SquareCheck,
  invoice: Receipt,
  system: Sparkles,
} as const;

type Activity = { id: string; kind: string; title: string; body: string | null; actorName: string | null; pinned: boolean; createdAt: Date };

export function Timeline({ items, empty = "Nothing yet." }: { items: Activity[]; empty?: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ol className="relative grid gap-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-border">
      {items.map((a) => {
        const Icon = icons[a.kind as keyof typeof icons] ?? Sparkles;
        return (
          <li key={a.id} className="relative flex gap-3">
            <span className="relative z-10 grid size-8 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground">
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                {a.pinned ? <Pin className="size-3 text-primary" /> : null}
                {a.title}
              </p>
              {a.body ? <p className="mt-0.5 whitespace-pre-line text-sm text-muted-foreground">{a.body}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">
                {a.actorName ?? "System"} · {ago(a.createdAt)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
