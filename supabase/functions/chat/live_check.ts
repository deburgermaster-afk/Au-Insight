// Manual end-to-end check against the real model and database (not part of CI).
// deno run -A chat/live_check.ts <email> <password-file> <llm-key-file> "<question>"
import { createClient } from "@supabase/supabase-js";
import { todayISO } from "../_shared/engine/index.ts";
import { runAgent } from "./agent.ts";
import { systemPrompt } from "./prompt.ts";

const [email, pwFile, keyFile, question] = Deno.args;
const supabase = createClient("https://rzwntsessjeofmhwudhe.supabase.co", "sb_publishable_hkd8Y3eV1g4Rg6c7WHwx9w_Q6MVBH7m");
const { error } = await supabase.auth.signInWithPassword({ email, password: (await Deno.readTextFile(pwFile)).trim() });
if (error) throw error;

let text = "";
const t0 = Date.now();
await runAgent(
  {
    baseUrl: "https://api.xkiro.com/v1",
    apiKey: (await Deno.readTextFile(keyFile)).trim(),
    models: (Deno.env.get("LLM_MODEL") ?? "cohere/command-a-plus").split(","),
  },
  supabase,
  [{ role: "system", content: systemPrompt(todayISO()) }, { role: "user", content: question }],
  (e) => {
    if (e.type === "text") text += e.delta;
    else if (e.type === "step" && e.status === "done") console.log(`step  ${e.label}  hits=${JSON.stringify(e.hits ?? []).slice(0, 160)}`);
    else if (e.type === "decision") {
      for (const r of e.results as { subclass: string; outcome: string; points?: { min: number; max: number } }[]) {
        console.log(`decision ${r.subclass} ${r.outcome} points=${r.points?.min}-${r.points?.max}`);
      }
    } else if (e.type === "error") console.log("error", e.message);
  },
  new AbortController().signal,
);
console.log(`\n--- answer (${((Date.now() - t0) / 1000).toFixed(1)}s) ---\n${text}`);
await supabase.auth.signOut();
