import "server-only";
import { strFromU8, unzipSync } from "fflate";
import { z } from "zod";
import type { ContractReview } from "@/db/crm-schema";
import { MERGE_FIELDS } from "@/lib/contracts";
import { readDocument } from "@/lib/doc-check";
import { completeJson } from "@/lib/llm";

// AI for employment contracts: writes a template from a plain-English description, turns an existing
// contract file into a reusable template, and reviews any template against the Fair Work rules.
// The rule checks run without AI too, so a review always says something useful.

const fields = MERGE_FIELDS.map((f) => `{{${f.key}}} = ${f.label}`).join("\n");

const LAW = `Australian law (2026–27) the contract must respect:
- Fair Work Act 2009 and the National Employment Standards (NES): 38 ordinary hours a week plus reasonable additional hours (s62); 4 weeks' paid annual leave (5 for some shift workers); 10 days' paid personal/carer's leave; 2 days' unpaid carer's leave; 2 days' compassionate leave; 10 days' paid family and domestic violence leave; community service leave; 12 months' unpaid parental leave; public holidays; notice of termination (s117: 1 week under 1 year, 2 weeks 1-3 years, 3 weeks 3-5 years, 4 weeks over 5 years, plus 1 week if over 45 with 2+ years' service); redundancy pay (s119); the Fair Work Information Statement (plus the Casual Employment Information Statement for casuals and the Fixed Term Contract Information Statement for fixed-term).
- Pay at least the national minimum wage ($26.44/hour from 1 July 2026) or the modern award; casual loading 25%; no unpaid trials beyond a short demonstration.
- Super guarantee 12% of qualifying earnings, paid within 7 days of payday (Payday Super, from 1 July 2026), choice of fund and stapled fund rules.
- Fixed-term contracts: no more than 2 years or one renewal, with limited exceptions.
- Casual: employee choice pathway to permanent employment after 6 months (12 for small business).
- Migration agents: only registered agents (MARN) give immigration assistance; Code of Conduct; Privacy Act 1988; client confidentiality.
- Restraints must be reasonable; contracts can't remove NES or award entitlements.`;

const templateSchema = z.object({
  name: z.string().min(3).max(90),
  employment: z.enum(["full_time", "part_time", "casual", "contractor"]).catch("full_time"),
  body: z.string().min(400),
});

const reviewSchema = z.object({
  summary: z.string(),
  issues: z.array(z.object({ level: z.enum(["block", "warn", "info"]).catch("warn"), text: z.string() })).max(20),
  missing: z.array(z.string()).max(20),
});

const SYSTEM = `You draft employment contracts for Australian migration and education agencies. Write in plain English (short sentences, "you" for the employee, "we" for the agency), in Markdown with ## headings. Use ONLY these merge fields, written exactly like {{field.name}}, wherever a specific person, date, amount or detail belongs; never invent names, dates or amounts:
${fields}

${LAW}`;

/** Writes a template from a casual description ("receptionist, part time, 3 days, clerks award level 2…"). */
export async function draftTemplate(description: string, employment: string) {
  const r = await completeJson(
    templateSchema,
    SYSTEM,
    `Write a complete employment contract template for this role. Employment type: ${employment}.\n\nWhat the agency told us:\n${description}\n\nInclude every NES entitlement and notice rule that applies, award coverage, pay, super (Payday Super), hours, probation if ongoing, confidentiality and privacy, migration agent obligations where relevant, conflicts, IP, ending employment, the right information statements, and an acceptance section. Keep anything the agency asked for unless it breaks the law; if it does, write the lawful version.`,
    { timeoutMs: 120_000, maxTokens: 8000 },
  );
  return r ? { ...r.value, model: r.model } : null;
}

/** Reads a contract file (PDF, Word or text). */
export async function contractText(bytes: Buffer, mime: string, name: string) {
  if (/\.docx$/i.test(name) || mime.includes("wordprocessingml")) {
    const files = unzipSync(new Uint8Array(bytes), { filter: (f) => f.name === "word/document.xml" });
    const xml = strFromU8(files["word/document.xml"] ?? new Uint8Array());
    return xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  if (/^text\//.test(mime) || /\.(txt|md)$/i.test(name)) return bytes.toString("utf8");
  const got = await readDocument(bytes, mime, name);
  if ("unsupported" in got) throw new Error(got.unsupported);
  if (!got.text || got.text.length < 200) throw new Error("This looks like a scan. Upload the Word file or a PDF with selectable text.");
  return got.text;
}

/** Turns an existing contract into a reusable template, keeping the agency's clauses. */
export async function importTemplate(text: string) {
  const r = await completeJson(
    templateSchema,
    SYSTEM,
    `Here is an employment contract the agency already uses. Turn it into a reusable template:
- keep their structure, clauses and wording as much as possible (fix only what breaks the law, and keep their tone);
- replace every specific name, address, date, job title, pay amount, hours, award and classification with the matching merge field;
- add any NES item or information statement that's missing;
- name it after the role and employment type.

Contract:
"""
${text.slice(0, 40_000)}
"""`,
    { timeoutMs: 150_000, maxTokens: 9000 },
  );
  return r ? { ...r.value, model: r.model } : null;
}

/** Rule checks every template gets, AI or not. */
export function ruleReview(body: string, employment: string): ContractReview {
  const t = body.toLowerCase();
  const issues: ContractReview["issues"] = [];
  const missing: string[] = [];
  const has = (re: RegExp) => re.test(t);
  if (!has(/fair work information statement/)) missing.push("Fair Work Information Statement");
  if (employment === "casual" && !has(/casual employment information statement/)) missing.push("Casual Employment Information Statement");
  if (has(/fixed term|fixed-term/) && !has(/fixed term contract information statement/)) missing.push("Fixed Term Contract Information Statement");
  if (employment !== "contractor") {
    if (employment !== "casual" && !has(/annual leave/)) missing.push("Annual leave (4 weeks)");
    if (employment !== "casual" && !has(/personal\/carer|personal leave|personal and carer/)) missing.push("Personal/carer's leave (10 days)");
    if (!has(/family and domestic violence/)) missing.push("Family and domestic violence leave (10 days paid)");
    if (!has(/super/)) missing.push("Superannuation (12%)");
    if (employment !== "casual" && !has(/notice/)) missing.push("Notice of termination (NES)");
    if (!has(/award|minimum wage/)) issues.push({ level: "warn", text: "Doesn't say which modern award applies, or that the employee is award-free." });
  }
  if (!has(/confidential/)) missing.push("Confidentiality of client information");
  if (!has(/privacy/)) missing.push("Privacy Act obligations");
  const sg = t.match(/super[^.]{0,80}?(\d{1,2}(?:\.\d+)?)\s?%/);
  if (sg && Number(sg[1]) < 12) issues.push({ level: "block", text: `Super is ${sg[1]}%. The super guarantee is 12% from 1 July 2025.` });
  if (has(/quarter|28 days after the end of (each|the) quarter/) && has(/super/)) issues.push({ level: "warn", text: "Mentions quarterly super. Since 1 July 2026 super must reach the fund within 7 days of each payday (Payday Super)." });
  if (has(/unpaid trial|trial (shift|period) (is|will be) unpaid/)) issues.push({ level: "block", text: "Unpaid trials beyond a short skills demonstration are generally unlawful." });
  if (has(/no (entitlement|right) to (overtime|leave|notice)/) && employment !== "contractor") issues.push({ level: "block", text: "A contract can't remove NES or award entitlements." });
  const restraint = t.match(/(\d{1,2})\s?(months|years)[^.]{0,120}(restrain|solicit|compete)/);
  if (restraint && (restraint[2] === "years" || Number(restraint[1]) > 12)) issues.push({ level: "warn", text: `The ${restraint[1]} ${restraint[2]} restraint may be unenforceable. Keep it to what's reasonable to protect client relationships.` });
  const notice = t.match(/(\d)\s?(day|days)['’]?\s+notice/);
  if (notice && employment !== "casual" && employment !== "contractor") issues.push({ level: "warn", text: `Notice of ${notice[1]} day(s) is shorter than the NES minimum of 1 week.` });
  if (employment === "contractor" && has(/annual leave|personal leave|super guarantee/)) issues.push({ level: "warn", text: "This contractor agreement includes employee entitlements. Check it isn't really employment (sham contracting)." });
  const leftover = [...body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((m) => m[1]).filter((k) => !MERGE_FIELDS.some((f) => f.key === k));
  if (leftover.length) issues.push({ level: "info", text: `Unknown merge fields: ${[...new Set(leftover)].join(", ")}. They'll show as blanks.` });
  const summary = issues.some((i) => i.level === "block") ? "Has problems to fix before you use it." : missing.length || issues.length ? "Usable, with a few things to add or check." : "Covers the National Employment Standards checks.";
  return { summary, issues, missing };
}

/** AI review on top of the rule checks. */
export async function reviewTemplate(body: string, employment: string): Promise<ContractReview> {
  const rules = ruleReview(body, employment);
  const r = await completeJson(
    reviewSchema,
    `You are an Australian employment lawyer reviewing a contract template for a migration agency. Be specific and brief. Only flag real problems.\n\n${LAW}`,
    `Employment type: ${employment}. Review this template. "issues": problems (block = unlawful or unenforceable, warn = risky or unclear, info = suggestion). "missing": NES entitlements, statements or clauses that should be there but aren't. "summary": one sentence.\n\n"""\n${body.slice(0, 40_000)}\n"""`,
    { timeoutMs: 90_000, maxTokens: 3000 },
  );
  if (!r) return rules;
  const seen = new Set(rules.missing.map((m) => m.toLowerCase().slice(0, 18)));
  return {
    summary: rules.issues.some((i) => i.level === "block") ? rules.summary : r.value.summary,
    issues: [...rules.issues, ...r.value.issues.filter((i) => !rules.issues.some((x) => x.text.slice(0, 30) === i.text.slice(0, 30)))].slice(0, 15),
    missing: [...rules.missing, ...r.value.missing.filter((m) => !seen.has(m.toLowerCase().slice(0, 18)))].slice(0, 12),
  };
}
