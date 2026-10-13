import "server-only";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { dupKeys } from "@/lib/client-import";

export type DupMember = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; dateOfBirth: string | null; passportNumber: string | null; nationality: string | null; stage: string; createdAt: Date; matters: number; documents: number; invoices: number };
export type DupGroup = { key: string; reasons: string[]; members: DupMember[] };

const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Groups of clients that are probably the same person: they share an email, a passport number, or
 * name + date of birth; or both name and phone. Pairs staff marked as different are left out.
 */
export async function findDuplicateGroups(agencyId: string): Promise<DupGroup[]> {
  const [rows, dismissed] = await Promise.all([
    db
      .select({ id: s.clients.id, firstName: s.clients.firstName, lastName: s.clients.lastName, email: s.clients.email, phone: s.clients.phone, dateOfBirth: s.clients.dateOfBirth, passportNumber: s.clients.passportNumber, nationality: s.clients.nationality, stage: s.clients.stage, createdAt: s.clients.createdAt })
      .from(s.clients)
      .where(eq(s.clients.agencyId, agencyId)),
    db.select({ a: s.duplicateDismissals.a, b: s.duplicateDismissals.b }).from(s.duplicateDismissals).where(eq(s.duplicateDismissals.agencyId, agencyId)),
  ]);
  const skip = new Set(dismissed.map((d) => pair(d.a, d.b)));
  const byKey = new Map<string, string[]>();
  const reasonOf = new Map<string, string>();
  for (const r of rows)
    for (const k of dupKeys(r)) {
      byKey.set(k.key, [...(byKey.get(k.key) ?? []), r.id]);
      reasonOf.set(k.key, k.reason);
    }
  // Score each pair: one strong key, or two weak ones (name + phone).
  const pairs = new Map<string, { strong: number; weak: number; reasons: Set<string> }>();
  for (const [key, ids] of byKey) {
    if (ids.length < 2 || ids.length > 25) continue;
    const strong = !key.startsWith("ph:") && !key.startsWith("n:");
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const p = pair(ids[i], ids[j]);
        if (skip.has(p)) continue;
        const cur = pairs.get(p) ?? { strong: 0, weak: 0, reasons: new Set<string>() };
        if (strong) cur.strong++;
        else cur.weak++;
        cur.reasons.add(reasonOf.get(key)!);
        pairs.set(p, cur);
      }
  }
  // Union-find into groups.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const groupReasons = new Map<string, Set<string>>();
  for (const [p, v] of pairs) {
    if (!(v.strong > 0 || v.weak >= 2)) continue;
    const [a, b] = p.split("|");
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(rb, ra);
    const root = find(a);
    groupReasons.set(root, new Set([...(groupReasons.get(root) ?? []), ...(groupReasons.get(ra) ?? []), ...(groupReasons.get(rb) ?? []), ...v.reasons]));
  }
  const groups = new Map<string, string[]>();
  for (const id of parent.keys()) groups.set(find(id), [...(groups.get(find(id)) ?? []), id]);
  const ids = [...groups.values()].filter((g) => g.length > 1).flat();
  if (!ids.length) return [];
  const count = (table: typeof s.matters | typeof s.documents | typeof s.invoices) =>
    db.select({ id: table.clientId, n: sql<number>`count(*)::int` }).from(table).where(and(eq(table.agencyId, agencyId), inArray(table.clientId, ids))).groupBy(table.clientId);
  const [m, d, inv] = await Promise.all([count(s.matters), count(s.documents), count(s.invoices)]);
  const n = (list: { id: string | null; n: number }[], id: string) => list.find((x) => x.id === id)?.n ?? 0;
  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...groups.entries()]
    .filter(([, g]) => g.length > 1)
    .map(([root, g]) => ({
      key: root,
      reasons: [...(groupReasons.get(find(root)) ?? [])],
      members: g.map((id) => ({ ...byId.get(id)!, matters: n(m, id), documents: n(d, id), invoices: n(inv, id) })).sort((a, b) => b.matters + b.documents - (a.matters + a.documents) || +a.createdAt - +b.createdAt),
    }))
    .sort((a, b) => b.members.length - a.members.length);
}

/** Moves everything from the duplicates onto the kept client, applies the chosen values, deletes the rest. One transaction. */
export async function mergeClientRecords(agencyId: string, keepId: string, removeIds: string[], values: Partial<typeof s.clients.$inferInsert>) {
  const move = <T extends { clientId: unknown; agencyId: unknown }>(table: T) =>
    db
      .update(table as never)
      .set({ clientId: keepId } as never)
      .where(and(eq((table as unknown as typeof s.matters).agencyId, agencyId), inArray((table as unknown as typeof s.matters).clientId, removeIds)));
  const tables = [s.dependants, s.matters, s.documents, s.tasks, s.activities, s.appointments, s.invoices, s.ledger, s.messages, s.clientSessions, s.folders, s.studentApplications, s.portalLinks, s.aiPathways, s.mailInsights, s.serviceAgreements, s.paymentAttempts];
  await db.batch([
    ...tables.map((t) => move(t as never)),
    db.update(s.clients).set({ ...values, updatedAt: new Date() }).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, keepId))),
    db.delete(s.duplicateDismissals).where(and(eq(s.duplicateDismissals.agencyId, agencyId), or(inArray(s.duplicateDismissals.a, removeIds), inArray(s.duplicateDismissals.b, removeIds)))),
    db.delete(s.clients).where(and(eq(s.clients.agencyId, agencyId), inArray(s.clients.id, removeIds))),
  ] as never);
}
