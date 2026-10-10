// Labour market data importer: downloads Jobs and Skills Australia spreadsheets and loads them into the
// occupation_shortage and occupation_profiles tables (see jsa.ts). JSA's server drops connections from the
// worker's network, so this runs as an edge function, deployed with verify_jwt off: it checks the worker
// token itself.
//
//   POST /functions/v1/data-import  {"source": "jsa"}          import now
//   POST ... {"source": "jsa", "dry_run": true}                parse only, return counts and samples
//   header x-worker-token: <WORKER_TOKEN>   (checked with the worker_token_ok database function)

import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { importJsa } from "./jsa.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const token = req.headers.get("x-worker-token") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const db = createClient(url, key, { auth: { persistSession: false } });
  const ok = await db.rpc("worker_token_ok", { p_token: token });
  if (ok.data !== true) return json({ error: "a valid x-worker-token header is required" }, 401);
  const body = await req.json().catch(() => ({})) as { source?: string; dry_run?: boolean };
  if (body.source !== "jsa") return json({ error: 'unknown source; use {"source": "jsa"}' }, 400);
  const result = await importJsa(db, token, body.dry_run === true);
  return json(result, result.ok ? 200 : 500);
});
