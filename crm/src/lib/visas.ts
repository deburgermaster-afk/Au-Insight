// The visa library: subclasses agencies work on, with their streams, the core requirements and a
// starting document checklist. Checklists are templates the agency edits per matter; always confirm
// against the Home Affairs document checklist for the stream before lodging.

export type ChecklistTemplate = { category: string; label: string; required?: boolean }[];

export type Visa = {
  code: string; // subclass, or a key for non-visa work (e.g. "ART", "CIT")
  name: string;
  category: "Skilled" | "Employer" | "Student" | "Graduate" | "Family" | "Visitor" | "Business" | "Humanitarian" | "Bridging" | "Other";
  streams?: string[];
  permanent: boolean;
  summary: string;
  requirements: string[];
  url: string;
  checklist: ChecklistTemplate;
};

const HA = "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing";

const identity: ChecklistTemplate = [
  { category: "Identity", label: "Passport bio page (all current and previous passports)" },
  { category: "Identity", label: "Birth certificate or national identity card" },
  { category: "Identity", label: "Recent passport-sized photograph" },
  { category: "Identity", label: "Change of name evidence", required: false },
];
const character: ChecklistTemplate = [
  { category: "Character", label: "Police certificates (each country lived 12+ months in the last 10 years since age 16)" },
  { category: "Character", label: "Form 80 (personal particulars for assessment)", required: false },
];
const health: ChecklistTemplate = [{ category: "Health", label: "Health examinations (HAP ID via My Health Declarations)" }];
const english: ChecklistTemplate = [{ category: "English", label: "English test results (IELTS, PTE, TOEFL iBT, OET, CAE) or exemption evidence" }];
const skilled: ChecklistTemplate = [
  ...identity,
  { category: "Skills", label: "Positive skills assessment for the nominated occupation" },
  ...english,
  { category: "Qualifications", label: "Qualification certificates and academic transcripts" },
  { category: "Employment", label: "Employment references, contracts and payslips for claimed skilled employment" },
  { category: "Employment", label: "Tax records / superannuation statements for claimed employment", required: false },
  { category: "Points", label: "Evidence for each points claim (Professional Year, NAATI CCL, regional study, partner skills)" },
  { category: "Family", label: "Marriage / de facto evidence and partner documents", required: false },
  ...character,
  ...health,
];
const partner: ChecklistTemplate = [
  ...identity,
  { category: "Relationship", label: "Marriage certificate or de facto relationship evidence (12 months or registration)" },
  { category: "Relationship", label: "Financial aspects: joint accounts, shared expenses, leases" },
  { category: "Relationship", label: "Nature of the household: shared address, bills, responsibilities" },
  { category: "Relationship", label: "Social aspects: joint invitations, travel, photos together" },
  { category: "Relationship", label: "Commitment: relationship history statements from both partners" },
  { category: "Relationship", label: "Form 888 statutory declarations from Australian citizens or PRs (2+)" },
  { category: "Sponsor", label: "Sponsor's proof of citizenship, PR or eligible NZ citizenship" },
  { category: "Sponsor", label: "Sponsor's police certificates" },
  ...character,
  ...health,
];
const student: ChecklistTemplate = [
  ...identity,
  { category: "Enrolment", label: "Confirmation of Enrolment (CoE) for each course" },
  { category: "Genuine Student", label: "Genuine Student statement and supporting evidence" },
  { category: "Financial", label: "Evidence of funds for tuition, travel and living costs" },
  { category: "Health", label: "Overseas Student Health Cover (OSHC) for the full stay" },
  ...english,
  { category: "Guardian", label: "Welfare arrangements (CAAW) or guardian (Form 157N) for under-18s", required: false },
  ...character,
  ...health,
];
const employer: ChecklistTemplate = [
  ...identity,
  { category: "Nomination", label: "Approved nomination (TRN) by the sponsoring employer" },
  { category: "Skills", label: "Qualifications and evidence of required work experience" },
  { category: "Skills", label: "Skills assessment (where required for the occupation or nationality)", required: false },
  ...english,
  { category: "Employment", label: "Employment contract with salary and conditions" },
  { category: "Employment", label: "CV and employment references" },
  { category: "Health", label: "Health insurance (temporary visas)", required: false },
  ...character,
  ...health,
];
const sponsorEmployer: ChecklistTemplate = [
  { category: "Business", label: "ABN, ASIC extract and evidence the business is lawfully operating" },
  { category: "Business", label: "Financial statements, BAS and tax returns" },
  { category: "Labour market", label: "Labour market testing evidence (advertisements, results)" },
  { category: "Position", label: "Position description, organisation chart and genuine need statement" },
  { category: "Salary", label: "Annual market salary rate evidence (comparable employees, enterprise agreement)" },
  { category: "Training", label: "Skilling Australians Fund (SAF) levy payment" },
];

export const visas: Visa[] = [
  {
    code: "189", name: "Skilled Independent", category: "Skilled", streams: ["Points-tested", "New Zealand"], permanent: true,
    summary: "Permanent visa for invited skilled workers who aren't sponsored by an employer, state or family member.",
    requirements: ["Invitation through SkillSelect", "Occupation on the MLTSSL", "Suitable skills assessment", "At least 65 points", "Under 45 at invitation", "Competent English"],
    url: `${HA}/skilled-independent-189`, checklist: skilled,
  },
  {
    code: "190", name: "Skilled Nominated", category: "Skilled", permanent: true,
    summary: "Permanent visa for skilled workers nominated by a state or territory government.",
    requirements: ["State or territory nomination", "Invitation through SkillSelect", "Occupation on the relevant state list", "Suitable skills assessment", "At least 65 points (incl. 5 for nomination)", "Under 45", "Competent English"],
    url: `${HA}/skilled-nominated-190`,
    checklist: [...skilled, { category: "Nomination", label: "State nomination approval letter" }, { category: "Nomination", label: "Evidence for the state's own criteria (residence, employment, commitment)" }],
  },
  {
    code: "491", name: "Skilled Work Regional (Provisional)", category: "Skilled", streams: ["State or Territory nominated", "Family sponsored"], permanent: false,
    summary: "Five-year provisional visa to live and work in regional Australia; pathway to the 191.",
    requirements: ["State nomination or eligible relative sponsorship in a designated regional area", "Invitation", "Occupation on the relevant list", "Suitable skills assessment", "At least 65 points (incl. 15 for nomination/sponsorship)", "Under 45", "Competent English"],
    url: `${HA}/skilled-work-regional-provisional-491`,
    checklist: [...skilled, { category: "Nomination", label: "Nomination letter, or relative's sponsorship (Form 1277) and evidence they live in a designated regional area" }],
  },
  {
    code: "191", name: "Permanent Residence (Skilled Regional)", category: "Skilled", permanent: true,
    summary: "Permanent visa for 491/494 holders who lived and earned the minimum taxable income in regional Australia.",
    requirements: ["Held a 491 or 494 for 3+ years", "Taxable income at or above the threshold for 3 income years", "Complied with visa conditions"],
    url: `${HA}/permanent-residence-skilled-regional-191`,
    checklist: [...identity, { category: "Income", label: "ATO notices of assessment for 3 income years" }, { category: "Regional", label: "Evidence of living and working in designated regional areas" }, ...character, ...health],
  },
  {
    code: "482", name: "Skills in Demand", category: "Employer", streams: ["Core Skills", "Specialist Skills", "Labour Agreement"], permanent: false,
    summary: "Temporary employer-sponsored visa (replaced the TSS from 7 December 2024).",
    requirements: ["Approved standard business sponsor", "Approved nomination", "1 year of relevant work experience", "Skills and qualifications for the position", "English for the stream", "Salary at or above the threshold for the stream"],
    url: `${HA}/skills-in-demand-visa-subclass-482`, checklist: employer,
  },
  {
    code: "186", name: "Employer Nomination Scheme", category: "Employer", streams: ["Temporary Residence Transition", "Direct Entry", "Labour Agreement"], permanent: true,
    summary: "Permanent employer-sponsored visa.",
    requirements: ["Approved nomination", "Under 45 (exemptions apply)", "Competent English", "TRT: 2 years with the sponsor on a 482/457", "Direct Entry: skills assessment and 3 years' experience"],
    url: `${HA}/employer-nomination-scheme-186`, checklist: employer,
  },
  {
    code: "494", name: "Skilled Employer Sponsored Regional (Provisional)", category: "Employer", streams: ["Employer sponsored", "Labour agreement"], permanent: false,
    summary: "Five-year provisional employer-sponsored regional visa; pathway to the 191.",
    requirements: ["Regional employer nomination", "Skills assessment", "3 years' relevant experience", "Under 45", "Competent English"],
    url: `${HA}/skilled-employer-sponsored-regional-494`, checklist: [...employer, { category: "Skills", label: "Positive skills assessment" }],
  },
  {
    code: "407", name: "Training", category: "Employer", streams: ["Occupational training", "Professional development", "Capacity building"], permanent: false,
    summary: "Temporary visa for workplace-based occupational training or professional development.",
    requirements: ["Nominated by an approved sponsor (or exempt)", "Training plan", "Functional English"],
    url: `${HA}/training-407`, checklist: [...identity, { category: "Training", label: "Approved nomination and structured training plan" }, ...english, ...character, ...health],
  },
  {
    code: "400", name: "Temporary Work (Short Stay Specialist)", category: "Employer", permanent: false,
    summary: "Short-term, highly specialised, non-ongoing work (usually up to 3 months).",
    requirements: ["Highly specialised skills", "Non-ongoing work", "Invitation or contract from an Australian organisation"],
    url: `${HA}/temporary-work-short-stay-specialist-400`, checklist: [...identity, { category: "Work", label: "Letter of invitation / contract describing the specialist work" }, { category: "Financial", label: "Evidence of funds" }],
  },
  {
    code: "408", name: "Temporary Activity", category: "Employer", streams: ["Entertainment", "Religious work", "Research", "Sports", "Special programs", "Invited participant", "Domestic work"], permanent: false,
    summary: "Temporary visa for specific activities: entertainment, sport, research, religious work and others.",
    requirements: ["Sponsorship or support from an Australian organisation (most streams)", "Activity in an eligible stream"],
    url: `${HA}/temporary-activity-408`, checklist: [...identity, { category: "Activity", label: "Sponsor or supporter letter describing the activity" }, ...character, ...health],
  },
  {
    code: "500", name: "Student", category: "Student", permanent: false,
    summary: "Study full-time in a registered (CRICOS) course.",
    requirements: ["Confirmation of Enrolment", "Genuine Student requirement", "Financial capacity", "OSHC", "English (unless exempt)"],
    url: `${HA}/student-500`, checklist: student,
  },
  {
    code: "590", name: "Student Guardian", category: "Student", permanent: false,
    summary: "For a parent, custodian or relative caring for a student under 18.",
    requirements: ["Student under 18 (or with exceptional circumstances)", "Funds for the stay", "Health insurance"],
    url: `${HA}/student-guardian-590`, checklist: [...identity, { category: "Relationship", label: "Evidence of relationship to the student" }, { category: "Financial", label: "Evidence of funds" }, ...character, ...health],
  },
  {
    code: "485", name: "Temporary Graduate", category: "Graduate", streams: ["Post-Vocational Education Work", "Post-Higher Education Work", "Second Post-Higher Education Work"], permanent: false,
    summary: "Live and work in Australia after completing eligible Australian study.",
    requirements: ["Australian study requirement (2 academic years, 92 weeks CRICOS)", "Eligible qualification for the stream", "Under 35 (most streams)", "English test score for the stream", "Applied within 6 months of completion", "Health insurance"],
    url: `${HA}/temporary-graduate-485`,
    checklist: [...identity, { category: "Study", label: "Completion letter and academic transcripts" }, { category: "Study", label: "Evidence of meeting the Australian study requirement" }, ...english, { category: "Health", label: "Adequate health insurance" }, ...character, ...health, { category: "Skills", label: "Skills assessment (Post-Vocational stream)", required: false }],
  },
  {
    code: "820/801", name: "Partner (onshore)", category: "Family", permanent: true,
    summary: "Temporary then permanent partner visa, applied for in Australia.",
    requirements: ["Married or de facto partner of an Australian citizen, PR or eligible NZ citizen", "Genuine and continuing relationship", "Sponsor approval", "Applicant in Australia at application"],
    url: `${HA}/partner-onshore`, checklist: partner,
  },
  {
    code: "309/100", name: "Partner (offshore)", category: "Family", permanent: true,
    summary: "Temporary then permanent partner visa, applied for outside Australia.",
    requirements: ["Married or de facto partner of an Australian citizen, PR or eligible NZ citizen", "Genuine and continuing relationship", "Applicant outside Australia at application and decision"],
    url: `${HA}/partner-offshore`, checklist: partner,
  },
  {
    code: "300", name: "Prospective Marriage", category: "Family", permanent: false,
    summary: "Come to Australia to marry a prospective spouse, then apply for a partner visa.",
    requirements: ["Intention to marry within the visa period", "Met in person as adults", "Genuine relationship"],
    url: `${HA}/prospective-marriage-300`, checklist: [...partner, { category: "Relationship", label: "Notice of Intended Marriage" }],
  },
  {
    code: "143", name: "Contributory Parent", category: "Family", permanent: true,
    summary: "Permanent visa for parents of settled Australian citizens or PRs (contributory).",
    requirements: ["Balance of family test", "Sponsor settled 2+ years", "Assurance of support", "Contributory second instalment"],
    url: `${HA}/contributory-parent-143`,
    checklist: [...identity, { category: "Family", label: "Birth certificates proving parent–child relationship" }, { category: "Family", label: "Balance of family test evidence for all children" }, { category: "Sponsor", label: "Sponsor's citizenship / PR and settled evidence" }, { category: "Financial", label: "Assurance of support" }, ...character, ...health],
  },
  {
    code: "870", name: "Sponsored Parent (Temporary)", category: "Family", permanent: false,
    summary: "Parents visit their children in Australia for up to 3 or 5 years at a time.",
    requirements: ["Approved parent sponsor", "Genuine temporary entrant", "Health insurance"],
    url: `${HA}/sponsored-parent-temporary-870`, checklist: [...identity, { category: "Sponsor", label: "Approved parent sponsorship" }, { category: "Health", label: "Health insurance for the stay" }, ...character, ...health],
  },
  {
    code: "101", name: "Child (offshore)", category: "Family", permanent: true,
    summary: "For a dependent child of an Australian citizen or PR, outside Australia.",
    requirements: ["Dependent child of the sponsor", "Under 18, or 18–25 studying full-time and dependent"],
    url: `${HA}/child-offshore-101`, checklist: [...identity, { category: "Family", label: "Birth certificate naming the sponsor parent" }, { category: "Custody", label: "Custody documents / consent from the other parent" }, ...character, ...health],
  },
  {
    code: "600", name: "Visitor", category: "Visitor", streams: ["Tourist", "Sponsored family", "Business visitor", "Approved destination status", "Frequent traveller"], permanent: false,
    summary: "Visit Australia for tourism, family or business visitor activities.",
    requirements: ["Genuine temporary stay", "Enough money for the stay", "Health and character"],
    url: `${HA}/visitor-600`, checklist: [...identity, { category: "Financial", label: "Bank statements / evidence of funds" }, { category: "Ties", label: "Employment or study ties to home country" }, { category: "Purpose", label: "Itinerary or invitation letter" }],
  },
  {
    code: "417", name: "Working Holiday", category: "Visitor", permanent: false,
    summary: "Holiday and work for up to 12 months (second and third years with specified work).",
    requirements: ["Eligible passport", "Aged 18–30 (35 for some countries)", "Funds", "Specified work evidence for second/third visa"],
    url: `${HA}/work-holiday-417`, checklist: [...identity, { category: "Financial", label: "Evidence of AUD 5,000 in funds" }, { category: "Work", label: "Payslips for specified work (second/third visa)", required: false }],
  },
  {
    code: "462", name: "Work and Holiday", category: "Visitor", permanent: false,
    summary: "Holiday and work for up to 12 months for eligible countries; government support letter for some.",
    requirements: ["Eligible passport", "Aged 18–30 (35 for some)", "Education and English requirements", "Funds"],
    url: `${HA}/work-holiday-462`, checklist: [...identity, ...english, { category: "Education", label: "Evidence of tertiary education" }, { category: "Financial", label: "Evidence of funds" }],
  },
  {
    code: "188", name: "Business Innovation and Investment (Provisional)", category: "Business", streams: ["Business Innovation", "Investor", "Significant Investor", "Entrepreneur"], permanent: false,
    summary: "Closed to new applications from July 2024; existing holders continue to the 888.",
    requirements: ["Existing applications and holders only"],
    url: `${HA}/business-innovation-and-investment-188`, checklist: [...identity, { category: "Business", label: "Business and investment evidence" }],
  },
  {
    code: "888", name: "Business Innovation and Investment (Permanent)", category: "Business", permanent: true,
    summary: "Permanent stage for 188 holders who met their business or investment requirements.",
    requirements: ["Held a 188", "Met the stream's business, investment or residence requirements"],
    url: `${HA}/business-innovation-and-investment-888`, checklist: [...identity, { category: "Business", label: "Turnover, ownership and investment evidence for the stream" }, ...character, ...health],
  },
  {
    code: "858", name: "National Innovation", category: "Business", permanent: true,
    summary: "Permanent visa for people with an internationally recognised record of exceptional achievement.",
    requirements: ["Exceptional, internationally recognised achievements", "Asset to Australia", "Nominator with a national reputation in the same field"],
    url: `${HA}/national-innovation-visa-858`, checklist: [...identity, { category: "Achievement", label: "Evidence of international recognition (awards, publications, media)" }, { category: "Nomination", label: "Form 1000 nomination" }, ...character, ...health],
  },
  {
    code: "866", name: "Protection", category: "Humanitarian", permanent: true,
    summary: "Permanent protection for people in Australia who engage Australia's protection obligations.",
    requirements: ["Arrived lawfully", "Refugee or complementary protection criteria"],
    url: `${HA}/protection-866`, checklist: [...identity, { category: "Claims", label: "Statement of protection claims" }, { category: "Claims", label: "Supporting evidence of claims" }, ...character, ...health],
  },
  {
    code: "010", name: "Bridging A", category: "Bridging", permanent: false,
    summary: "Keeps you lawful while a substantive visa application made in Australia is decided.",
    requirements: ["Valid substantive application lodged while holding a substantive visa"],
    url: `${HA}/bridging-visa-a-010`, checklist: [],
  },
  {
    code: "020", name: "Bridging B", category: "Bridging", permanent: false,
    summary: "Lets a Bridging A or B holder travel and return while their application is processed.",
    requirements: ["Holding a BVA or BVB", "Substantial reasons for travel"],
    url: `${HA}/bridging-visa-b-020`, checklist: [{ category: "Travel", label: "Evidence of the reason for travel" }],
  },
  {
    code: "CIT", name: "Australian citizenship (by conferral)", category: "Other", permanent: true,
    summary: "Citizenship application for permanent residents who meet the residence requirement.",
    requirements: ["4 years' lawful residence including 1 year as a PR", "Not absent more than 12 months in total (90 days in the last year)", "Citizenship test", "Good character"],
    url: "https://immi.homeaffairs.gov.au/citizenship/become-a-citizen/permanent-resident",
    checklist: [...identity, { category: "Residence", label: "Movement records and residence calculator printout" }, { category: "Identity", label: "Identity declaration with photos" }, ...character],
  },
  {
    code: "ART", name: "Administrative Review Tribunal application", category: "Other", permanent: false,
    summary: "Merits review of a refused or cancelled visa decision.",
    requirements: ["Reviewable decision", "Lodged within the time limit in the decision notice", "Application fee"],
    url: "https://www.art.gov.au/applying-review/migration-and-protection",
    checklist: [{ category: "Decision", label: "Decision record and notification letter" }, { category: "Submissions", label: "Written submissions and new evidence" }, ...identity],
  },
  {
    code: "SBS", name: "Standard Business Sponsorship", category: "Employer", permanent: false,
    summary: "Approval for an employer to sponsor workers (482 and others).",
    requirements: ["Lawfully operating business", "No adverse information", "Commitment to sponsorship obligations"],
    url: "https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/sponsoring-workers/learn-about-sponsoring/standard-business-sponsor",
    checklist: sponsorEmployer,
  },
  {
    code: "SA", name: "Skills assessment", category: "Other", permanent: false,
    summary: "Assessment by the relevant authority (ACS, Engineers Australia, VETASSESS, TRA, ANMAC and others).",
    requirements: ["Qualification and employment meeting the authority's criteria"],
    url: "https://immi.homeaffairs.gov.au/visas/working-in-australia/skills-assessment",
    checklist: [...identity, { category: "Qualifications", label: "Qualifications and transcripts" }, { category: "Employment", label: "Employment references in the authority's format" }, { category: "Other", label: "CV and RPL report (ACS) or competency demonstration report (EA)", required: false }],
  },
];

export const visaCategories = [...new Set(visas.map((v) => v.category))];

export function visaByCode(code: string): Visa | undefined {
  return visas.find((v) => v.code === code);
}

export const stages = [
  { key: "enquiry", label: "Enquiry" },
  { key: "consultation", label: "Consultation" },
  { key: "engaged", label: "Engaged" },
  { key: "documents", label: "Collecting documents" },
  { key: "ready", label: "Ready to lodge" },
  { key: "lodged", label: "Lodged" },
  { key: "rfi", label: "Further information" },
  { key: "decision", label: "Decision" },
  { key: "closed", label: "Closed" },
] as const;
export type StageKey = (typeof stages)[number]["key"];
