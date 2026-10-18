import "server-only";
import type { clients } from "@/db/crm-schema";
import { ageOn, type EligProfile } from "@/lib/eligibility";
import { listOccupations } from "@/lib/occupations";

/** The eligibility profile for a client: their record, with the occupation matched to ANZSCO lists. */
export async function eligibilityProfile(c: typeof clients.$inferSelect): Promise<EligProfile> {
  let occupation: EligProfile["occupation"] = null;
  if (c.occupation || c.anzsco) {
    const all = await listOccupations().catch(() => []);
    const t = c.occupation?.trim().toLowerCase();
    const hit = all.find((o) => (c.anzsco && o.anzsco === c.anzsco) || (t && o.title.toLowerCase() === t)) ?? (t ? all.find((o) => o.title.toLowerCase().startsWith(t)) : undefined);
    occupation = { title: hit?.title ?? c.occupation ?? c.anzsco ?? "", anzsco: hit?.anzsco ?? c.anzsco ?? null, lists: hit?.lists ?? [] };
  }
  return {
    age: ageOn(c.dateOfBirth),
    onshore: c.onshore,
    currentVisa: c.currentVisa,
    conditions: c.visaConditions ?? [],
    englishTest: c.englishTest,
    englishScore: c.englishScore,
    nationality: c.nationality,
    occupation,
  };
}
