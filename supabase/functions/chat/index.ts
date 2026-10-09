// Agentic chat endpoint. See agent.ts for the event protocol and the tools.

import { createClient } from "@supabase/supabase-js";
import { todayISO } from "../_shared/engine/index.ts";
import { type Emit, type Msg, runAgent } from "./agent.ts";
import { systemPrompt } from "./prompt.ts";

const llm = {
  baseUrl: (Deno.env.get("LLM_BASE_URL") ?? "https://api.groq.com/openai/v1").replace(/\/$/, ""),
  apiKey: Deno.env.get("LLM_API_KEY") ?? "",
  model: Deno.env.get("LLM_MODEL") ?? "openai/gpt-oss-120b",
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: auth } = await supabase.auth.getClaims(authHeader.replace(/^Bearer /i, ""));
  if (!auth?.claims) return new Response("Unauthorized", { status: 401, headers: cors });

  const body = await req.json().catch(() => ({}));
  const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  const messages: Msg[] = [
    { role: "system", content: systemPrompt(todayISO()) },
    ...history
      .filter((m: { role?: string; content?: unknown }) =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      )
      .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.slice(0, 12000) })),
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit: Emit = (e) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        if (!llm.apiKey) {
          throw new Error(
            "The AI provider isn't configured yet: set LLM_API_KEY (and LLM_BASE_URL / LLM_MODEL) in the function secrets.",
          );
        }
        await runAgent(llm, supabase, messages, emit, req.signal);
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
      emit({ type: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" },
  });
});
