import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** Nominations with their employer, nominee and case, newest first. */
export async function nominationsFor(agencyId: string, employerId?: string) {
  const where = [eq(s.nominations.agencyId, agencyId)];
  if (employerId) where.push(eq(s.nominations.employerId, employerId));
  return db
    .select({
      n: s.nominations,
      employer: s.employers.name,
      clientName: sql<string | null>`${s.clients.firstName} || ' ' || ${s.clients.lastName}`,
      matterRef: s.matters.reference,
      matterVisa: s.matters.visaCode,
      matterStage: s.matters.stage,
      officer: s.user.name,
    })
    .from(s.nominations)
    .innerJoin(s.employers, eq(s.employers.id, s.nominations.employerId))
    .leftJoin(s.clients, eq(s.clients.id, s.nominations.clientId))
    .leftJoin(s.matters, eq(s.matters.id, s.nominations.matterId))
    .leftJoin(s.user, eq(s.user.id, s.nominations.assignedTo))
    .where(and(...where))
    .orderBy(desc(s.nominations.updatedAt));
}

export type NominationRow = Awaited<ReturnType<typeof nominationsFor>>[number];

/** Sponsored-visa cases a nomination can be linked to. */
export async function sponsoredMatterOptions(agencyId: string) {
  const rows = await db
    .select({ id: s.matters.id, reference: s.matters.reference, visa: s.matters.visaCode, clientId: s.matters.clientId, first: s.clients.firstName, last: s.clients.lastName })
    .from(s.matters)
    .innerJoin(s.clients, eq(s.clients.id, s.matters.clientId))
    .where(and(eq(s.matters.agencyId, agencyId), inArray(s.matters.visaCode, ["482", "186", "494", "407", "SBS", "187", "457"])))
    .orderBy(asc(s.clients.firstName));
  return rows.map((r) => ({ id: r.id, clientId: r.clientId, label: `${r.first} ${r.last} · ${r.visa} · ${r.reference}` }));
}
