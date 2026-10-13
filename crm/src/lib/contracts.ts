// Employment contract templates. Text is Markdown with {{merge.fields}} filled from the employee's
// record when a contract is issued. The built-in templates follow the Fair Work Act 2009 (National
// Employment Standards) and the obligations migration agents carry (Code of Conduct, privacy).

export const MERGE_FIELDS: { key: string; label: string }[] = [
  { key: "employee.name", label: "Employee's full legal name" },
  { key: "employee.first_name", label: "Employee's first name" },
  { key: "employee.address", label: "Employee's home address" },
  { key: "employer.name", label: "Agency legal name" },
  { key: "employer.abn", label: "Agency ABN" },
  { key: "employer.address", label: "Agency address" },
  { key: "employer.signatory", label: "Person signing for the agency" },
  { key: "position.title", label: "Job title" },
  { key: "position.manager", label: "Manager" },
  { key: "employment.type", label: "Full time, part time or casual" },
  { key: "start.date", label: "Start date" },
  { key: "end.date", label: "End date (fixed term)" },
  { key: "hours.week", label: "Ordinary hours a week" },
  { key: "pay.rate", label: "Pay rate" },
  { key: "pay.frequency", label: "Pay frequency" },
  { key: "super.rate", label: "Super guarantee rate" },
  { key: "award.name", label: "Modern award" },
  { key: "award.classification", label: "Award classification" },
  { key: "probation", label: "Probation period" },
  { key: "work.location", label: "Place of work" },
  { key: "state", label: "State whose laws apply" },
  { key: "today", label: "Today's date" },
];

export type MergeData = Record<string, string>;

/** Fills {{fields}}; unknown or empty fields become a visible blank so nothing is silently missing. */
export function renderContract(body: string, data: MergeData) {
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => (data[k] && data[k].trim() ? data[k] : `[${MERGE_FIELDS.find((f) => f.key === k)?.label ?? k}]`));
}

export const unfilled = (text: string) => [...new Set([...text.matchAll(/\[([^\]\n]{3,60})\]/g)].map((m) => m[1]).filter((x) => MERGE_FIELDS.some((f) => f.label === x)))];

const COMMON_CONFIDENTIAL = `## Confidentiality and privacy
You will see clients' personal and sensitive information: identity documents, health, character and family details. You must keep it confidential during and after your employment, use it only to do your job, and handle it under the Privacy Act 1988 (Australian Privacy Principles) and our privacy policy. Don't copy client information to personal devices or accounts. Report any suspected data breach to {{position.manager}} straight away.

## Professional standards
You must follow the Code of Conduct for registered migration agents and the Education Services for Overseas Students framework as they apply to your role, and our practice policies. Only registered migration agents may give immigration assistance. If your role requires registration (MARN), you must keep it current, complete the required continuing professional development, and tell us immediately if your registration is cancelled, suspended or has conditions placed on it.`;

const COMMON_END = `## Policies
Our workplace policies (including work health and safety, anti-discrimination, bullying and harassment, IT and social media) apply to you. They are not part of this contract and we may change them.

## Information statements
With this contract you have received the Fair Work Information Statement{{extra.statements}}.

## Whole agreement
This contract and the documents it refers to are the whole agreement between us about your employment. Changes must be in writing and signed by both of us. The laws of {{state}} and the Commonwealth apply.

## Acceptance
Signed for {{employer.name}} (ABN {{employer.abn}}) by {{employer.signatory}}.

I, {{employee.name}}, accept employment on the terms of this contract.`;

export const BUILTIN_TEMPLATES: { key: string; name: string; employment: string; body: string }[] = [
  {
    key: "ongoing",
    name: "Employment contract: full time or part time",
    employment: "full_time",
    body: `# Employment contract

**Employer:** {{employer.name}}, ABN {{employer.abn}}, {{employer.address}}
**Employee:** {{employee.name}}, {{employee.address}}
**Date:** {{today}}

## Position
You are employed as **{{position.title}}** on a {{employment.type}}, ongoing basis, reporting to {{position.manager}}. Your usual place of work is {{work.location}}. You will do the duties of the role and other reasonable duties we ask of you that match your skills.

## Start date and probation
Your employment starts on **{{start.date}}**. The first {{probation}} is a probation period, during which either of us may end the employment with the notice in the National Employment Standards. Probation doesn't change your minimum employment period under the Fair Work Act.

## Award
Your employment is covered by the **{{award.name}}**, classification **{{award.classification}}**. Where the award gives you a better entitlement than this contract, the award applies.

## Hours
Your ordinary hours are **{{hours.week}} hours a week**, usually between 8:00 am and 6:00 pm Monday to Friday. We may ask you to work reasonable additional hours (Fair Work Act section 62). Overtime and penalty rates are paid as the award requires{{pay.overtime_note}}.

## Pay
You will be paid **{{pay.rate}}**, paid {{pay.frequency}} into your nominated bank account. We will withhold tax as the ATO requires and give you a payslip within one working day of payday. Your pay will be reviewed at least once a year. We report your pay to the ATO through Single Touch Payroll.

## Superannuation
We will pay super guarantee contributions of **{{super.rate}}** of your qualifying earnings to the fund you choose (or your stapled fund, or our default fund if you don't choose). Under Payday Super, contributions reach your fund within 7 days of each payday. You may salary sacrifice extra to super by asking in writing.

## Leave
You are entitled to the leave in the National Employment Standards, including:
- 4 weeks' paid annual leave a year (pro rata for part time), accruing with service;
- 10 days' paid personal/carer's leave a year (pro rata for part time);
- 2 days' paid compassionate leave each time it's needed;
- 10 days' paid family and domestic violence leave a year;
- unpaid community service leave, and jury service as the law provides;
- parental leave and public holidays under the NES;
- long service leave under the {{state}} law.

${COMMON_CONFIDENTIAL}

## Conflicts of interest
Tell us about any other work or business interest that could conflict with your role. Don't accept gifts or benefits from clients, education providers or other third parties beyond a token amount without approval.

## Intellectual property
Work you create in your employment (templates, advice, systems, client materials) belongs to us.

## Ending employment
Either of us may end this contract by giving written notice. The notice period is the longer of 2 weeks and the period in the National Employment Standards:
- up to 1 year's service: 1 week;
- 1 to 3 years: 2 weeks;
- 3 to 5 years: 3 weeks;
- more than 5 years: 4 weeks;
- plus 1 week if you are over 45 and have at least 2 years' service when we give notice.
We may pay you instead of notice. We can end your employment without notice for serious misconduct. Redundancy pay is paid as the National Employment Standards require. When you leave you must return all property and client information and not keep copies.

## After you leave
For 6 months after you leave, you must not solicit clients you dealt with in your last 12 months with us to move their matters to you or a new employer. This is to protect our client relationships and goes no further than is reasonable.

${COMMON_END}`,
  },
  {
    key: "casual",
    name: "Employment contract: casual",
    employment: "casual",
    body: `# Casual employment contract

**Employer:** {{employer.name}}, ABN {{employer.abn}}, {{employer.address}}
**Employee:** {{employee.name}}, {{employee.address}}
**Date:** {{today}}

## Casual employment
You are employed as a **casual {{position.title}}**, reporting to {{position.manager}}, starting **{{start.date}}**. There is no firm advance commitment to continuing and indefinite work with an agreed pattern of work. You may accept or reject any offer of work, and we offer work as our needs change.

## Award and pay
Your employment is covered by the **{{award.name}}**, classification **{{award.classification}}**. You will be paid **{{pay.rate}}** for each hour worked, which includes a 25% casual loading paid instead of paid annual and personal leave, notice and redundancy pay. You will be paid {{pay.frequency}}, with tax withheld and reported to the ATO through Single Touch Payroll. Each shift is at least the minimum engagement in the award.

## Superannuation
We will pay super guarantee of **{{super.rate}}** of your qualifying earnings to the fund you choose, within 7 days of each payday (Payday Super).

## Leave
As a casual you are entitled to 2 days' unpaid carer's leave and 2 days' unpaid compassionate leave each time it's needed, 10 days' paid family and domestic violence leave a year, community service leave, and long service leave under the {{state}} law where it applies.

## Becoming permanent
After 6 months (12 months if we have fewer than 15 employees), if you have worked a regular pattern of hours you may tell us in writing that you want to become full time or part time. We will respond in writing within 21 days, as the Fair Work Act sets out.

${COMMON_CONFIDENTIAL}

## Ending engagement
Either of us may end this engagement at any time, subject to any notice the award requires.

${COMMON_END}`.replace("{{extra.statements}}", " and the Casual Employment Information Statement"),
  },
  {
    key: "fixed",
    name: "Employment contract: fixed term",
    employment: "full_time",
    body: `# Fixed-term employment contract

**Employer:** {{employer.name}}, ABN {{employer.abn}}, {{employer.address}}
**Employee:** {{employee.name}}, {{employee.address}}
**Date:** {{today}}

## Term
You are employed as **{{position.title}}** on a {{employment.type}} basis for a fixed term from **{{start.date}}** to **{{end.date}}**, reporting to {{position.manager}}. The employment ends on that date without further notice unless we agree in writing to extend it. Under the Fair Work Act, a fixed-term contract can't run for more than 2 years including extensions, or be renewed more than once, except in the limited cases the Act allows.

## Award, hours and pay
Your employment is covered by the **{{award.name}}**, classification **{{award.classification}}**. Your ordinary hours are **{{hours.week}} hours a week**. You will be paid **{{pay.rate}}**, paid {{pay.frequency}}, with tax withheld and reported through Single Touch Payroll.

## Superannuation
We will pay super guarantee of **{{super.rate}}** of your qualifying earnings to your chosen fund within 7 days of each payday (Payday Super).

## Leave
You accrue the paid leave in the National Employment Standards during the term (annual, personal/carer's, compassionate, family and domestic violence leave). Unused annual leave is paid out when the term ends.

${COMMON_CONFIDENTIAL}

## Ending early
Either of us may end this contract before the end date by giving the notice in the National Employment Standards (1 to 4 weeks depending on service, plus 1 week if you are over 45 with 2 years' service). We can end it without notice for serious misconduct.

${COMMON_END}`.replace("{{extra.statements}}", " and the Fixed Term Contract Information Statement"),
  },
  {
    key: "contractor",
    name: "Independent contractor agreement",
    employment: "contractor",
    body: `# Independent contractor agreement

**Principal:** {{employer.name}}, ABN {{employer.abn}}, {{employer.address}}
**Contractor:** {{employee.name}}, {{employee.address}}
**Date:** {{today}}

## Services
The contractor will provide **{{position.title}}** services from **{{start.date}}** as agreed in writing for each piece of work. The contractor decides how the services are done, may work for others, supplies their own equipment, and is responsible for their own tax, GST, super and insurance.

## Fees
The principal will pay **{{pay.rate}}** on receiving a valid tax invoice quoting the contractor's ABN, within 14 days. No PAYG is withheld unless the contractor doesn't give an ABN.

## Registration
If the services include immigration assistance, the contractor must hold current registration as a migration agent and follow the Code of Conduct, and must hold professional indemnity insurance.

## Confidentiality and privacy
The contractor must keep the principal's and clients' information confidential, use it only for the services, comply with the Privacy Act 1988, and return or destroy it when the services end.

## Ending
Either party may end this agreement with 14 days' written notice, or immediately for a serious breach.

## Not employment
This agreement is a contract for services, not employment. The parties have considered the whole relationship under the Fair Work Act's definition of employee. If the relationship changes so that the contractor works like an employee, the parties will review this agreement.

I, {{employee.name}}, agree to these terms.`,
  },
];

/** The built-in ongoing template uses the common ending without extra statements. */
for (const t of BUILTIN_TEMPLATES) t.body = t.body.replace("{{extra.statements}}", "").replace("{{pay.overtime_note}}", "");
