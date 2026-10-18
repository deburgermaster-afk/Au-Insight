import "server-only";
import { eq, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

// Home Affairs' published processing times (50% and 90% of applications decided), copied daily from
// Immi Insight, which reads them from the Department's global processing times guide each week.

const URL = process.env.INSIGHT_SUPABASE_URL ?? "https://rzwntsessjeofmhwudhe.supabase.co";
const KEY = process.env.INSIGHT_SUPABASE_KEY ?? "sb_publishable_hkd8Y3eV1g4Rg6c7WHwx9w_Q6MVBH7m";

type Row = { subclass: string; stream: string; visa_name: string | null; p50: string | null; p90: string | null; p50_days: number | null; p90_days: number | null; as_at: string | null; source_url: string | null };

/** Copies the latest figures into Lodgely. Returns how many rows were written. */
export async function syncProcessingTimes() {
  const res = await fetch(`${URL}/rest/v1/visa_processing_times?select=subclass,stream,visa_name,p50,p90,p50_days,p90_days,as_at,source_url&listed=eq.true`, { headers: { apikey: KEY } });
  if (!res.ok) throw new Error(`Insight ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const rows = (await res.json()) as Row[];
  if (!rows.length) return 0;
  // Several Home Affairs entries can share subclass + stream name: keep the one with figures.
  const byKey = new Map<string, Row>();
  for (const r of rows) {
    const k = `${r.subclass}|${r.stream ?? ""}`;
    const cur = byKey.get(k);
    if (!cur || (cur.p50_days == null && r.p50_days != null)) byKey.set(k, r);
  }
  const values = [...byKey.values()].map((r) => ({ subclass: r.subclass, stream: r.stream ?? "", visaName: r.visa_name, p50: r.p50, p90: r.p90, p50Days: r.p50_days, p90Days: r.p90_days, asAt: r.as_at, sourceUrl: r.source_url, fetchedAt: new Date() }));
  for (let i = 0; i < values.length; i += 100) {
    await db
      .insert(s.processingTimes)
      .values(values.slice(i, i + 100))
      .onConflictDoUpdate({ target: [s.processingTimes.subclass, s.processingTimes.stream], set: { visaName: sql`excluded.visa_name`, p50: sql`excluded.p50`, p90: sql`excluded.p90`, p50Days: sql`excluded.p50_days`, p90Days: sql`excluded.p90_days`, asAt: sql`excluded.as_at`, sourceUrl: sql`excluded.source_url`, fetchedAt: sql`excluded.fetched_at` } });
  }
  return values.length;
}

/** Lodgely visa code → Home Affairs subclass and (optional) stream hint. */
function lookupKey(code: string): { subclass: string; stream?: string } {
  if (code === "189-NZ") return { subclass: "189", stream: "new zealand" };
  if (code === "482-LA") return { subclass: "482", stream: "labour agreement" };
  if (code.startsWith("CIT")) return { subclass: "citizenship" };
  return { subclass: code.split("/")[0] };
}

export type LiveTime = { p50Months: number; p90Months: number; p50: string; p90: string; asAt: string | null; stream: string; sourceUrl: string | null };

/** The published time for a visa (and stream when it matches the matter's), or null when none is published. */
export async function liveProcessing(code: string, matterStream?: string | null): Promise<LiveTime | null> {
  const k = lookupKey(code);
  const rows = (await db.select().from(s.processingTimes).where(eq(s.processingTimes.subclass, k.subclass))).filter((r) => r.p50Days != null && r.p90Days != null);
  if (!rows.length) return null;
  const want = (matterStream ?? k.stream ?? "").toLowerCase();
  const words = want.split(/[^a-z]+/).filter((w) => w.length > 3);
  // Without a matching stream: the visa's main stream, not special ones (New Zealand, Hong Kong, closed
  // or transitional streams); among several, the median by 50% time.
  const special = /new zealand|hong kong|transition|closed|retirement/i;
  const main = rows.filter((r) => !special.test(r.stream));
  const pool = main.length ? main : rows;
  const median = [...pool].sort((a, b) => (a.p50Days ?? 0) - (b.p50Days ?? 0))[Math.floor((pool.length - 1) / 2)];
  const pick = (want && rows.find((r) => r.stream.toLowerCase() === want)) || (words.length && rows.find((r) => words.some((w) => r.stream.toLowerCase().includes(w)))) || pool.find((r) => !r.stream) || pool.find((r) => /points|standard|general|direct entry/i.test(r.stream)) || median;
  return { p50Months: pick.p50Days! / 30.4, p90Months: pick.p90Days! / 30.4, p50: pick.p50 ?? "", p90: pick.p90 ?? "", asAt: pick.asAt, stream: pick.stream, sourceUrl: pick.sourceUrl };
}
