// Agent loop for the chat function: tools, streaming and the event protocol.
//
// POST { messages: [{ role: "user" | "assistant", content: string }] }
// → text/event-stream of JSON events:
//   { type: "step", id, tool, label, status: "running" | "done", hits? }
//   { type: "source", n, title, section, url }
//   { type: "decision", results }        (VisaAssessment[] from the rules engine)
//   { type: "reasoning", delta } | { type: "text", delta } | { type: "error", message } | { type: "done" }
//
// Works with any OpenAI-compatible provider (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).
// The model can only read: tools query as the signed-in user (RLS applies) and never write.

import type { SupabaseClient } from "@supabase/supabase-js";
import { assessAll, type CaseFacts, caseFactsSchema, todayISO } from "../_shared/engine/index.ts";

const MAX_STEPS = 8;

/** `models` is tried in order: free tiers rate-limit, so a busy model falls through to the next. */
export type LLMConfig = { baseUrl: string; apiKey: string; models: string[] };

export type Msg =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Emit = (event: Record<string, unknown>) => void;

const factsJsonSchema = {
  type: "object",
  description:
    "Only facts the user stated or the case file contains. Omit anything not stated: never set a fact to false or 0 because it was not mentioned.",
  properties: {
    dateOfBirth: { type: "string", description: "YYYY-MM-DD" },
    assessmentDate: { type: "string", description: "YYYY-MM-DD, e.g. invitation date" },
    occupationCode: { type: "string" },
    occupationLists: { type: "array", items: { type: "string", enum: ["MLTSSL", "STSOL", "ROL", "CSOL"] } },
    positiveSkillsAssessment: { type: "boolean" },
    englishLevel: { type: "string", enum: ["none", "functional", "vocational", "competent", "proficient", "superior"] },
    overseasSkilledYears: { type: "number" },
    australianSkilledYears: { type: "number" },
    highestQualification: {
      type: "string",
      enum: ["none", "recognised_by_assessing_authority", "diploma_or_trade", "bachelor_or_masters", "doctorate"],
    },
    specialistEducation: { type: "boolean" },
    australianStudyRequirement: { type: "boolean" },
    professionalYear: { type: "boolean" },
    credentialledCommunityLanguage: { type: "boolean" },
    regionalStudy: { type: "boolean" },
    partnerStatus: {
      type: "string",
      enum: ["single", "partner_citizen_or_pr", "partner_skilled", "partner_competent_english", "partner_other"],
    },
    stateNomination: { type: "boolean" },
    regionalNominationOrSponsorship: { type: "boolean" },
    invitationReceived: { type: "boolean" },
    meetsHealth: { type: "boolean" },
    meetsCharacter: { type: "boolean" },
    hasCommonwealthDebt: { type: "boolean" },
  },
};

const toolDefs = [
  {
    type: "function",
    function: {
      name: "search_law",
      description:
        "Search the official corpus (Home Affairs, Migration Act 1958, Migration Regulations 1994, migration instruments, state nomination sites, tribunal). Returns numbered sources to cite as [n].",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Focused search terms, e.g. 'subclass 189 age invitation 45'" },
          asAt: { type: "string", description: "YYYY-MM-DD: search the law in force on this date. Defaults to today." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_case_file",
      description: "Read the facts the user saved in their case file.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List the user's uploaded documents and facts extracted from them.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "assess_visas",
      description:
        "Run the deterministic rules engine for skilled visas (189, 190, 491). Returns the decision per visa, each criterion with status and source, the points range and the questions that would settle anything unknown.",
      parameters: { type: "object", properties: { facts: factsJsonSchema }, required: ["facts"] },
    },
  },
];

function stepLabel(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case "search_law":
      return `Searching the law: “${args.query ?? ""}”`;
    case "get_case_file":
      return "Reading your case file";
    case "list_documents":
      return "Checking your documents";
    case "assess_visas":
      return "Running the decision engine";
    default:
      return name;
  }
}

function makeTools(supabase: SupabaseClient, emit: Emit) {
  const seen = new Map<number, number>();
  let count = 0;

  return {
    async search_law(args: { query?: string; asAt?: string }) {
      const query = String(args.query ?? "").slice(0, 300);
      const { data, error } = await supabase.rpc("search_law", {
        query_text: query,
        query_embedding: null,
        match_count: 6,
        as_at: args.asAt ? new Date(args.asAt).toISOString() : new Date().toISOString(),
      });
      if (error) return { error: error.message, results: [] };
      const results = (data ?? []).map(
        (
          r: {
            section_id: number;
            title: string;
            heading_path: string[];
            url: string;
            content: string;
            version_fetched_at: string;
          },
        ) => {
          let n = seen.get(r.section_id);
          const section = r.heading_path.slice(1).join(" › ");
          if (n === undefined) {
            n = ++count;
            seen.set(r.section_id, n);
            emit({ type: "source", n, title: r.title, section, url: r.url });
          }
          return { n, title: r.title, section, url: r.url, retrieved: r.version_fetched_at, text: r.content.slice(0, 2500) };
        },
      );
      return { results };
    },

    async get_case_file() {
      const { data, error } = await supabase.from("cases").select("title, facts, updated_at").order("created_at").limit(1)
        .maybeSingle();
      return error ? { error: error.message } : (data ?? { facts: {} });
    },

    async list_documents() {
      const { data, error } = await supabase
        .from("documents")
        .select("filename, mime_type, status, extracted, created_at, folders(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      return error ? { error: error.message } : { documents: data };
    },

    async assess_visas(args: { facts?: unknown }) {
      const { data } = await supabase.from("cases").select("facts").order("created_at").limit(1).maybeSingle();
      const saved = caseFactsSchema.safeParse(data?.facts ?? {});
      const given = caseFactsSchema.partial().safeParse(args.facts ?? {});
      const merged: CaseFacts = { ...(saved.success ? saved.data : {}), ...(given.success ? given.data : {}) };
      const results = assessAll(merged);
      emit({ type: "decision", results });
      return {
        assessedAt: merged.assessmentDate ?? todayISO(),
        results,
        invalidFacts: given.success ? undefined : given.error.issues,
      };
    },
  };
}

/** One streamed completion. Emits text/reasoning deltas as they arrive; returns the full assistant turn. */
async function complete(llm: LLMConfig, messages: Msg[], emit: Emit, signal: AbortSignal, allowTools = true) {
  let res: Response | undefined;
  let lastError = "";
  for (const model of llm.models) {
    res = await fetch(`${llm.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        ...(allowTools ? { tools: toolDefs, tool_choice: "auto" } : {}),
        stream: true,
        temperature: 0.1,
      }),
    });
    if (res.ok && res.body) break;
    lastError = `${model}: ${res.status} ${(await res.text()).slice(0, 300)}`;
    // Only rate limits and provider errors are worth retrying on another model.
    if (res.status !== 429 && res.status < 500 && res.status !== 404) break;
  }
  if (!res?.ok || !res.body) throw new Error(`Model error: ${lastError}`);

  let content = "";
  const calls: ToolCall[] = [];
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") continue;
      let chunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        continue;
      }
      const delta = chunk.choices?.[0]?.delta ?? {};
      const reasoning = delta.reasoning ?? delta.reasoning_content;
      if (reasoning) emit({ type: "reasoning", delta: reasoning });
      if (delta.content) {
        content += delta.content;
        emit({ type: "text", delta: delta.content });
      }
      for (const tc of delta.tool_calls ?? []) {
        const i = tc.index ?? 0;
        calls[i] ??= { id: tc.id ?? `call_${i}`, type: "function", function: { name: "", arguments: "" } };
        if (tc.id) calls[i].id = tc.id;
        if (tc.function?.name) calls[i].function.name += tc.function.name;
        if (tc.function?.arguments) calls[i].function.arguments += tc.function.arguments;
      }
    }
  }
  return { content, calls: calls.filter(Boolean) };
}

/** Runs tool rounds until the model answers without calling a tool. */
export async function runAgent(llm: LLMConfig, supabase: SupabaseClient, messages: Msg[], emit: Emit, signal: AbortSignal) {
  const tools = makeTools(supabase, emit);
  for (let step = 0; step < MAX_STEPS; step++) {
    const { content, calls } = await complete(llm, messages, emit, signal);
    if (!calls.length) return;
    messages.push({ role: "assistant", content: content || null, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch { /* model sent invalid JSON: run with no args */ }
      const label = stepLabel(call.function.name, args);
      emit({ type: "step", id: call.id, tool: call.function.name, label, status: "running" });
      const fn = tools[call.function.name as keyof typeof tools] as
        | ((a: Record<string, unknown>) => Promise<unknown>)
        | undefined;
      const result = fn ? await fn(args).catch((e: Error) => ({ error: e.message })) : { error: "unknown tool" };
      const hits = call.function.name === "search_law"
        ? ((result as { results?: { n: number; section: string; title: string }[] }).results ?? []).map((h) => ({
          n: h.n,
          label: h.section.split(" › ").at(-1) || h.title,
        }))
        : undefined;
      emit({ type: "step", id: call.id, tool: call.function.name, label, status: "done", hits });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result).slice(0, 30000) });
    }
  }
  // Out of tool rounds: the model must now answer from what it has gathered.
  messages.push({ role: "user", content: "Answer now using only the tool results above. Do not call more tools." });
  await complete(llm, messages, emit, signal, false);
}
