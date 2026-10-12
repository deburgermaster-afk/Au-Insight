"use server";

import { and, eq, gt } from "drizzle-orm";
import { updateTag } from "next/cache";
import { z } from "zod";
import { db, schema as s } from "@/db";
import { agencyTag } from "@/lib/data";

const file = z.object({ name: z.string().max(200), size: z.number().max(25 * 1024 * 1024), type: z.string(), key: z.string() });

/** Called by the client's browser after a file finishes uploading through their portal link. */
export async function portalAttach(token: string, itemId: string | null, input: z.infer<typeof file>) {
  const f = file.parse(input);
  const [link] = await db.select().from(s.portalLinks).where(and(eq(s.portalLinks.token, token), gt(s.portalLinks.expiresAt, new Date())));
  if (!link) return { ok: false as const, error: "This link has expired. Ask your agent for a new one." };
  if (!f.key.startsWith(`agency/${link.agencyId}/portal/${link.id}/`)) return { ok: false as const, error: "Upload not found." };
  let item: typeof s.checklistItems.$inferSelect | undefined;
  if (itemId) {
    [item] = await db.select().from(s.checklistItems).where(and(eq(s.checklistItems.id, itemId), eq(s.checklistItems.matterId, link.matterId)));
    if (!item) return { ok: false as const, error: "That document isn't on your checklist." };
  }
  const [client] = await db.select({ first: s.clients.firstName, last: s.clients.lastName }).from(s.clients).where(eq(s.clients.id, link.clientId));
  await db.insert(s.documents).values({
    agencyId: link.agencyId,
    clientId: link.clientId,
    matterId: link.matterId,
    checklistItemId: item?.id ?? null,
    name: f.name,
    category: item?.category ?? "Client upload",
    mimeType: f.type,
    sizeBytes: f.size,
    storageKey: f.key,
    uploadedBy: client ? `${client.first} ${client.last}` : "Client",
    source: "portal",
  });
  if (item && (item.status === "needed" || item.status === "requested" || item.status === "rejected")) {
    await db.update(s.checklistItems).set({ status: "received" }).where(eq(s.checklistItems.id, item.id));
  }
  await db.insert(s.activities).values({
    agencyId: link.agencyId,
    clientId: link.clientId,
    matterId: link.matterId,
    kind: "document",
    title: `Client uploaded ${item ? item.label : f.name}`,
    body: f.name,
    actorName: client ? `${client.first} ${client.last}` : "Client",
  });
  await db.update(s.portalLinks).set({ lastSeenAt: new Date() }).where(eq(s.portalLinks.id, link.id));
  updateTag(agencyTag(link.agencyId));
  return { ok: true as const };
}
