import "server-only";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import type { AgreementContent } from "@/db/crm-schema";
import { visaByCode } from "@/lib/visas";

/**
 * Lodgely's template wording, written around the Code of Conduct for registered migration agents.
 * Agencies can replace it in Settings → Agency profile → Agreement terms. Headings start with "## ";
 * blank lines separate paragraphs. {agency}, {client}, {visa} are filled in.
 */
export const DEFAULT_TERMS = `## The services
{agency} will provide immigration assistance to {client} for the {visa} application described above: assessing eligibility, advising on the requirements and evidence, preparing and lodging the application, corresponding with the Department of Home Affairs about it, and keeping you informed until a decision is made.

Work outside this scope (for example a different visa, a review application to the Administrative Review Tribunal, or a new application after a refusal) needs a new or varied agreement.

## Fees and charges
The professional fees above are our estimate for the services in this agreement. If the work changes, we will give you a revised estimate in writing before doing it.

Government charges (the visa application charge) are set by the Department of Home Affairs and may change before lodgement. Other costs such as health examinations, police certificates, translations and skills assessments are paid by you to the provider.

## Payments and our client account
Money you pay us in advance for fees or charges is held in our client account until it is earned or paid out on your behalf. We will give you a written statement of the services provided and the fees charged.

## Refunds
If this agreement ends before the services are complete, we will refund any money held for you, less fees for services already provided and charges already paid on your behalf, with a written account.

## What we will do
Act in your lawful interests, follow the Code of Conduct for registered migration agents, give you honest advice about your prospects, keep your information confidential, tell you promptly about anything the Department sends, and give you a copy of your application and correspondence.

## What you will do
Give us complete and truthful information and documents, tell us straight away about any change in your circumstances (address, relationship, health, character, employment, travel), and pay fees and charges when due.

## No guarantee of outcome
Visa decisions are made by the Department of Home Affairs. We cannot guarantee that a visa will be granted or how long a decision will take.

## Ending this agreement
Either of us can end this agreement in writing. You will pay for services provided up to that time.

## Complaints
If you are unhappy with our services, please tell us first so we can try to fix it. You can also complain to the Office of the Migration Agents Registration Authority (OMARA).

## Privacy
We collect and use your personal information to provide these services, and share it with the Department of Home Affairs and other bodies only as needed for your application or as the law requires.

## Consumer Guide
By signing, you confirm you have received the Consumer Guide published by OMARA, which explains what you can expect from a registered migration agent.`;

export function parseTerms(text: string, vars: Record<string, string>) {
  const filled = text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  const sections: { heading: string; body: string[] }[] = [];
  for (const block of filled.split(/\n(?=## )/)) {
    const [first, ...rest] = block.trim().split("\n");
    const heading = first.startsWith("## ") ? first.slice(3).trim() : "Terms";
    const body = (first.startsWith("## ") ? rest : [first, ...rest]).join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    if (body.length) sections.push({ heading, body });
  }
  return sections;
}

/** JSON with object keys sorted, so the fingerprint survives a round trip through Postgres jsonb (which reorders keys). */
const canonical = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canonical).join(",")}]` : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}` : JSON.stringify(v ?? null);

export const hashContent = (c: AgreementContent) => createHash("sha256").update(canonical(c)).digest("hex");

/** Freezes the agreement for a matter: parties, fees and terms as they are right now. */
export async function buildAgreement(agencyId: string, matterId: string): Promise<AgreementContent | null> {
  const [m] = await db.select().from(s.matters).where(and(eq(s.matters.agencyId, agencyId), eq(s.matters.id, matterId)));
  if (!m) return null;
  const [[c], [org], [p]] = await Promise.all([
    db.select().from(s.clients).where(eq(s.clients.id, m.clientId)),
    db.select({ name: s.organization.name }).from(s.organization).where(eq(s.organization.id, agencyId)),
    db.select().from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId)),
  ]);
  // The responsible agent: the matter's agent if they hold a MARN, else the principal.
  let agent = { name: p?.legalName ?? org?.name ?? "", marn: p?.marn ?? null };
  if (m.assignedTo) {
    const [u] = await db.select({ name: s.user.name, marn: s.staffProfiles.marn }).from(s.user).leftJoin(s.staffProfiles, and(eq(s.staffProfiles.userId, s.user.id), eq(s.staffProfiles.agencyId, agencyId))).where(eq(s.user.id, m.assignedTo));
    if (u?.marn) agent = { name: u.name, marn: u.marn };
  }
  const visa = visaByCode(m.visaCode);
  const visaName = visa ? `${visa.name} (subclass ${visa.code})` : m.visaCode;
  const gst = p?.gstRegistered ?? true;
  const prof = Number(m.feeProfessional ?? 0);
  const fees: AgreementContent["fees"] = [];
  if (prof) fees.push({ label: "Professional fees", amount: prof, note: gst ? "plus GST" : "no GST charged" });
  if (gst && prof) fees.push({ label: "GST on professional fees", amount: Math.round(prof * 10) / 100 });
  if (Number(m.feeGovernment ?? 0)) fees.push({ label: "Visa application charge (Department of Home Affairs)", amount: Number(m.feeGovernment), note: "estimate, set by the Department" });
  const clientName = `${c.firstName} ${c.lastName}`;
  return {
    title: `Service agreement: ${visaName}`,
    agency: { name: org?.name ?? "", legalName: p?.legalName ?? null, abn: p?.abn ?? null, marn: p?.marn ?? null, agent: agent.name, agentMarn: agent.marn, email: p?.email ?? null, phone: p?.phone ?? null, address: p?.address ? `${p.address}${p.state ? `, ${p.state}` : ""}` : null },
    client: { name: clientName, email: c.email, dateOfBirth: c.dateOfBirth, address: [c.address, c.city, c.state].filter(Boolean).join(", ") || null },
    matter: { reference: m.reference, visa: visaName, stream: m.stream },
    fees,
    sections: parseTerms(p?.agreementTerms || DEFAULT_TERMS, { agency: p?.legalName ?? org?.name ?? "We", client: clientName, visa: visaName }),
    preparedOn: new Date().toISOString().slice(0, 10),
  };
}
