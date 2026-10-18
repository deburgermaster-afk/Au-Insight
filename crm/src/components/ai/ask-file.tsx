"use client";

import { ArrowUp, Loader2, MessageSquareText, Sparkles } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { askFile } from "@/lib/ask-actions";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGEST = ["What's still missing before we can lodge?", "Any inconsistencies across the documents?", "Summarise this case in 5 lines", "Draft an email asking for the outstanding documents"];

/** Chat with one matter's file: answers come only from the case record. */
export function AskFile({ matterId, enabled }: { matterId: string; enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }), [msgs.length, pending]);

  const ask = (text: string) => {
    const t = text.trim();
    if (!t || pending) return;
    const next = [...msgs, { role: "user" as const, content: t }];
    setMsgs(next);
    setQ("");
    start(async () => {
      const r = await askFile(matterId, next);
      setMsgs((m) => [...m, { role: "assistant", content: r.ok ? r.answer : `⚠️ ${r.error}` }]);
    });
  };

  if (!enabled) return <p className="text-sm text-muted-foreground">Turn on AI in Settings → AI assistant to ask questions about this file.</p>;
  return (
    <div className="grid gap-3">
      {msgs.length ? (
        <div className="grid max-h-[28rem] gap-2.5 overflow-y-auto pr-1">
          {msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[92%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap", m.role === "user" ? "justify-self-end bg-foreground text-background" : "justify-self-start bg-muted/60")}>
              {m.content}
            </div>
          ))}
          {pending ? (
            <div className="flex items-center gap-2 justify-self-start rounded-2xl bg-muted/60 px-3 py-2 text-[13px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Reading the file…
            </div>
          ) : null}
          <div ref={end} />
        </div>
      ) : (
        <div className="grid gap-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" /> Answers come from this matter&apos;s record: profile, checklist, documents, AI checks and timeline.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGGEST.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      <form
        className="flex items-end gap-2 rounded-xl border bg-background p-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <MessageSquareText className="mb-2 ml-1 size-4 shrink-0 text-muted-foreground" />
        <textarea value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), ask(q))} rows={1} placeholder="Ask about this file…" className="max-h-32 min-h-8 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none" />
        <Button type="submit" size="icon-sm" className="rounded-full" disabled={!q.trim() || pending} aria-label="Ask">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
