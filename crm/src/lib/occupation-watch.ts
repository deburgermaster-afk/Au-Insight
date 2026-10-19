import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { WatchSnapshot } from "@/db/crm-schema";
import { notifyStaff } from "@/lib/notify";
import { type Eoi, type RoundRow, watchData } from "@/lib/occupations";

// Occupation watch: where a client's EOI sits in the SkillSelect backlog for their occupation, and an
// alert when an invitation round's cut-off reaches their points. Home Affairs publishes per-occupation
// cut-offs for 189 (and 491 family-sponsored) only; 190 and 491 state nomination have no national
// cut-off, so those show the backlog position only.

/** The EOI dashboard's stream for a subclass: 189 → 189PTS, 190 → 190SAS, 491 → 491SNR. */
const STREAM: Record<string, string> = { "189": "189PTS", "190": "190SAS", "491": "491SNR" };
const num = (v: unknown) => (typeof v === "number" ? v : v === "<20" ? 10 : Number(v) || 0);

/** How many submitted EOIs for this occupation are on the same or more points than the client. */
export function eoiPosition(eoi: Eoi | null, subclass: string, points: number) {
  const sub = eoi?.subclasses.find((x) => x.subclass === STREAM[subclass]);
  if (!sub) return null;
  let ahead = 0;
  let approx = false;
  for (const row of sub.by_points) {
    if (Number(row.points) < points) continue;
    if (row.SUBMITTED === "<20") approx = true;
    ahead += num(row.SUBMITTED);
  }
  const submitted = sub.by_status?.SUBMITTED;
  return { ahead, approx, submitted: submitted == null ? null : num(submitted) };
}

/** The latest round that invited this occupation for the subclass, and whether the client's points reach it. */
export function latestCutoff(rounds: RoundRow[], subclass: string, points: number) {
  const r = rounds.find((x) => x.subclass === subclass && x.min_points != null);
  if (!r) return null;
  return { date: r.round_date, minPoints: r.min_points!, reaches: points >= r.min_points!, gap: r.min_points! - points };
}

export type WatchView = Awaited<ReturnType<typeof describeWatch>>;

/** Everything the client card shows for one watch. */
export async function describeWatch(w: typeof s.occupationWatches.$inferSelect) {
  const data = await watchData(w.anzsco).catch(() => null);
  const subs = w.subclasses.map((sub) => {
    const pos = eoiPosition(data?.eoi ?? null, sub, w.points);
    const cut = latestCutoff(data?.rounds ?? [], sub, w.points);
    const history = w.snapshots.filter((x) => x.subclass === sub).sort((a, b) => a.asAt.localeCompare(b.asAt));
    return { subclass: sub, position: pos, cutoff: cut, history };
  });
  return { id: w.id, anzsco: w.anzsco, occupation: w.occupation, points: w.points, subclasses: w.subclasses, active: w.active, eoiAsAt: data?.eoi?.as_at ?? null, lastCheckedAt: w.lastCheckedAt?.toISOString() ?? null, subs };
}

/**
 * Checks one watch: records this month's EOI position (once per EOI dashboard month), and when a round
 * newer than the last one seen reaches the client's points, creates a task, a timeline entry and an email.
 */
export async function checkWatch(w: typeof s.occupationWatches.$inferSelect) {
  const data = await watchData(w.anzsco);
  if (!data) return { alerted: false, snapshot: false };
  const set: Partial<typeof s.occupationWatches.$inferInsert> = { lastCheckedAt: new Date() };
  let snapshot = false;
  const asAt = data.eoi?.as_at;
  if (asAt) {
    const fresh: WatchSnapshot[] = [];
    for (const sub of w.subclasses) {
      if (w.snapshots.some((x) => x.asAt === asAt && x.subclass === sub)) continue;
      const pos = eoiPosition(data.eoi, sub, w.points);
      if (pos) fresh.push({ asAt, subclass: sub, ...pos });
    }
    if (fresh.length) {
      set.snapshots = [...w.snapshots, ...fresh].slice(-72);
      snapshot = true;
    }
  }
  const newest = data.rounds[0]?.round_date ?? null;
  let alerted = false;
  if (newest && (!w.lastRoundSeen || newest > w.lastRoundSeen)) {
    set.lastRoundSeen = newest;
    // Rounds seen before the watch was created don't alert: only new rounds do.
    const hits = w.lastRoundSeen ? data.rounds.filter((r) => r.round_date > w.lastRoundSeen! && w.subclasses.includes(r.subclass) && r.min_points != null && w.points >= r.min_points) : [];
    if (hits.length && w.lastAlertRound !== newest) {
      set.lastAlertRound = newest;
      alerted = true;
      await alertWatch(w, hits);
    }
  }
  await db.update(s.occupationWatches).set(set).where(eq(s.occupationWatches.id, w.id));
  return { alerted, snapshot };
}

async function alertWatch(w: typeof s.occupationWatches.$inferSelect, hits: RoundRow[]) {
  const [c] = await db.select({ first: s.clients.firstName, last: s.clients.lastName, assignedTo: s.clients.assignedTo }).from(s.clients).where(eq(s.clients.id, w.clientId));
  if (!c) return;
  const name = `${c.first} ${c.last}`;
  const lines = hits.map((h) => `Subclass ${h.subclass} round on ${h.round_date}: cut-off ${h.min_points} points. ${name} has ${w.points}.`);
  const title = `${name}: ${w.occupation} cut-off reached their ${w.points} points`;
  await db.insert(s.tasks).values({ agencyId: w.agencyId, title: title.slice(0, 200), description: `${lines.join("\n")}\n\nCheck their EOI is current and ready for an invitation.`, priority: "high", clientId: w.clientId, assignedTo: c.assignedTo, dueAt: new Date(Date.now() + 2 * 864e5) });
  await db.insert(s.activities).values({ agencyId: w.agencyId, clientId: w.clientId, kind: "system", title: `Invitation round reached ${w.points} points for ${w.occupation}`, body: lines.join("\n") });
  if (c.assignedTo) {
    const [u] = await db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, c.assignedTo));
    if (u?.email) await notifyStaff([u.email], title, { heading: "A cut-off reached your client's points", lines, cta: { label: `Open ${c.first}'s file`, path: `/app/clients/${w.clientId}` } });
  }
}

/** All active watches for the given agencies (or every agency), grouped by occupation so each is fetched once. */
export async function checkAllWatches(agencyIds?: string[]) {
  const where = [eq(s.occupationWatches.active, true)];
  if (agencyIds?.length) where.push(inArray(s.occupationWatches.agencyId, agencyIds));
  const rows = await db.select().from(s.occupationWatches).where(and(...where)).limit(500);
  let alerts = 0;
  let snapshots = 0;
  for (const w of rows) {
    try {
      const r = await checkWatch(w);
      if (r.alerted) alerts++;
      if (r.snapshot) snapshots++;
    } catch (e) {
      console.error("occupation watch", w.id, e);
    }
  }
  return { watches: rows.length, alerts, snapshots };
}
