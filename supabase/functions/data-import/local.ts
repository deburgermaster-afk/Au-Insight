// Imports Jobs and Skills Australia spreadsheets saved on disk (see readWorkbooks in jsa.ts):
//   deno run -A data-import/local.ts <dir> [--dry-run]
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN (the worker functions check the token).

import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { importJsa, readWorkbooks } from "./jsa.ts";

const [dir, flag] = Deno.args;
if (!dir) throw new Error("usage: local.ts <dir> [--dry-run]");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
  auth: { persistSession: false },
});
const result = await importJsa(db, Deno.env.get("WORKER_TOKEN")!, flag === "--dry-run", () => readWorkbooks(dir));
console.log(JSON.stringify(result, null, 1).slice(0, 3000));
if (!result.ok) Deno.exit(1);
