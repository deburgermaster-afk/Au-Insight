import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * Any OpenAI-compatible provider works: Groq, OpenRouter, xAI, Moonshot (Kimi),
 * Mistral, Together, or a self-hosted vLLM. Set LLM_BASE_URL / LLM_API_KEY / LLM_MODEL.
 *
 * Privacy: case files contain personal information. Use a provider/plan that
 * does not train on or retain API inputs.
 */
const llm = createOpenAICompatible({
  name: "llm",
  baseURL: process.env.LLM_BASE_URL ?? "https://api.groq.com/openai/v1",
  apiKey: process.env.LLM_API_KEY,
});

export const chatModel = llm(process.env.LLM_MODEL ?? "openai/gpt-oss-120b");

const embeddings = process.env.EMBEDDING_BASE_URL
  ? createOpenAICompatible({
      name: "embeddings",
      baseURL: process.env.EMBEDDING_BASE_URL,
      apiKey: process.env.EMBEDDING_API_KEY,
    })
  : null;

/** Must produce 1024-dimension vectors, matching law_sections.embedding. */
export const embeddingModel =
  embeddings && process.env.EMBEDDING_MODEL ? embeddings.embeddingModel(process.env.EMBEDDING_MODEL) : null;
