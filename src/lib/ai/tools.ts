import "server-only";
import { embed, tool, type UIMessageStreamWriter } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assessAll, caseFactsSchema, todayISO, type CaseFacts } from "@/lib/engine";
import { embeddingModel } from "./model";

export type LawHit = {
  n: number;
  title: string;
  section: string;
  url: string;
  inForceFrom: string;
  text: string;
};

/**
 * Every tool here only reads. The agent cannot write, update or delete:
 * it queries as the signed-in user (row-level security applies), and only
 * through these functions. Saving facts or assessments is done by the user
 * in the UI, never by the model.
 */
export function createTools(supabase: SupabaseClient, writer: UIMessageStreamWriter) {
  let sourceCount = 0;
  const seen = new Map<number, number>();

  return {
    search_law: tool({
      description:
        "Search the official corpus (Home Affairs pages, Migration Act 1958, Migration Regulations 1994) for the provisions relevant to a question. Returns numbered sources to cite as [n].",
      inputSchema: z.object({
        query: z.string().describe("Focused search terms, e.g. 'subclass 189 age invitation 45'"),
        asAt: z.iso.date().optional().describe("Search the law in force on this date (e.g. application date). Defaults to today."),
      }),
      execute: async ({ query, asAt }) => {
        const queryEmbedding = embeddingModel
          ? (await embed({ model: embeddingModel, value: query, dimensions: 1024 })).embedding
          : null;
        const { data, error } = await supabase.rpc("search_law", {
          query_text: query,
          query_embedding: queryEmbedding ? JSON.stringify(queryEmbedding) : null,
          match_count: 6,
          as_at: asAt ?? new Date().toISOString(),
        });
        if (error) return { error: error.message, results: [] as LawHit[] };

        const results: LawHit[] = (data ?? []).map(
          (r: { section_id: number; title: string; heading_path: string[]; url: string; version_fetched_at: string; content: string }) => {
            let n = seen.get(r.section_id);
            if (n === undefined) {
              n = ++sourceCount;
              seen.set(r.section_id, n);
              writer.write({
                type: "source-url",
                sourceId: `law-${r.section_id}`,
                url: r.url,
                title: `[${n}] ${r.title} — ${r.heading_path.slice(1).join(" › ")}`,
              });
            }
            return {
              n,
              title: r.title,
              section: r.heading_path.slice(1).join(" › "),
              url: r.url,
              inForceFrom: r.version_fetched_at,
              text: r.content.slice(0, 2500),
            };
          },
        );
        return { results };
      },
    }),

    get_case_file: tool({
      description: "Read the facts the user has saved in their case file.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase.from("cases").select("id, title, facts, updated_at").order("created_at").limit(1).maybeSingle();
        if (error) return { error: error.message };
        return data ?? { facts: {} };
      },
    }),

    list_documents: tool({
      description: "List the user's uploaded documents and any facts extracted from them.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabase
          .from("documents")
          .select("filename, mime_type, status, extracted, created_at, folders(name)")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) return { error: error.message };
        return { documents: data };
      },
    }),

    assess_visas: tool({
      description:
        "Run the deterministic rules engine for skilled visas (189, 190, 491). Pass every fact known from the case file and the conversation. Returns the decision per visa, each criterion with its status and source, the points range, and the questions that would settle anything unknown.",
      inputSchema: z.object({ facts: caseFactsSchema }),
      execute: async ({ facts }) => {
        const { data } = await supabase.from("cases").select("facts").order("created_at").limit(1).maybeSingle();
        const saved = caseFactsSchema.safeParse(data?.facts ?? {});
        const merged: CaseFacts = { ...(saved.success ? saved.data : {}), ...facts };
        return { assessedAt: merged.assessmentDate ?? todayISO(), results: assessAll(merged) };
      },
    }),
  };
}
