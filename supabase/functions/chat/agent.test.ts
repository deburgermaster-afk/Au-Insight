import { expect } from "jsr:@std/expect@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type Msg, runAgent } from "./agent.ts";

// A fake OpenAI-compatible server: 1st call streams a tool call (arguments split
// across chunks, as real providers do), 2nd call streams the final answer.
function fakeModel() {
  let calls = 0;
  const bodies: unknown[] = [];
  const sse = (chunks: unknown[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n", {
      headers: { "Content-Type": "text/event-stream" },
    });
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    bodies.push(await req.json());
    calls++;
    if (calls === 1) {
      const args = JSON.stringify({
        facts: { dateOfBirth: "1992-03-15", assessmentDate: "2026-10-01", englishLevel: "superior" },
      });
      return sse([
        { choices: [{ delta: { reasoning: "Need the engine." } }] },
        {
          choices: [{
            delta: { tool_calls: [{ index: 0, id: "call_1", function: { name: "assess_visas", arguments: args.slice(0, 20) } }] },
          }],
        },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(20) } }] } }] },
        {
          choices: [{
            delta: {
              tool_calls: [{ index: 1, id: "call_2", function: { name: "search_law", arguments: '{"query":"age 45"}' } }],
            },
          }],
        },
      ]);
    }
    return sse([{ choices: [{ delta: { content: "Eligible for the 189 " } }] }, { choices: [{ delta: { content: "[1]." } }] }]);
  });
  return { server, bodies, url: `http://localhost:${server.addr.port}` };
}

// Just enough of the Supabase client for the tools.
const supabase = {
  rpc: () =>
    Promise.resolve({
      data: [{
        section_id: 7,
        title: "Skilled Independent visa",
        heading_path: ["Skilled Independent visa", "Eligibility", "Be this age"],
        url: "https://immi.homeaffairs.gov.au/x",
        content: "Under 45",
        version_fetched_at: "2026-10-09",
      }],
      error: null,
    }),
  from: () => {
    const q = {
      select: () => q,
      order: () => q,
      limit: () => q,
      maybeSingle: () =>
        Promise.resolve({
          data: {
            facts: {
              occupationLists: ["MLTSSL"],
              positiveSkillsAssessment: true,
              overseasSkilledYears: 8,
              australianSkilledYears: 0,
              highestQualification: "bachelor_or_masters",
              partnerStatus: "single",
              invitationReceived: true,
              specialistEducation: false,
              australianStudyRequirement: false,
              professionalYear: false,
              credentialledCommunityLanguage: false,
              regionalStudy: false,
              meetsHealth: true,
              meetsCharacter: true,
              hasCommonwealthDebt: false,
            },
          },
          error: null,
        }),
    };
    return q;
  },
} as unknown as SupabaseClient;

Deno.test("agent runs tools, streams events and answers", async () => {
  const model = fakeModel();
  const events: Record<string, unknown>[] = [];
  const messages: Msg[] = [{ role: "system", content: "test" }, { role: "user", content: "Am I eligible?" }];
  try {
    await runAgent(
      { baseUrl: model.url, apiKey: "k", models: ["m"] },
      supabase,
      messages,
      (e) => events.push(e),
      new AbortController().signal,
    );
  } finally {
    await model.server.shutdown();
  }

  const types = events.map((e) => e.type);
  expect(types[0]).toBe("reasoning");
  expect(events.filter((e) => e.type === "step").map((e) => `${e.tool}:${e.status}`)).toEqual([
    "assess_visas:running",
    "assess_visas:done",
    "search_law:running",
    "search_law:done",
  ]);

  // Saved case file + facts from the conversation → the engine decides 189 eligible.
  const decision = events.find((e) => e.type === "decision") as { results: { subclass: string; outcome: string }[] };
  expect(decision.results.find((r) => r.subclass === "189")?.outcome).toBe("eligible");

  expect(events.find((e) => e.type === "source")).toMatchObject({ n: 1, section: "Eligibility › Be this age" });
  expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe("Eligible for the 189 [1].");

  // The second model call received both tool results.
  const second = model.bodies[1] as { messages: { role: string; tool_call_id?: string }[] };
  expect(second.messages.filter((m) => m.role === "tool").map((m) => m.tool_call_id)).toEqual(["call_1", "call_2"]);
});

Deno.test("falls back to the next model when one is rate-limited", async () => {
  const seen: string[] = [];
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    const body = await req.json();
    seen.push(body.model);
    if (body.model === "busy") return new Response("rate limited", { status: 429 });
    return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: "ok" } }] })}\n\ndata: [DONE]\n\n`);
  });
  const events: Record<string, unknown>[] = [];
  try {
    await runAgent(
      { baseUrl: `http://localhost:${server.addr.port}`, apiKey: "k", models: ["busy", "next"] },
      supabase,
      [{ role: "user", content: "hi" }],
      (e) => events.push(e),
      new AbortController().signal,
    );
  } finally {
    await server.shutdown();
  }
  expect(seen).toEqual(["busy", "next"]);
  expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe("ok");
});
