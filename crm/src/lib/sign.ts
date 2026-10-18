import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { ConsentVars } from "@/lib/consent-templates";
import { visaByCode } from "@/lib/visas";

const dmyLong = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(`${d.slice(0, 10)}T00:00:00Z`) : d;
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric", timeZone: typeof d === "string" ? "UTC" : "Australia/Sydney" });
};

/**
 * The values every consent form fills in: agency, the responsible registered migration agent
 * (the matter's agent if they hold a MARN, else the sender if they do, else the principal), and
 * the client and matter.
 */
export async function consentVars(agencyId: string, clientId: string, matterId: string | null, senderId: string): Promise<ConsentVars> {
  const [[c], [org], [p], [m]] = await Promise.all([
    db.select().from(s.clients).where(and(eq(s.clients.agencyId, agencyId), eq(s.clients.id, clientId))),
    db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, agencyId)),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
    matterId ? db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.id, matterId))) : Promise.resolve([]),
  ]);
  if (!c) throw new Error("Client not found.");
  const staff = async (userId: string | null | undefined) => {
    if (!userId) return null;
    const [u] = await db.select({ name: s.user.name, marn: s.staffProfiles.marn }).from(s.user).leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.user.id), eq(s.staffProfiles.agencyId, agencyId))).where(eq(s.user.id, userId));
    return u?.marn ? { name: u.name, marn: u.marn } : null;
  };
  const agent = (await staff(m?.assignedTo)) ?? (await staff(senderId)) ?? { name: p?.legalName ?? org?.name ?? "", marn: p?.marn ?? "" };
  const visa = m ? visaByCode(m.visaCode) : null;
  return {
    agency: org?.name ?? "",
    agencyLegal: p?.legalName || org?.name || "",
    abn: p?.abn ?? "",
    agencyAddress: p?.address && p.state && !p.address.includes(p.state) ? `${p.address}, ${p.state}` : (p?.address ?? p?.state ?? ""),
    agencyEmail: p?.email ?? "",
    agencyPhone: p?.phone ?? "",
    agent: agent.name,
    agentMarn: agent.marn ?? "",
    client: `${c.firstName} ${c.lastName}`,
    clientDob: dmyLong(c.dateOfBirth),
    clientEmail: c.email ?? "",
    clientAddress: [c.address, c.city, c.state].filter(Boolean).join(", "),
    passport: c.passportNumber ?? "",
    nationality: c.nationality ?? "",
    visa: m ? (visa ? `${visa.name} (subclass ${visa.code})${m.stream ? `, ${m.stream}` : ""}` : m.visaCode) : "General immigration assistance",
    matterRef: m?.reference ?? "",
    date: dmyLong(new Date()),
  };
}
