import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { Pack } from "@/lib/lodgement";
import { memberCtx } from "@/lib/session";

/** What the reviewer signed off: every data-sheet value and every document (name, file, size). */
export function packFingerprint(p: NonNullable<Pack>) {
  const data = { sheet: p.sheet.map((sec) => sec.fields.map((f) => [f.key, f.value])), docs: p.docs.map((d) => [d.id, d.file, d.storageKey, d.sizeBytes]) };
  return createHash("sha256").update(JSON.stringify(data)).digest("hex").slice(0, 32);
}

/** Members who hold a current MARN (can review and lodge). */
export async function registeredAgents(agencyId: string) {
  const members = await db.select({ userId: s.member.userId }).from(s.member).where(eq(s.member.organizationId, agencyId));
  const ctxs = await Promise.all(members.map((m) => memberCtx(agencyId, m.userId)));
  return ctxs.filter((c): c is NonNullable<typeof c> => Boolean(c?.registered)).map((c) => ({ id: c.userId, name: c.name, email: c.email, role: c.role }));
}

export type SignoffState = Awaited<ReturnType<typeof signoffState>>;

/** The latest sign-off on a matter and whether it still matches the pack as it is now. */
export async function signoffState(agencyId: string, matterId: string, pack: NonNullable<Pack>) {
  const [[latest], [profile]] = await Promise.all([
    db.select().from(s.lodgementSignoffs).where(and(eq(s.lodgementSignoffs.agencyId, agencyId), eq(s.lodgementSignoffs.matterId, matterId))).orderBy(desc(s.lodgementSignoffs.createdAt)).limit(1),
    db.select({ required: s.agencyProfile.requireSignoff }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  const now = packFingerprint(pack);
  const approved = latest?.status === "approved";
  const stale = approved && latest.fingerprint !== now;
  return { required: profile?.required ?? true, latest: latest ?? null, current: approved && !stale, stale, fingerprint: now };
}

/** null when the matter may be marked lodged; otherwise why not. */
export async function lodgeBlocked(agencyId: string, matterId: string) {
  const { buildPack } = await import("@/lib/lodgement");
  const pack = await buildPack(agencyId, matterId);
  if (!pack) return "Matter not found.";
  const st = await signoffState(agencyId, matterId, pack);
  if (!st.required || st.current) return null;
  if (st.stale) return "The lodgement changed after it was signed off. Ask for sign-off again from the Lodgement pack.";
  if (st.latest?.status === "pending") return `Waiting for ${st.latest.reviewerName} to sign off the lodgement.`;
  return "This lodgement needs a supervisor's sign-off first. Request it from the Lodgement pack.";
}
