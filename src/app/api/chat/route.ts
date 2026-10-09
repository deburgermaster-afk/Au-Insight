import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  isStepCount,
  smoothStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai";
import { chatModel } from "@/lib/ai/model";
import { systemPrompt } from "@/lib/ai/prompt";
import { createTools } from "@/lib/ai/tools";
import { todayISO } from "@/lib/engine";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 120;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) return new Response("Unauthorized", { status: 401 });

  const { messages, chatId }: { messages: UIMessage[]; chatId?: string } = await req.json();

  const stream = createUIMessageStream({
    originalMessages: messages,
    execute: async ({ writer }) => {
      const tools = createTools(supabase, writer);
      const result = streamText({
        model: chatModel,
        instructions: systemPrompt(todayISO()),
        messages: await convertToModelMessages(messages),
        tools,
        stopWhen: isStepCount(8),
        experimental_transform: smoothStream({ chunking: "word" }),
      });
      writer.merge(toUIMessageStream({ stream: result.stream, tools, sendReasoning: true, sendSources: true }));
    },
    onEnd: async ({ messages: all }) => {
      if (!chatId) return;
      // Persist the conversation as the user (RLS); the model itself never writes.
      await supabase.from("chats").update({ messages: all, updated_at: new Date().toISOString() }).eq("id", chatId);
    },
  });

  return createUIMessageStreamResponse({ stream });
}
