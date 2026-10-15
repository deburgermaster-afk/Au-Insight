// Watches the SkillSelect invitation rounds page and imports a new or updated round within minutes
// of Home Affairs publishing it (the Python crawler in worker/ only refreshes rounds weekly).
// Every run fetches the page and hashes its content; only a changed page is parsed and written,
// through the same token-checked worker_occupations_* functions the crawler uses.

import { contentHtml, parseRounds, schemaField } from "./parse.js";

const ROUNDS_URL = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds";
const BROWSER = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  "Accept-Language": "en-AU,en;q=0.9",
};
const HASH_KEY = "rounds_watch_hash";

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function supabase(env) {
  const base = env.SUPABASE_URL.replace(/\/$/, "");
  const headers = { apikey: env.SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" };
  return {
    async select(path) {
      const res = await fetch(`${base}/rest/v1/${path}`, { headers });
      if (!res.ok) throw new Error(`read ${path}: ${res.status} ${await res.text()}`);
      return res.json();
    },
    async rpc(fn, params) {
      const res = await fetch(`${base}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify({ p_token: env.WORKER_TOKEN, ...params }) });
      if (!res.ok) throw new Error(`${fn}: ${res.status} ${(await res.text()).slice(0, 300)}`);
      return res.status === 204 ? null : res.json();
    },
  };
}

export async function check(env, { force = false } = {}) {
  const db = supabase(env);
  const res = await fetch(ROUNDS_URL, { headers: BROWSER, cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`Home Affairs page: ${res.status}`);
  const field = schemaField(await res.text());
  if (!field) throw new Error("Home Affairs page: content field not found (layout changed?)");
  const hash = await sha256(field);
  const [seen] = await db.select(`skillselect_meta?select=value&key=eq.${HASH_KEY}`);
  if (!force && seen?.value === hash) return { changed: false };

  const data = parseRounds(contentHtml(field), ROUNDS_URL);
  if (!data.rounds.length) throw new Error("Home Affairs page changed but no invitation round was found in it");
  const run = "skillselect-cf-" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const upsert = (kind, rows) => (rows.length ? db.rpc("worker_occupations_upsert", { p_kind: kind, p_rows: rows, p_run: run }) : 0);
  try {
    const counts = {
      rounds_written: await upsert("rounds", data.rounds),
      round_occupations_written: await upsert("round_occupations", data.occupations),
      meta_written: await upsert("meta", Object.entries(data.meta).map(([key, value]) => ({ key, value }))),
      state_nominations_written: await upsert("state_nominations", data.nominations),
      source_fetched_at: new Date().toISOString(),
      via: "cloudflare rounds-watch",
    };
    const result = await db.rpc("worker_occupations_finish", { p_kind: "skillselect", p_run: run, p_counts: counts });
    // Only remember the page once it is fully imported, so a failed import is retried next run.
    await upsert("meta", [{ key: HASH_KEY, value: hash }]);
    const latest = data.rounds.reduce((a, b) => (b.round_date > a.round_date ? b : a));
    return { changed: true, latest_round: latest.round_date, rounds: data.rounds.length, occupations: data.occupations.length, result };
  } catch (e) {
    await db.rpc("worker_occupations_finish", { p_kind: "skillselect", p_run: run, p_error: String(e).slice(0, 1500) }).catch(() => {});
    throw e;
  }
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(check(env).then((r) => console.log(JSON.stringify(r)), (e) => console.error("rounds-watch failed:", e)));
  },
  // GET /           latest round in the database (public data)
  // POST /run       check now; with ?force=1 re-import even if unchanged (needs Authorization: Bearer RUN_KEY)
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/run") {
      if (!env.RUN_KEY || request.headers.get("authorization") !== `Bearer ${env.RUN_KEY}`) return new Response("Unauthorized", { status: 401 });
      try {
        return Response.json(await check(env, { force: url.searchParams.get("force") === "1" }));
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 502 });
      }
    }
    const db = supabase(env);
    const [latest] = await db.select("skillselect_rounds?select=round_date,subclass,invited,min_points,updated_at&order=round_date.desc,subclass.asc&limit=1");
    const [next] = await db.select("skillselect_meta?select=key,value&key=like.next_round_*&key=not.like.*_text&order=key");
    return Response.json({ latest_round: latest ?? null, next_round: next ?? null, checks: "every 10 minutes", source: ROUNDS_URL });
  },
};
