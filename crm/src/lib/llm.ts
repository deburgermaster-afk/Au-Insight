import "server-only";
import { z } from "zod";

// xKiro's OpenAI-compatible gateway, the same provider Immi Insight's chat uses. Models are tried
// in order; rate limits, provider errors and unparseable answers move on to the next one.
const BASE = (process.env.LLM_BASE_URL ?? "https://api.xkiro.com/v1").replace(/\/$/, "");
const MODELS = (process.env.LLM_MODEL ?? "qwen/qwen3.7-max:free,qwen/qwen3.8-max:free,cohere/command-a-plus")
  .split(",")
  .map((m) => m.trim())
  .filter((m) => m && !m.startsWith("@"));

/** Models that read images (document checks), tried in order. */
const VISION_MODELS = (process.env.LLM_VISION_MODEL ?? "qwen/qwen3.8-max:free,qwen/qwen3-vl-plus:free,mistralai/mistral-medium-3.5")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

export const llmEnabled = () => Boolean(process.env.LLM_API_KEY);

/** Pulls the first JSON object out of a model reply (tolerates code fences and preamble). */
function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1));
  } catch {
    return null;
  }
}

/**
 * Asks for a JSON answer matching [schema]. Returns the parsed value and the model that produced
 * it, or null when no model gave a valid answer.
 */
export async function completeJson<T extends z.ZodType>(schema: T, system: string, user: string, opts: { timeoutMs?: number; images?: string[]; maxTokens?: number } = {}): Promise<{ value: z.infer<T>; model: string } | null> {
  const key = process.env.LLM_API_KEY;
  if (!key) return null;
  const shape = JSON.stringify(z.toJSONSchema(schema));
  const messages = [
    { role: "system", content: `${system}\n\nReply with one JSON object only, no prose and no code fences, matching this JSON Schema:\n${shape}` },
    { role: "user", content: opts.images?.length ? [{ type: "text", text: user }, ...opts.images.map((url) => ({ type: "image_url", image_url: { url } }))] : user },
  ];
  for (const model of opts.images?.length ? VISION_MODELS : MODELS) {
    try {
      const res = await fetch(`${BASE}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: opts.maxTokens ?? 6000, response_format: { type: "json_object" } }),
        signal: AbortSignal.timeout(opts.timeoutMs ?? 90_000),
      });
      if (!res.ok) {
        console.error(`llm: ${model} ${res.status} ${(await res.text()).slice(0, 200)}`);
        continue;
      }
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const parsed = schema.safeParse(extractJson(body.choices?.[0]?.message?.content ?? ""));
      if (parsed.success) return { value: parsed.data, model };
      console.error(`llm: ${model} returned JSON that doesn't match`, parsed.error.issues.slice(0, 3));
    } catch (e) {
      console.error(`llm: ${model} failed`, e instanceof Error ? e.message : e);
    }
  }
  return null;
}
