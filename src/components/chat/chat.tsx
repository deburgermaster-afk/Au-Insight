"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpIcon, BookOpenIcon, FileSearchIcon, FolderOpenIcon, ScaleIcon, SquareIcon } from "lucide-react";
import { ChainOfThought, ChainOfThoughtContent, ChainOfThoughtHeader, ChainOfThoughtSearchResult, ChainOfThoughtSearchResults, ChainOfThoughtStep } from "@/components/ai-elements/chain-of-thought";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { DecisionCard } from "@/components/decision-card";
import type { VisaAssessment } from "@/lib/engine";
import { spring } from "@/lib/motion";

const suggestions = [
  "Am I eligible for a 189? I'm 34, Superior English, 8 years as a software engineer overseas.",
  "What changes if I get a state nomination for the 190?",
  "Which documents do I need to prove skilled employment?",
  "How long is the 189 taking right now?",
];

const toolMeta: Record<string, { icon: typeof BookOpenIcon; label: (input: Record<string, unknown> | undefined) => string }> = {
  search_law: { icon: BookOpenIcon, label: (i) => `Searching the law: “${(i?.query as string) ?? "…"}”` },
  get_case_file: { icon: FolderOpenIcon, label: () => "Reading your case file" },
  list_documents: { icon: FileSearchIcon, label: () => "Checking your documents" },
  assess_visas: { icon: ScaleIcon, label: () => "Running the decision engine" },
};

type ToolPart = Extract<UIMessage["parts"][number], { type: `tool-${string}` }> & {
  state: string;
  input?: Record<string, unknown>;
  output?: unknown;
};

function AssistantMessage({ message, streaming }: { message: UIMessage; streaming: boolean }) {
  const tools = message.parts.filter(isToolUIPart) as unknown as ToolPart[];
  const sources = message.parts.filter((p) => p.type === "source-url");
  const text = message.parts.filter((p) => p.type === "text");
  const reasoning = message.parts.filter((p) => p.type === "reasoning");
  const assessments = tools
    .filter((t) => getToolName(t as never) === "assess_visas" && t.state === "output-available")
    .flatMap((t) => (t.output as { results?: VisaAssessment[] })?.results ?? []);
  const working = streaming && text.every((t) => !t.text);

  return (
    <div className="flex flex-col gap-4">
      {reasoning.length > 0 && (
        <Reasoning isStreaming={working}>
          <ReasoningTrigger />
          <ReasoningContent>{reasoning.map((r) => r.text).join("\n\n")}</ReasoningContent>
        </Reasoning>
      )}

      {tools.length > 0 && (
        <ChainOfThought defaultOpen={false}>
          <ChainOfThoughtHeader>{working ? <Shimmer>Working through the law…</Shimmer> : `Checked ${tools.length} step${tools.length > 1 ? "s" : ""}`}</ChainOfThoughtHeader>
          <ChainOfThoughtContent>
            {tools.map((t, i) => {
              const name = getToolName(t as never);
              const meta = toolMeta[name] ?? { icon: BookOpenIcon, label: () => name };
              const hits = name === "search_law" ? ((t.output as { results?: { n: number; section: string; title: string }[] })?.results ?? []) : [];
              return (
                <ChainOfThoughtStep key={i} icon={meta.icon} label={meta.label(t.input)} status={t.state === "output-available" ? "complete" : "active"}>
                  {hits.length > 0 && (
                    <ChainOfThoughtSearchResults>
                      {hits.slice(0, 4).map((h) => (
                        <ChainOfThoughtSearchResult key={h.n}>
                          [{h.n}] {h.section.split(" › ").at(-1) || h.title}
                        </ChainOfThoughtSearchResult>
                      ))}
                    </ChainOfThoughtSearchResults>
                  )}
                </ChainOfThoughtStep>
              );
            })}
          </ChainOfThoughtContent>
        </ChainOfThought>
      )}

      {working && tools.length === 0 && <Shimmer className="text-sm">Reading the law…</Shimmer>}

      {text.map((t, i) => (
        <MessageResponse key={i} isAnimating={streaming}>
          {t.text}
        </MessageResponse>
      ))}

      {assessments.length > 0 && (
        <div className="flex flex-col gap-2">
          {assessments.slice(0, 3).map((a) => (
            <DecisionCard key={a.subclass + a.stream} result={a} />
          ))}
        </div>
      )}

      {sources.length > 0 && (
        <Sources>
          <SourcesTrigger count={sources.length} />
          <SourcesContent>
            {sources.map((s) => (
              <Source key={s.sourceId} href={s.url} title={s.title ?? s.url} />
            ))}
          </SourcesContent>
        </Sources>
      )}
    </div>
  );
}

export function Chat({ chatId, initialMessages }: { chatId: string; initialMessages: UIMessage[] }) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/chat", body: { chatId } }),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  function submit(text: string) {
    if (!text.trim() || busy) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-2xl px-4 pt-6 pb-4">
          {messages.length === 0 ? (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft} className="pt-[12vh]">
              <h1 className="text-[2rem] leading-tight font-medium tracking-tight">
                Ask about any visa.
                <br />
                <span className="font-serif text-muted-foreground italic">Get the decision.</span>
              </h1>
              <div className="mt-8 grid gap-2">
                {suggestions.map((s, i) => (
                  <motion.button
                    key={s}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring.soft, delay: 0.05 * i }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => submit(s)}
                    className="rounded-2xl border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {s}
                  </motion.button>
                ))}
              </div>
            </motion.div>
          ) : (
            messages.map((m, i) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={spring.soft}>
                <Message from={m.role}>
                  <MessageContent>
                    {m.role === "user" ? (
                      m.parts.map((p, j) => (p.type === "text" ? <p key={j}>{p.text}</p> : null))
                    ) : (
                      <AssistantMessage message={m} streaming={busy && i === messages.length - 1} />
                    )}
                  </MessageContent>
                </Message>
              </motion.div>
            ))
          )}
          <AnimatePresence>
            {status === "submitted" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Shimmer className="text-sm">Thinking…</Shimmer>
              </motion.div>
            )}
          </AnimatePresence>
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="mx-auto w-full max-w-2xl px-4 pb-2"
      >
        <div className="flex items-end gap-2 rounded-3xl border bg-card p-2 shadow-2xl shadow-black/20 transition-colors focus-within:border-foreground/20">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="Describe your situation or ask a question…"
            className="max-h-[200px] min-h-10 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <motion.button
            type={busy ? "button" : "submit"}
            onClick={busy ? () => stop() : undefined}
            whileTap={{ scale: 0.9 }}
            disabled={!busy && !input.trim()}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-foreground text-background transition-opacity disabled:opacity-30"
            aria-label={busy ? "Stop" : "Send"}
          >
            {busy ? <SquareIcon className="size-3.5 fill-current" /> : <ArrowUpIcon className="size-4" />}
          </motion.button>
        </div>
      </form>
    </div>
  );
}
