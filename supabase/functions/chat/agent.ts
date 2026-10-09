// Agent loop for the chat function: tools, streaming and the event protocol.
//
// POST { messages: [{ role: "user" | "assistant", content: string }] }
// → text/event-stream of JSON events:
//   { type: "step", id, tool, label, status: "running" | "done", hits? }
//   { type: "source", n, title, section, url }
//   { type: "decision", results }        (VisaAssessment[] from the rules engine)
//   steps from analysts carry { agent: "<analyst name>" }
//   { type: "case", id, title }          (a solution saved as a Case)
//   { type: "profile" }                  (the profile changed)
//   { type: "action", action }           (a button the app shows: "upload_documents" | "open_case_file")
//   { type: "reasoning", delta } | { type: "text", delta } | { type: "error", message } | { type: "done" }
//
// Works with any OpenAI-compatible provider (LLM_BASE_URL / LLM_API_KEY / LLM_MODEL).
// Tools run as the signed-in user (RLS applies). Documents and the law are read-only; the agent
// only writes the user's own profile (save_story, save_profile) and the Cases it creates.

import type { SupabaseClient } from "@supabase/supabase-js";
import { assessAll, type CaseFacts, caseFactsSchema, todayISO } from "../_shared/engine/index.ts";
import { analystPrompt, ANALYSTS } from "./analysts.ts";
import { mergeProfile, missingSections, type Profile, profileJsonSchema } from "./profile.ts";

const BUCKET = "case-documents";
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_DOCUMENT_CHARS = 20000;

const MAX_STEPS = 8;
/** Tool rounds each analyst gets before it must report. */
const ANALYST_STEPS = 3;
/** Tools analysts may use: reading only. */
const ANALYST_TOOLS = ["search_law", "get_case_file", "list_documents", "read_document", "assess_visas"];
/** Tools that only record or display something: they need no reply from the model. */
const BOOKKEEPING_TOOLS = new Set(["save_story", "save_profile", "create_case", "show_button"]);
/** Caps a reply so a model stuck repeating itself can't run on. */
const MAX_OUTPUT_TOKENS = 3000;
// A request may run 150 s in total (Supabase free plan wall clock). The lead stops calling tools
// after TURN_BUDGET_MS so its answer always finishes in time; analysts report after
// ANALYST_BUDGET_MS and are cut off at ANALYST_HARD_MS.
const TURN_BUDGET_MS = 95_000;
const ANALYST_BUDGET_MS = 45_000;
const ANALYST_HARD_MS = 70_000;

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
          query: { type: "string", description: "Focused search terms for one requirement" },
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
      description: "Read the user's case file: the facts they saved and their story (their migration history so far).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "list_documents",
      description: "List the user's uploaded documents (id, file name, folder, type, size).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_document",
      description:
        "Read the text of one of the user's uploaded documents (PDF or text). Use the id from list_documents. Scanned images have no text.",
      parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
    },
  },
  {
    type: "function",
    function: {
      name: "save_story",
      description:
        "Save the user's migration story to their case file so future chats know it. Write the complete story so far (it replaces the saved one) as a short dated timeline: arrivals, visas held and applied for, study, work, family, refusals, current visa and expiry, goals. Only what the user said or their documents show.",
      parameters: { type: "object", properties: { story: { type: "string" } }, required: ["story"] },
    },
  },
  {
    type: "function",
    function: {
      name: "save_profile",
      description:
        "Save what you learned in the guided intake to the user's profile: personal details, arrival, where they live now, every course and provider (including changes), current visa, work, partner and dependents, English, goals. Returns the sections still missing.",
      parameters: { type: "object", properties: { profile: profileJsonSchema }, required: ["profile"] },
    },
  },
  {
    type: "function",
    function: {
      name: "create_case",
      description:
        "Save the solution you just gave as a Case the user can open and track. Call it after answering from the analyst team's reports, when the user asked for a solution or plan.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short and specific to this user's plan" },
          question: { type: "string", description: "What the user asked" },
          summary: { type: "string", description: "Your answer in markdown, with its [n] citations" },
          pathways: {
            type: "array",
            description: "Options from best to least promising",
            items: {
              type: "object",
              properties: { name: { type: "string" }, fit: { type: "string" }, needs: { type: "string" } },
              required: ["name"],
            },
          },
          steps: {
            type: "array",
            description: "The plan, in order",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                detail: { type: "string" },
                due: { type: "string", description: "YYYY-MM-DD or a short phrase like 'before 14 Dec 2026'" },
              },
              required: ["title"],
            },
          },
        },
        required: ["title", "summary", "steps"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "show_button",
      description:
        "Show the user a button under your reply: upload_documents opens the document upload, open_case_file opens their case file.",
      parameters: {
        type: "object",
        properties: { action: { type: "string", enum: ["upload_documents", "open_case_file"] } },
        required: ["action"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consult_analysts",
      description:
        "Ask four specialist analysts to work on the user's situation in parallel: visa pathways, points and eligibility, documents and evidence, timeline and status. Use for open questions about their options, plans or best way forward. Returns each analyst's report; you then write one answer from them.",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description: "What the user wants to know, with the key facts from the conversation.",
          },
        },
        required: ["question"],
      },
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
    case "read_document":
      return "Reading a document";
    case "save_story":
      return "Saving your story to your case file";
    case "show_button":
      return "Preparing a shortcut";
    case "consult_analysts":
      return "Consulting the analyst team";
    case "save_profile":
      return "Updating your profile";
    case "create_case":
      return "Saving your plan as a case";
    default:
      return name;
  }
}

function makeTools(supabase: SupabaseClient, emit: Emit) {
  const seen = new Map<number, number>();
  const searches = new Map<string, { results: unknown[] }>();
  let count = 0;

  return {
    async search_law(args: { query?: string; asAt?: string }) {
      const query = String(args.query ?? "").slice(0, 300);
      const key = `${query.toLowerCase().trim()}|${args.asAt ?? ""}`;
      const earlier = searches.get(key);
      if (earlier) return { note: "Same search as before: these are the same results, use them.", ...earlier };
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
          return {
            n,
            title: r.title,
            section,
            url: r.url,
            retrieved: r.version_fetched_at,
            text: r.content.slice(0, 2500),
          };
        },
      );
      searches.set(key, { results });
      return { results };
    },

    async get_case_file() {
      const { data, error } = await supabase.from("cases").select("title, facts, story, profile, updated_at")
        .order("created_at").limit(1).maybeSingle();
      if (error) return { error: error.message };
      if (!data) return { facts: {}, story: "", profile: {} };
      const profile = (data.profile ?? {}) as Profile;
      return {
        ...data,
        storyDates: datesVersusToday(`${data.story ?? ""}\n${JSON.stringify(profile)}`, todayISO()),
        missingSections: missingSections(profile),
      };
    },

    async list_documents() {
      const { data, error } = await supabase
        .from("documents")
        .select("id, filename, mime_type, size_bytes, created_at, folders(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      return error ? { error: error.message } : { documents: data };
    },

    async read_document(args: { id?: string }) {
      const { data: doc, error } = await supabase.from("documents").select(
        "filename, mime_type, size_bytes, storage_path",
      )
        .eq("id", String(args.id ?? "")).maybeSingle();
      if (error || !doc) return { error: error?.message ?? "No document with that id" };
      if (doc.size_bytes > MAX_DOCUMENT_BYTES) {
        return { filename: doc.filename, error: "Too large to read (over 15 MB)" };
      }
      const { data: file, error: dlError } = await supabase.storage.from(BUCKET).download(doc.storage_path);
      if (dlError || !file) return { filename: doc.filename, error: dlError?.message ?? "Download failed" };
      const text = await documentText(doc.mime_type, doc.filename, new Uint8Array(await file.arrayBuffer()));
      if (text === null) {
        return { filename: doc.filename, error: "This file type has no readable text (e.g. a photo or scan)." };
      }
      return {
        filename: doc.filename,
        text: text.slice(0, MAX_DOCUMENT_CHARS),
        truncated: text.length > MAX_DOCUMENT_CHARS,
      };
    },

    async save_story(args: { story?: string }) {
      const story = String(args.story ?? "").trim().slice(0, 8000);
      if (!story) return { error: "Empty story" };
      const { data: row } = await supabase.from("cases").select("id").order("created_at").limit(1).maybeSingle();
      if (!row) return { error: "No case file" };
      const { error } = await supabase.from("cases").update({ story, updated_at: new Date().toISOString() }).eq(
        "id",
        row.id,
      );
      return error ? { error: error.message } : { saved: true, storyDates: datesVersusToday(story, todayISO()) };
    },

    async save_profile(args: { profile?: unknown }) {
      const update = (args.profile ?? {}) as Profile;
      const { data: row } = await supabase.from("cases").select("id, profile").order("created_at").limit(1)
        .maybeSingle();
      if (!row) return { error: "No case file" };
      const profile = mergeProfile((row.profile ?? {}) as Profile, update);
      const { error } = await supabase.from("cases").update({ profile, updated_at: new Date().toISOString() })
        .eq("id", row.id);
      if (error) return { error: error.message };
      emit({ type: "profile" });
      return {
        saved: true,
        missingSections: missingSections(profile),
        dates: datesVersusToday(JSON.stringify(update), todayISO()),
      };
    },

    show_button(args: { action?: string }) {
      if (args.action !== "upload_documents" && args.action !== "open_case_file") {
        return Promise.resolve({ error: "Unknown action" });
      }
      emit({ type: "action", action: args.action });
      return Promise.resolve({ shown: true });
    },

    async assess_visas(args: { facts?: unknown }) {
      const { data } = await supabase.from("cases").select("facts, profile").order("created_at").limit(1).maybeSingle();
      // The date of birth the user gave in the chat counts too.
      const dob = (data?.profile as { personal?: { dateOfBirth?: string } } | null)?.personal?.dateOfBirth;
      const saved = caseFactsSchema.safeParse({ ...(dob ? { dateOfBirth: dob } : {}), ...(data?.facts ?? {}) });
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

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * Month-year dates in the text, split into past and upcoming relative to today. Models misjudge
 * whether e.g. "March 2026" has passed, so the tools hand them the comparison.
 */
export function datesVersusToday(text: string, today: string) {
  const [ty, tm] = today.split("-").map(Number);
  const found = new Map<string, number>(); // label → months from today
  const add = (label: string, y: number, m: number) => found.set(label, (y - ty) * 12 + (m - tm));
  for (
    const x of text.matchAll(
      /\b(\d{1,2}\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?,?\s+(\d{4})\b/gi,
    )
  ) {
    add(x[0].trim(), Number(x[3]), MONTHS.indexOf(x[2].toLowerCase()) + 1);
  }
  for (const x of text.matchAll(/\b(\d{4})-(\d{2})(-\d{2})?\b/g)) {
    if (Number(x[2]) >= 1 && Number(x[2]) <= 12) add(x[0], Number(x[1]), Number(x[2]));
  }
  const out = { today, past: [] as string[], thisMonth: [] as string[], upcoming: [] as string[] };
  for (const [label, diff] of found) (diff < 0 ? out.past : diff === 0 ? out.thisMonth : out.upcoming).push(label);
  return out;
}

/** Plain text of a PDF or text file; null for files without a text layer (images, scans, Word). */
export async function documentText(mime: string, filename: string, bytes: Uint8Array): Promise<string | null> {
  const name = filename.toLowerCase();
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const { text } = await extractText(await getDocumentProxy(bytes), { mergePages: true });
    const clean = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return clean || null;
  }
  if (mime.startsWith("text/") || /\.(txt|md|csv|json)$/.test(name)) return new TextDecoder().decode(bytes);
  return null;
}

/** One streamed completion. Emits text/reasoning deltas as they arrive; returns the full assistant turn. */
type ToolDef = (typeof toolDefs)[number];

async function complete(
  llm: LLMConfig,
  messages: Msg[],
  emit: Emit,
  signal: AbortSignal,
  defs: ToolDef[] | null = toolDefs,
) {
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
        ...(defs?.length ? { tools: defs, tool_choice: "auto" } : {}),
        stream: true,
        temperature: 0.1,
        max_tokens: MAX_OUTPUT_TOKENS,
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

type ToolFn = (a: Record<string, unknown>) => Promise<unknown>;

/**
 * Runs tool rounds until the model answers without calling a tool, or forces an answer after
 * `maxSteps` rounds. Returns the final answer text.
 */
async function runLoop(
  llm: LLMConfig,
  messages: Msg[],
  tools: Record<string, ToolFn>,
  defs: ToolDef[] | (() => ToolDef[]),
  emit: Emit,
  signal: AbortSignal,
  maxSteps: number,
  deadline = Infinity,
): Promise<string> {
  for (let step = 0; step < maxSteps; step++) {
    if (step > 0 && Date.now() > deadline) break;
    const { content, calls } = await complete(llm, messages, emit, signal, typeof defs === "function" ? defs() : defs);
    if (!calls.length) return content;
    messages.push({ role: "assistant", content: content || null, tool_calls: calls });
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch { /* model sent invalid JSON: run with no args */ }
      const label = stepLabel(call.function.name, args);
      emit({ type: "step", id: call.id, tool: call.function.name, label, status: "running" });
      const fn = tools[call.function.name];
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
    // The model answered and only saved things alongside: the answer stands. Asking it to continue
    // makes models repeat the whole answer.
    if (content.trim().length > 40 && calls.every((c) => BOOKKEEPING_TOOLS.has(c.function.name))) return content;
  }
  // Out of tool rounds: the model must now answer from what it has gathered. It may still save or
  // show a button (offering no tools makes some gateways answer with an error text instead).
  messages.push({
    role: "user",
    content: "Answer now using only the tool results above. Don't search or read anything more.",
  });
  const allowed = (typeof defs === "function" ? defs() : defs).filter((d) => BOOKKEEPING_TOOLS.has(d.function.name));
  const { content, calls } = await complete(llm, messages, emit, signal, allowed);
  for (const call of calls) {
    const fn = BOOKKEEPING_TOOLS.has(call.function.name) ? tools[call.function.name] : undefined;
    if (!fn) continue;
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(call.function.arguments || "{}");
    } catch {
      /* invalid JSON: skip */ continue;
    }
    const label = stepLabel(call.function.name, args);
    emit({ type: "step", id: call.id, tool: call.function.name, label, status: "running" });
    await fn(args).catch(() => undefined);
    emit({ type: "step", id: call.id, tool: call.function.name, label, status: "done" });
  }
  return content;
}

/** The lead agent: chats, uses tools, and can hand deep questions to the analyst team. */
export async function runAgent(
  llm: LLMConfig,
  supabase: SupabaseClient,
  messages: Msg[],
  emit: Emit,
  signal: AbortSignal,
  options: { chatId?: string } = {},
) {
  // Sources and analyst reports from this turn go into any Case the agent creates.
  const sources: Record<string, unknown>[] = [];
  let lastReports: unknown[] = [];
  const outer = emit;
  emit = (e) => {
    if (e.type === "source") sources.push({ n: e.n, title: e.title, section: e.section, url: e.url });
    outer(e);
  };
  const base = makeTools(supabase, emit) as unknown as Record<string, ToolFn>;
  const analystDefs = toolDefs.filter((d) => ANALYST_TOOLS.includes(d.function.name));
  let leadDefs: ToolDef[] = toolDefs;

  // The conversation so far, as plain text, so analysts know what was said.
  const transcript = () =>
    messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content)
      .slice(-8)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n\n");

  const consult_analysts: ToolFn = async (args) => {
    const question = String(args.question ?? "");
    const context = transcript();
    // Every analyst starts from the same facts about this user, not from memory or typical cases.
    const caseFile = JSON.stringify(await base.get_case_file({})).slice(0, 12000);
    const reports = await Promise.all(
      ANALYSTS.map(async (a, i) => {
        // Stagger starts a little: free model tiers rate-limit bursts.
        await new Promise((r) => setTimeout(r, i * 400));
        // Analysts' steps show in the UI under their name; their drafts don't stream to the user.
        const analystEmit: Emit = (e) => {
          if (e.type === "text" || e.type === "reasoning") return;
          if (e.type === "step") {
            emit({ ...e, id: `${a.id}:${e.id}`, agent: a.name, label: `${a.name}: ${e.label}` });
          } else emit(e);
        };
        const thread: Msg[] = [
          { role: "system", content: analystPrompt(a, todayISO()) },
          {
            role: "user",
            content:
              `Question: ${question}\n\nThis user's case file (profile, story, dates):\n${caseFile}\n\nConversation so far:\n${context}`,
          },
        ];
        try {
          const report = await runLoop(
            llm,
            thread,
            base,
            analystDefs,
            analystEmit,
            AbortSignal.any([signal, AbortSignal.timeout(ANALYST_HARD_MS)]),
            ANALYST_STEPS,
            Date.now() + ANALYST_BUDGET_MS,
          );
          return { analyst: a.name, report };
        } catch (e) {
          return { analyst: a.name, error: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    lastReports = reports;
    // From here the lead writes the answer from the reports; it can still save and show buttons.
    leadDefs = toolDefs.filter((d) => BOOKKEEPING_TOOLS.has(d.function.name));
    return { reports };
  };

  const create_case: ToolFn = async (args) => {
    const steps = (Array.isArray(args.steps) ? args.steps : []).map((s: Record<string, unknown>) => ({
      title: String(s.title ?? ""),
      detail: String(s.detail ?? ""),
      due: s.due ? String(s.due) : null,
      done: false,
    }));
    const { data, error } = await supabase.from("solutions").insert({
      chat_id: options.chatId ?? null,
      title: String(args.title ?? "Your plan").slice(0, 120),
      question: String(args.question ?? ""),
      summary: String(args.summary ?? ""),
      pathways: Array.isArray(args.pathways) ? args.pathways : [],
      steps,
      reports: lastReports,
      sources,
    }).select("id, title").single();
    if (error) return { error: error.message };
    emit({ type: "case", id: data.id, title: data.title });
    return { created: true, id: data.id };
  };

  await runLoop(
    llm,
    messages,
    { ...base, consult_analysts, create_case },
    () => leadDefs,
    emit,
    signal,
    MAX_STEPS,
    Date.now() + TURN_BUDGET_MS,
  );
}
