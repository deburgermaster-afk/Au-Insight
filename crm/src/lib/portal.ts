import "server-only";
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** Everything a client sees on their upload page; null when the link is unknown or expired. */
export async function portalFor(token: string) {
  const [row] = await db
    .select({ link: s.portalLinks, matter: s.matters, client: s.clients, agency: s.organization, profile: s.agencyProfile })
    .from(s.portalLinks)
    .innerJoin(s.matters, eq(s.matters.id, s.portalLinks.matterId))
    .innerJoin(s.clients, eq(s.clients.id, s.portalLinks.clientId))
    .innerJoin(s.organization, eq(s.organization.id, s.portalLinks.agencyId))
    .leftJoin(s.agencyProfile, eq(s.agencyProfile.agencyId, s.portalLinks.agencyId))
    .where(and(eq(s.portalLinks.token, token), gt(s.portalLinks.expiresAt, new Date())));
  if (!row) return null;
  const [items, docs] = await Promise.all([
    db.select().from(s.checklistItems).where(eq(s.checklistItems.matterId, row.matter.id)).orderBy(asc(s.checklistItems.sort)),
    db
      .select({ id: s.documents.id, name: s.documents.name, checklistItemId: s.documents.checklistItemId, createdAt: s.documents.createdAt, sizeBytes: s.documents.sizeBytes })
      .from(s.documents)
      .where(and(eq(s.documents.matterId, row.matter.id), eq(s.documents.source, "portal"))),
  ]);
  return { ...row, items, docs };
}
