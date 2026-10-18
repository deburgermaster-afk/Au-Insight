// Imports the Jobs and Skills Australia shortage history and employment projections spreadsheets saved on
// disk (history.xlsx, projections.xlsx; see FILES in history.ts), for when JSA's CDN refuses this network:
//   deno run -A data-import/local_history.ts <dir> [--dry-run]
// Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN (the worker functions check the token).

import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { importHistory, readHistoryWorkbooks } from "./history.ts";

const [dir, flag] = Deno.args;
if (!dir) throw new Error("usage: local_history.ts <dir> [--dry-run]");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!, {
  auth: { persistSession: false },
});
const result = await importHistory(
  db,
  Deno.env.get("WORKER_TOKEN")!,
  flag === "--dry-run",
  () => readHistoryWorkbooks(dir),
);
console.log(JSON.stringify(result, null, 1).slice(0, 6000));
if (!result.ok) Deno.exit(1);
