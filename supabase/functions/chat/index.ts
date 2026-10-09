// Agentic chat endpoint. See agent.ts for the event protocol and the tools.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "../_shared/engine/index.ts";
import { type Emit, type Msg, runAgent } from "./agent.ts";
import { systemPrompt, type UserContext } from "./prompt.ts";

// Defaults: xKiro's OpenAI-compatible gateway with the free models that did best on this
// agent's tool-calling loop (correct arguments, used every tool, no invented numbers).
const llm = {
  baseUrl: (Deno.env.get("LLM_BASE_URL") ?? "https://api.xkiro.com/v1").replace(/\/$/, ""),
  apiKey: Deno.env.get("LLM_API_KEY") ?? "",
  models: (Deno.env.get("LLM_MODEL") ?? "cohere/command-a-plus,mistralai/mistral-large-4-0,qwen/qwen3.8-max:free")
    .split(",").map((m) => m.trim()).filter(Boolean),
};

/** Key from the function secret, else from Vault via the service role (cached per instance). */
async function apiKey(): Promise<string> {
  if (llm.apiKey) return llm.apiKey;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await admin.rpc("llm_api_key");
  llm.apiKey = typeof data === "string" ? data : "";
  return llm.apiKey;
}

/** Whether the user has told their story yet and what they've uploaded, so the agent knows where to start. */
async function userContext(supabase: SupabaseClient): Promise<UserContext> {
  const [caseRow, docs] = await Promise.all([
    supabase.from("cases").select("facts, story").order("created_at").limit(1).maybeSingle(),
    supabase.from("documents").select("id", { count: "exact", head: true }),
  ]);
  return {
    hasStory: Boolean(caseRow.data?.story?.trim()),
    documents: docs.count ?? 0,
    savedFacts: Object.keys(caseRow.data?.facts ?? {}).length,
  };
}

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
  const user = await userContext(supabase);
  const history = Array.isArray(body.messages) ? body.messages.slice(-24) : [];
  const messages: Msg[] = [
    { role: "system", content: systemPrompt(todayISO(), user) },
    ...history
      .filter((m: { role?: string; content?: unknown }) =>
        (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
      )
      .map((m: { role: "user" | "assistant"; content: string }) => ({
        role: m.role,
        content: m.content.slice(0, 12000),
      })),
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const emit: Emit = (e) => controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        if (!(await apiKey())) {
          throw new Error(
            "The AI provider isn't configured yet: store the key in Vault as llm_api_key or set the LLM_API_KEY function secret.",
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
