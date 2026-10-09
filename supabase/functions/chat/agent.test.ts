import { expect } from "jsr:@std/expect@1";
import type { SupabaseClient } from "@supabase/supabase-js";
import { datesVersusToday, documentDigest, documentText, type Msg, runAgent, SHOWN_ALREADY } from "./agent.ts";
import { mergeProfile, missingSections } from "./profile.ts";

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
            delta: {
              tool_calls: [{
                index: 0,
                id: "call_1",
                function: { name: "assess_visas", arguments: args.slice(0, 20) },
              }],
            },
          }],
        },
        { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: args.slice(20) } }] } }] },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 1,
                id: "call_2",
                function: { name: "search_law", arguments: '{"query":"age 45"}' },
              }],
            },
          }],
        },
      ]);
    }
    return sse([{ choices: [{ delta: { content: "Eligible for the 189 " } }] }, {
      choices: [{ delta: { content: "[1]." } }],
    }]);
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

// A one-page PDF with a text layer, built by hand so the test needs no fixture file.
function tinyPdf(text: string) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((o, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

Deno.test("reads text from PDFs and text files, not images", async () => {
  expect(await documentText("application/pdf", "grant.pdf", tinyPdf("Visa grant notice subclass 500"))).toContain(
    "Visa grant notice subclass 500",
  );
  expect(await documentText("text/plain", "notes.txt", new TextEncoder().encode("arrived 2019"))).toBe("arrived 2019");
  expect(await documentText("image/jpeg", "passport.jpg", new Uint8Array([1, 2, 3]))).toBeNull();
});

Deno.test("tells past dates from upcoming ones", () => {
  const d = datesVersusToday(
    "485 granted March 2021, extended to Mar 2026. Passport expires 2027-01-05. Moved Oct 2026.",
    "2026-10-09",
  );
  expect(d.past).toEqual(["March 2021", "Mar 2026"]);
  expect(d.thisMonth).toEqual(["Oct 2026"]);
  expect(d.upcoming).toEqual(["2027-01-05"]);
});

Deno.test("consults four analysts in parallel and answers from their reports", async () => {
  const analystSystems: string[] = [];
  let leadCalls = 0;
  const sse = (chunks: unknown[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    const body = await req.json();
    const system = body.messages[0].content as string;
    if (system.includes("Immi Insight's Australian migration team")) {
      analystSystems.push(system);
      expect(body.tools.map((t: { function: { name: string } }) => t.function.name)).not.toContain("consult_analysts");
      return sse([{ choices: [{ delta: { content: `report from ${system.match(/You are the (.+?) on/)?.[1]}` } }] }]);
    }
    leadCalls++;
    if (leadCalls === 1) {
      return sse([{
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "c1",
              function: { name: "consult_analysts", arguments: '{"question":"What are my options?"}' },
            }],
          },
        }],
      }]);
    }
    const tool = body.messages.find((m: { role: string }) => m.role === "tool");
    const reports = JSON.parse(tool.content).reports as { analyst: string; report: string }[];
    return sse([{
      choices: [{ delta: { content: `${reports.length} reports: ${reports.map((r) => r.report).join("; ")}` } }],
    }]);
  });
  const events: Record<string, unknown>[] = [];
  try {
    await runAgent(
      { baseUrl: `http://localhost:${server.addr.port}`, apiKey: "k", models: ["m"] },
      supabase,
      [{ role: "system", content: "lead" }, { role: "user", content: "What are my options?" }],
      (e) => events.push(e),
      new AbortController().signal,
    );
  } finally {
    await server.shutdown();
  }
  expect(analystSystems.length).toBe(4);
  const text = events.filter((e) => e.type === "text").map((e) => e.delta).join("");
  expect(text).toContain("4 reports");
  expect(text).toContain("report from Pathways analyst");
  // Analysts' own drafts never stream to the user.
  expect(text.match(/report from/g)?.length).toBe(4);
  expect(events.filter((e) => e.type === "step" && e.status === "done").map((e) => e.tool)).toEqual([
    "consult_analysts",
  ]);
});

Deno.test("merges intake answers into the profile and reports what's missing", () => {
  const saved = { arrival: { date: "2019-02", visa: "500" }, study: [{ provider: "A", course: "Diploma" }] };
  const merged = mergeProfile(saved, {
    arrival: { city: "Melbourne" },
    study: [{ provider: "A", course: "Diploma", status: "transferred" }, { provider: "B", changedFrom: "A" }],
    partner: { has: false },
  });
  expect(merged.arrival).toEqual({ date: "2019-02", visa: "500", city: "Melbourne" });
  expect((merged.study as unknown[]).length).toBe(2);
  expect(missingSections(merged)).toEqual(["personal", "residence", "currentVisa", "work", "english", "goals"]);
});

Deno.test("saves the plan as a Case with the turn's sources and analyst reports", async () => {
  const inserted: Record<string, unknown>[] = [];
  const db = {
    ...supabase,
    from: (table: string) => {
      if (table !== "solutions") return supabase.from(table);
      return {
        insert: (row: Record<string, unknown>) => {
          inserted.push(row);
          return {
            select: () => ({
              single: () => Promise.resolve({ data: { id: "case-1", title: row.title }, error: null }),
            }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  let call = 0;
  const sse = (chunks: unknown[]) =>
    new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
  const tool = (name: string, args: unknown) =>
    sse([{
      choices: [{
        delta: { tool_calls: [{ index: 0, id: `c${call}`, function: { name, arguments: JSON.stringify(args) } }] },
      }],
    }]);
  const server = Deno.serve({ port: 0, onListen() {} }, () => {
    call++;
    if (call === 1) return tool("search_law", { query: "190" });
    if (call === 2) {
      return tool("create_case", {
        title: "Path to PR via 190",
        summary: "Apply for NSW nomination [1].",
        steps: [{ title: "Lodge EOI", due: "2026-11-01" }],
      });
    }
    return sse([{ choices: [{ delta: { content: "Saved under Cases." } }] }]);
  });
  const events: Record<string, unknown>[] = [];
  try {
    await runAgent(
      { baseUrl: `http://localhost:${server.addr.port}`, apiKey: "k", models: ["m"] },
      db,
      [{ role: "user", content: "Give me a plan" }],
      (e) => events.push(e),
      new AbortController().signal,
      { chatId: "chat-9" },
    );
  } finally {
    await server.shutdown();
  }
  expect(inserted[0]).toMatchObject({
    chat_id: "chat-9",
    title: "Path to PR via 190",
    steps: [{ title: "Lodge EOI", detail: "", due: "2026-11-01", done: false }],
    sources: [{ n: 1, title: "Skilled Independent visa" }],
  });
  expect(events.find((e) => e.type === "case")).toEqual({ type: "case", id: "case-1", title: "Path to PR via 190" });
});

Deno.test("after an answer with only bookkeeping calls, the model goes on without repeating it", async () => {
  const bodies: { messages: { role: string; content: string | null }[] }[] = [];
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    bodies.push(await req.json());
    // First the answer plus a button, then nothing more to add.
    const chunks = bodies.length === 1
      ? [
        { choices: [{ delta: { content: "Here is your full plan, step by step, with every detail you need." } }] },
        {
          choices: [{
            delta: {
              tool_calls: [{
                index: 0,
                id: "s1",
                function: { name: "show_button", arguments: '{"action":"upload_documents"}' },
              }],
            },
          }],
        },
      ]
      : [{ choices: [{ delta: { content: "" } }] }];
    return new Response(chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n");
  });
  const events: Record<string, unknown>[] = [];
  try {
    await runAgent(
      { baseUrl: `http://localhost:${server.addr.port}`, apiKey: "k", models: ["m"] },
      supabase,
      [{ role: "user", content: "plan?" }],
      (e) => events.push(e),
      new AbortController().signal,
    );
  } finally {
    await server.shutdown();
  }
  expect(bodies.length).toBe(2);
  expect(bodies[1].messages.at(-1)).toEqual({ role: "user", content: SHOWN_ALREADY });
  expect(events.filter((e) => e.type === "action")).toEqual([{ type: "action", action: "upload_documents" }]);
  expect(events.filter((e) => e.type === "text").map((e) => e.delta).join("")).toBe(
    "Here is your full plan, step by step, with every detail you need.",
  );
});

Deno.test("documentDigest gives every document a share of the context and marks unread ones", () => {
  const digest = documentDigest([
    { id: "a", filename: "CoE.pdf", extracted_text: "Course:   Advanced Diploma\n\n\nEnd date: 27 November 2026" },
    { id: "b", filename: "photo.jpg", status: "failed", extracted_text: null },
    { id: "c", filename: "long.pdf", extracted_text: "x".repeat(50000) },
  ]);
  expect(digest).toContain("### CoE.pdf (id a)\nCourse: Advanced Diploma\nEnd date: 27 November 2026");
  expect(digest).toContain("### photo.jpg (id b)\n[could not be read]");
  expect(digest).toContain("[… shortened; read_document has the full text]");
  expect(digest.length).toBeLessThan(6000);
});

Deno.test("routes @provider models and sends Gemini thought signatures back", async () => {
  const bodies: { model: string; messages: { role: string; tool_calls?: { extra_content?: unknown }[] }[] }[] = [];
  let call = 0;
  const server = Deno.serve({ port: 0, onListen() {} }, async (req) => {
    bodies.push(await req.json());
    call++;
    const chunk = call === 1
      ? {
        choices: [{
          delta: {
            tool_calls: [{
              index: 0,
              id: "g1",
              extra_content: { google: { thought_signature: "sig-1" } },
              function: { name: "search_law", arguments: '{"query":"age"}' },
            }],
          },
        }],
      }
      : { choices: [{ delta: { content: "done" } }] };
    return new Response(`data: ${JSON.stringify(chunk)}\n\ndata: [DONE]\n\n`);
  });
  try {
    await runAgent(
      {
        baseUrl: "http://127.0.0.1:9",
        apiKey: "unused",
        models: ["@gemini/gemini-test"],
        providers: { gemini: { baseUrl: `http://localhost:${server.addr.port}`, apiKey: "g" } },
      },
      supabase,
      [{ role: "user", content: "age limit?" }],
      () => {},
      new AbortController().signal,
    );
  } finally {
    await server.shutdown();
  }
  expect(bodies[0].model).toBe("gemini-test");
  const assistant = bodies[1].messages.find((m) => m.role === "assistant");
  expect(assistant?.tool_calls?.[0].extra_content).toEqual({ google: { thought_signature: "sig-1" } });
});
