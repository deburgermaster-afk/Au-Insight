// Agentic chat endpoint. See agent.ts for the event protocol and the tools.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { todayISO } from "../_shared/engine/index.ts";
import { type Emit, type LLMConfig, type Msg, prepareDocuments, processDocuments, runAgent } from "./agent.ts";
import { academicRecord, coeHistory, loadStudyContext, studyPlanFor } from "./study.ts";
import { missingSections } from "./profile.ts";
import { changesQuery, systemPrompt, type UserContext } from "./prompt.ts";

// Defaults: xKiro's OpenAI-compatible gateway with the free models that did best on a full
// plan request (accurate facts, the user's own state, citations) within the 150 s limit.
// Models written "@gemini/<model>" go to Google's OpenAI-compatible endpoint (key in Vault).
const GEMINI_OPENAI_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
const llm: LLMConfig = {
  baseUrl: (Deno.env.get("LLM_BASE_URL") ?? "https://api.xkiro.com/v1").replace(/\/$/, ""),
  apiKey: Deno.env.get("LLM_API_KEY") ?? "",
  geminiKey: Deno.env.get("GEMINI_API_KEY") ?? undefined,
  models: (Deno.env.get("LLM_MODEL") ??
    "qwen/qwen3.7-max:free,qwen/qwen3.8-max:free,cohere/command-a-plus,@gemini/gemini-3.5-flash")
    .split(",").map((m) => m.trim()).filter(Boolean),
};

/** Keys from function secrets, else from Vault via the service role (cached per instance). */
async function apiKey(): Promise<string> {
  if (llm.apiKey && llm.providers) return llm.apiKey;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const [xkiro, gemini] = await Promise.all([
    admin.rpc("llm_api_key"),
    llm.geminiKey ? Promise.resolve({ data: llm.geminiKey }) : admin.rpc("gemini_api_key"),
  ]);
  llm.apiKey ||= typeof xkiro.data === "string" ? xkiro.data : "";
  const key = typeof gemini.data === "string" ? gemini.data : "";
  llm.geminiKey = key || undefined;
  llm.providers = key ? { gemini: { baseUrl: GEMINI_OPENAI_URL, apiKey: key } } : {};
  return llm.apiKey;
}

/** Whether the user has told their story yet and what they've uploaded, so the agent knows where to start. */
async function userContext(supabase: SupabaseClient): Promise<UserContext & { profile: Record<string, unknown> }> {
  const [caseRow, docs] = await Promise.all([
    supabase.from("cases").select("*").order("created_at").limit(1).maybeSingle(),
    supabase.from("documents").select("id", { count: "exact", head: true }),
  ]);
  return {
    hasStory: Boolean(caseRow.data?.story?.trim()),
    documents: docs.count ?? 0,
    savedFacts: Object.keys(caseRow.data?.facts ?? {}).length,
    missing: missingSections(caseRow.data?.profile ?? {}),
    profile: caseRow.data?.profile ?? {},
    person: personOf(caseRow.data),
  };
}

/** Names the open person unless it's the account holder's own file ("Me", or the pre-people default). */
function personOf(row: { title?: string; relation?: string } | null): UserContext["person"] {
  const name = row?.title?.trim() ?? "";
  if (!name || ["me", "my case", "myself"].includes(name.toLowerCase())) return undefined;
  return { name, relation: row?.relation?.trim() ?? "" };
}

/** Extra instructions kept in the database (assistant_guidance), so the assistant can be tuned without a
 * deploy. "lead" goes to the main agent, "analysts" to the analyst team, "all" to both. */
async function guidanceFor(supabase: SupabaseClient): Promise<{ lead: string; analysts: string }> {
  const { data, error } = await supabase.from("assistant_guidance").select("applies_to, body").eq("enabled", true)
    .order("key");
  if (error || !Array.isArray(data)) return { lead: "", analysts: "" };
  const pick = (who: string) =>
    data.filter((g) => g.applies_to === who || g.applies_to === "all").map((g) => String(g.body).trim()).filter(
      Boolean,
    ).join("\n");
  return { lead: pick("lead"), analysts: pick("analysts") };
}

/** The recent official changes most relevant to the user, one line each, for the system prompt. */
async function changesDigest(supabase: SupabaseClient, query: string): Promise<string> {
  if (!query) return "";
  const { data, error } = await supabase.rpc("recent_law_changes", { p_query: query, p_limit: 5 });
  if (error || !Array.isArray(data)) return "";
  return data
    .filter((r: { rank?: number }) => (r.rank ?? 0) > 0)
    .map((r: { title: string; url: string; section?: string; mentions_date?: string }) =>
      `  - ${r.title}${r.section ? ` › ${r.section}` : ""}${
        r.mentions_date ? ` (mentions ${r.mentions_date})` : ""
      }: ${r.url}`
    )
    .join("\n");
}

/** The app's direct tools: one JSON answer, no chat. Same user, same row-level security. */
async function direct(supabase: SupabaseClient, body: { tool?: unknown; args?: unknown }): Promise<Response> {
  const json = (status: number, data: unknown) =>
    new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });
  const args = body.args && typeof body.args === "object" ? body.args as Record<string, unknown> : {};
  try {
    switch (body.tool) {
      case "study_plan":
        return json(200, { result: await studyPlanFor(supabase, todayISO(), args) });
      case "academic_record":
        return json(200, { result: await academicRecord(supabase) });
      case "study_history": {
        const { docs } = await loadStudyContext(supabase);
        return json(200, { result: { coes: coeHistory(docs) } });
      }
      case "process_documents": {
        await apiKey();
        const rows = await processDocuments(supabase, llm, () => {}, { readMs: 50_000, understandMs: 60_000 });
        const documents = rows.map((d) => ({
          id: d.id,
          filename: d.filename,
          status: d.status,
          type: (d.extracted as { type?: string } | null)?.type ?? null,
        }));
        return json(200, { result: { processed: documents.filter((d) => d.type).length, documents } });
      }
      default:
        return json(400, { error: `Unknown tool: ${String(body.tool)}` });
    }
  } catch (e) {
    return json(500, { error: e instanceof Error ? e.message : String(e) });
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: cors });

  const authHeader = req.headers.get("Authorization") ?? "";
  const startedAt = Date.now();
  const body = await req.json().catch(() => ({}));
  // The person the app has open: row-level security then shows only their case, chats, documents
  // and plans, and rows the agent saves go to them (migration 20261011090000_people_profiles).
  const caseId = typeof body?.caseId === "string" && UUID.test(body.caseId) ? body.caseId : undefined;
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader, ...(caseId ? { "x-case-id": caseId } : {}) } },
  });
  const { data: auth } = await supabase.auth.getClaims(authHeader.replace(/^Bearer /i, ""));
  if (!auth?.claims) return new Response("Unauthorized", { status: 401, headers: cors });

  if (body?.action === "tool") return direct(supabase, body);
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
        // Every document is read before the agent starts, and all of them go into its context.
        const last = [...history].reverse().find((m: { role?: string }) => m.role === "user");
        const [documents, changes, guidance] = await Promise.all([
          prepareDocuments(supabase, llm, emit),
          changesDigest(supabase, changesQuery(user.profile, typeof last?.content === "string" ? last.content : ""))
            .catch(() => ""),
          guidanceFor(supabase).catch(() => ({ lead: "", analysts: "" })),
        ]);
        messages[0] = { role: "system", content: systemPrompt(todayISO(), user, documents, changes, guidance.lead) };
        await runAgent(llm, supabase, messages, emit, req.signal, {
          chatId: typeof body.chatId === "string" ? body.chatId : undefined,
          documents,
          startedAt,
          guidance: guidance.analysts,
        });
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
