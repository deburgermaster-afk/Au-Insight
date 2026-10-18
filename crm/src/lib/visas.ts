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
  // ── Skilled (more) ──
  {
    code: "887", name: "Skilled Regional", category: "Skilled", permanent: true,
    summary: "Permanent visa for holders of eligible provisional regional skilled visas (489, 495, 496, 475, 487) who lived and worked regionally.",
    requirements: ["Held an eligible provisional skilled regional visa", "Lived 2 years in a designated regional area", "Worked full-time 1 year in a designated regional area"],
    url: `${HA}/skilled-regional-887`,
    checklist: [...identity, { category: "Residence", label: "Evidence of 2 years' residence in a designated regional area (leases, bills)" }, { category: "Employment", label: "Evidence of 1 year's full-time regional work (payslips, tax returns, references)" }, ...character, ...health],
  },
  {
    code: "476", name: "Skilled-Recognised Graduate", category: "Graduate", permanent: false,
    summary: "18-month visa for recent engineering graduates of specified overseas institutions.",
    requirements: ["Engineering degree from a specified institution, completed in the last 2 years", "Under 31", "Competent English"],
    url: `${HA}/skilled-recognised-graduate-476`,
    checklist: [...identity, { category: "Study", label: "Degree certificate and transcripts from a specified institution" }, ...english, { category: "Health", label: "Adequate health insurance" }, ...character, ...health],
  },
  {
    code: "192", name: "Pacific Engagement", category: "Skilled", permanent: true,
    summary: "Permanent visa by ballot for citizens of participating Pacific countries and Timor-Leste.",
    requirements: ["Selected in the Pacific Engagement Visa ballot", "Citizen of a participating country", "Formal job offer in Australia", "Aged 18–45 at registration", "Basic English"],
    url: `${HA}/pacific-engagement-visa-192`,
    checklist: [...identity, { category: "Ballot", label: "Ballot selection and invitation letter" }, { category: "Employment", label: "Formal ongoing job offer in Australia" }, ...english, ...character, ...health],
  },
  {
    code: "124", name: "Distinguished Talent", category: "Skilled", permanent: true,
    summary: "Permanent visa for people with an internationally recognised record of exceptional achievement.",
    requirements: ["Exceptional and outstanding achievement in a profession, sport, the arts or research", "Still prominent in the field", "Nominator with a national reputation in the field"],
    url: `${HA}/distinguished-talent-124`,
    checklist: [...identity, { category: "Talent", label: "Evidence of international recognition (awards, publications, media)" }, { category: "Nomination", label: "Form 1000 nomination from an Australian of national reputation" }, ...character, ...health],
  },
  {
    code: "189-NZ", name: "Skilled Independent (New Zealand stream)", category: "Skilled", permanent: true,
    summary: "Permanent residence for New Zealand citizens who have lived in Australia for 4 years.",
    requirements: ["New Zealand citizen holding a 444", "Lived in Australia for at least 4 years", "Taxable income at or above the threshold for 4 years (or other criteria)"],
    url: `${HA}/skilled-independent-189/new-zealand`,
    checklist: [...identity, { category: "Residence", label: "Evidence of 4 years' residence in Australia" }, { category: "Income", label: "ATO notices of assessment for each income year" }, ...character, ...health],
  },
  // ── Employer (more) ──
  {
    code: "187", name: "Regional Sponsored Migration Scheme", category: "Employer", streams: ["Temporary Residence Transition"], permanent: true,
    summary: "Permanent visa for transitional 457/482 holders in regional Australia (closed to new Direct Entry applications).",
    requirements: ["Transitional regional sponsor nomination", "Held a 457/482 in the position", "Under 45 (exemptions apply)", "Competent English"],
    url: `${HA}/regional-sponsored-migration-scheme-187`, checklist: employer,
  },
  {
    code: "403", name: "Temporary Work (International Relations)", category: "Employer", streams: ["Pacific Australia Labour Mobility (PALM)", "Government Agreement", "Foreign Government Agency", "Domestic Worker (Diplomatic)", "Privileges and Immunities"], permanent: false,
    summary: "Temporary work under international agreements, including the PALM scheme.",
    requirements: ["Eligible under an international agreement or PALM", "Sponsorship by an approved employer or body"],
    url: `${HA}/temporary-work-403`,
    checklist: [...identity, { category: "Sponsor", label: "Approved employer or government sponsor letter" }, { category: "Employment", label: "Offer of employment and conditions" }, { category: "Health", label: "Health insurance" }, ...character, ...health],
  },
  {
    code: "482-LA", name: "Labour Agreement (482/186/494)", category: "Employer", permanent: false,
    summary: "Employer-sponsored visas under a company, industry, project or Designated Area Migration Agreement (DAMA).",
    requirements: ["Employer party to a labour agreement or DAMA", "Occupation and concessions covered by the agreement"],
    url: "https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/sponsoring-workers/nominating-a-position/labour-agreements",
    checklist: [...sponsorEmployer, ...employer],
  },
  {
    code: "NOM", name: "Employer nomination", category: "Employer", permanent: false,
    summary: "The employer's nomination of a position (482, 186, 494, 407) before or with the visa application.",
    requirements: ["Approved sponsor (where required)", "Genuine position", "Market salary at or above the income threshold", "Labour market testing (where required)"],
    url: "https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/sponsoring-workers/nominating-a-position",
    checklist: sponsorEmployer,
  },
  // ── Family (more) ──
  {
    code: "103", name: "Parent", category: "Family", permanent: true,
    summary: "Non-contributory permanent parent visa (very long queue).",
    requirements: ["Child is a settled Australian citizen, PR or eligible NZ citizen", "Balance of family test", "Assurance of support", "Sponsorship"],
    url: `${HA}/parent-103`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificates proving the parent–child relationship" }, { category: "Family", label: "Balance of family test evidence (all children's residence)" }, { category: "Sponsor", label: "Sponsor's citizenship/PR and settled evidence" }, { category: "Assurance", label: "Assurance of Support (Services Australia)" }, ...character, ...health],
  },
  {
    code: "173", name: "Contributory Parent (Temporary)", category: "Family", permanent: false,
    summary: "2-year temporary contributory parent visa, leading to the 143.",
    requirements: ["Balance of family test", "Sponsorship by a settled child", "First instalment of the contributory charge"],
    url: `${HA}/contributory-parent-temporary-173`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificates proving the parent–child relationship" }, { category: "Family", label: "Balance of family test evidence" }, { category: "Sponsor", label: "Sponsor's citizenship/PR and settled evidence" }, ...character, ...health],
  },
  {
    code: "804", name: "Aged Parent", category: "Family", permanent: true,
    summary: "Non-contributory permanent visa for aged parents in Australia.",
    requirements: ["Old enough for the Age Pension", "Balance of family test", "In Australia at application", "Assurance of support"],
    url: `${HA}/aged-parent-804`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificates proving the parent–child relationship" }, { category: "Family", label: "Balance of family test evidence" }, { category: "Assurance", label: "Assurance of Support" }, ...character, ...health],
  },
  {
    code: "864", name: "Contributory Aged Parent", category: "Family", permanent: true,
    summary: "Permanent contributory visa for aged parents applying in Australia.",
    requirements: ["Old enough for the Age Pension", "Balance of family test", "Contributory charge and assurance of support"],
    url: `${HA}/contributory-aged-parent-864`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificates proving the parent–child relationship" }, { category: "Family", label: "Balance of family test evidence" }, { category: "Assurance", label: "Assurance of Support" }, ...character, ...health],
  },
  {
    code: "884", name: "Contributory Aged Parent (Temporary)", category: "Family", permanent: false,
    summary: "2-year temporary contributory visa for aged parents in Australia, leading to the 864.",
    requirements: ["Old enough for the Age Pension", "Balance of family test", "First instalment of the contributory charge"],
    url: `${HA}/contributory-aged-parent-temporary-884`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificates proving the parent–child relationship" }, { category: "Family", label: "Balance of family test evidence" }, ...character, ...health],
  },
  {
    code: "802", name: "Child (onshore)", category: "Family", permanent: true,
    summary: "Permanent visa for a dependent child of an Australian citizen or PR, applying in Australia.",
    requirements: ["Dependent child of the sponsor", "Under 18, or 18–24 and studying, or incapacitated", "In Australia at application"],
    url: `${HA}/child-802`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificate naming the sponsoring parent" }, { category: "Custody", label: "Custody orders or consent from the other parent (Form 1229)" }, { category: "Dependency", label: "Evidence of study or dependency (18+)", required: false }, ...character, ...health],
  },
  {
    code: "102", name: "Adoption", category: "Family", permanent: true,
    summary: "For a child adopted, or being adopted, from overseas by an Australian citizen or PR.",
    requirements: ["Under 18", "Adopted or being adopted through an Australian state/territory authority or lawful overseas adoption"],
    url: `${HA}/adoption-102`,
    checklist: [...identity, { category: "Adoption", label: "Adoption order or state/territory approval" }, { category: "Sponsor", label: "Adoptive parent's citizenship/PR evidence" }, ...health],
  },
  {
    code: "445", name: "Dependent Child", category: "Family", permanent: false,
    summary: "Temporary visa for a dependent child of a temporary partner visa (820/309) holder.",
    requirements: ["Dependent child of a 820 or 309 holder", "Sponsorship"],
    url: `${HA}/dependent-child-445`,
    checklist: [...identity, { category: "Relationship", label: "Birth certificate and parent's partner visa grant" }, { category: "Custody", label: "Consent from the other parent (Form 1229)" }, ...health],
  },
  {
    code: "117", name: "Orphan Relative", category: "Family", permanent: true,
    summary: "For a child outside Australia whose parents can't care for them, sponsored by a relative.",
    requirements: ["Under 18", "Parents dead, missing or incapacitated", "Sponsored by an Australian relative"],
    url: `${HA}/orphan-relative-117`,
    checklist: [...identity, { category: "Circumstances", label: "Death certificates or evidence parents can't care for the child" }, { category: "Relationship", label: "Evidence of relationship to the sponsor" }, ...health],
  },
  {
    code: "837", name: "Orphan Relative (onshore)", category: "Family", permanent: true,
    summary: "Onshore version of the Orphan Relative visa.",
    requirements: ["Under 18 and in Australia", "Parents dead, missing or incapacitated", "Sponsored by an Australian relative"],
    url: `${HA}/orphan-relative-837`,
    checklist: [...identity, { category: "Circumstances", label: "Death certificates or evidence parents can't care for the child" }, { category: "Relationship", label: "Evidence of relationship to the sponsor" }, ...health],
  },
  {
    code: "114", name: "Aged Dependent Relative", category: "Family", permanent: true,
    summary: "For an older single relative who depends on an Australian relative (long queue).",
    requirements: ["Old enough for the Age Pension", "Single, widowed or separated", "Financially dependent on the sponsor for 3+ years"],
    url: `${HA}/aged-dependent-relative-114`,
    checklist: [...identity, { category: "Dependency", label: "Evidence of 3+ years' financial dependence on the sponsor" }, { category: "Relationship", label: "Evidence of relationship" }, { category: "Assurance", label: "Assurance of Support" }, ...character, ...health],
  },
  {
    code: "838", name: "Aged Dependent Relative (onshore)", category: "Family", permanent: true,
    summary: "Onshore version of the Aged Dependent Relative visa.",
    requirements: ["Old enough for the Age Pension", "Single, widowed or separated", "Financially dependent on the sponsor"],
    url: `${HA}/aged-dependent-relative-838`,
    checklist: [...identity, { category: "Dependency", label: "Evidence of financial dependence on the sponsor" }, { category: "Relationship", label: "Evidence of relationship" }, ...character, ...health],
  },
  {
    code: "115", name: "Remaining Relative", category: "Family", permanent: true,
    summary: "For someone whose only near relatives are in Australia (long queue).",
    requirements: ["All near relatives are Australian citizens or PRs living in Australia", "No near relatives overseas"],
    url: `${HA}/remaining-relative-115`,
    checklist: [...identity, { category: "Family", label: "Evidence of every near relative's residence and status" }, { category: "Assurance", label: "Assurance of Support" }, ...character, ...health],
  },
  {
    code: "835", name: "Remaining Relative (onshore)", category: "Family", permanent: true,
    summary: "Onshore version of the Remaining Relative visa.",
    requirements: ["All near relatives are in Australia", "In Australia at application"],
    url: `${HA}/remaining-relative-835`,
    checklist: [...identity, { category: "Family", label: "Evidence of every near relative's residence and status" }, ...character, ...health],
  },
  {
    code: "116", name: "Carer", category: "Family", permanent: true,
    summary: "For someone who will care for an Australian relative with a long-term medical condition.",
    requirements: ["Relative has a medical condition needing direct assistance for 2+ years", "Bupa Medical Visa Services assessment", "Care can't be obtained from welfare or other relatives"],
    url: `${HA}/carer-116`,
    checklist: [...identity, { category: "Medical", label: "Bupa Medical Visa Services impairment assessment for the relative" }, { category: "Relationship", label: "Evidence of relationship to the person needing care" }, ...character, ...health],
  },
  {
    code: "836", name: "Carer (onshore)", category: "Family", permanent: true,
    summary: "Onshore version of the Carer visa.",
    requirements: ["Relative has a medical condition needing direct assistance for 2+ years", "Bupa Medical Visa Services assessment"],
    url: `${HA}/carer-836`,
    checklist: [...identity, { category: "Medical", label: "Bupa Medical Visa Services impairment assessment for the relative" }, { category: "Relationship", label: "Evidence of relationship" }, ...character, ...health],
  },
  {
    code: "461", name: "New Zealand Citizen Family Relationship", category: "Family", permanent: false,
    summary: "5-year visa for non-NZ family members of a New Zealand citizen living in Australia.",
    requirements: ["Family member of an NZ citizen holding a 444", "Not a NZ citizen"],
    url: `${HA}/new-zealand-citizen-family-relationship-temporary-461`,
    checklist: [...identity, { category: "Relationship", label: "Evidence of the family relationship to the NZ citizen" }, ...character, ...health],
  },
  {
    code: "PI", name: "Partner sponsorship (sponsor application)", category: "Family", permanent: false,
    summary: "Sponsor approval for partner (and prospective marriage) visas, assessed before the visa is granted.",
    requirements: ["Australian citizen, PR or eligible NZ citizen", "Character (police checks)", "Limits on previous sponsorships"],
    url: "https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-listing/partner-onshore/sponsor",
    checklist: [...identity, { category: "Sponsor", label: "Proof of citizenship or PR" }, { category: "Sponsor", label: "Australian and overseas police certificates" }, { category: "Sponsor", label: "Details of previous sponsorships", required: false }],
  },
  // ── Visitor (more) ──
  {
    code: "601", name: "Electronic Travel Authority", category: "Visitor", permanent: false,
    summary: "Visit for tourism or business visitor activities for up to 3 months per visit (eligible passports, via the app).",
    requirements: ["Eligible passport", "Genuine visit", "Outside Australia at application"],
    url: `${HA}/electronic-travel-authority-601`, checklist: [{ category: "Identity", label: "Eligible passport" }],
  },
  {
    code: "651", name: "eVisitor", category: "Visitor", permanent: false,
    summary: "Free visitor visa for European passport holders, up to 3 months per visit.",
    requirements: ["Eligible European passport", "Genuine visit"],
    url: `${HA}/evisitor-651`, checklist: [{ category: "Identity", label: "Eligible passport" }],
  },
  {
    code: "602", name: "Medical Treatment", category: "Visitor", permanent: false,
    summary: "Temporary visa to receive medical treatment or support someone who is.",
    requirements: ["Arranged medical treatment or supporting a patient", "Funds for treatment and stay"],
    url: `${HA}/medical-treatment-602`,
    checklist: [...identity, { category: "Medical", label: "Letter from the treating doctor or hospital (treatment, cost, duration)" }, { category: "Financial", label: "Evidence of funds to pay for treatment" }, ...health],
  },
  {
    code: "771", name: "Transit", category: "Visitor", permanent: false,
    summary: "Transit through Australia for up to 72 hours.",
    requirements: ["Confirmed onward travel within 72 hours", "Visa for the destination"],
    url: `${HA}/transit-771`, checklist: [{ category: "Identity", label: "Passport" }, { category: "Travel", label: "Confirmed onward ticket and destination visa" }],
  },
  {
    code: "988", name: "Maritime Crew", category: "Visitor", permanent: false,
    summary: "For crew of non-military ships travelling to Australia.",
    requirements: ["Crew member of a non-military ship"],
    url: `${HA}/maritime-crew-988`, checklist: [{ category: "Identity", label: "Passport and seafarer's identity document" }, { category: "Employment", label: "Letter from the shipping company" }],
  },
  // ── Business (more) ──
  {
    code: "132", name: "Business Talent", category: "Business", streams: ["Significant Business History", "Venture Capital Entrepreneur"], permanent: true,
    summary: "Permanent business visa (closed to new nominations; existing applications continue).",
    requirements: ["State or territory nomination", "Significant business history or venture capital funding"],
    url: `${HA}/business-talent-132`,
    checklist: [...identity, { category: "Business", label: "Business ownership, turnover and asset evidence" }, { category: "Nomination", label: "State or territory nomination" }, ...character, ...health],
  },
  // ── Humanitarian (more) ──
  {
    code: "200", name: "Refugee", category: "Humanitarian", permanent: true,
    summary: "Offshore permanent visa for people subject to persecution, usually referred by UNHCR.",
    requirements: ["Living outside their home country", "Subject to persecution", "Referral (UNHCR) or proposal"],
    url: `${HA}/refugee-200`,
    checklist: [...identity, { category: "Claims", label: "UNHCR referral or registration" }, { category: "Claims", label: "Statement of persecution claims" }, ...health],
  },
  {
    code: "202", name: "Global Special Humanitarian", category: "Humanitarian", permanent: true,
    summary: "For people facing substantial discrimination amounting to gross violation of human rights, proposed by an Australian.",
    requirements: ["Substantial discrimination in home country", "Proposed by an Australian citizen, PR, eligible NZ citizen or organisation (Form 681)"],
    url: `${HA}/global-special-humanitarian-202`,
    checklist: [...identity, { category: "Proposal", label: "Form 681 proposal and proposer's status evidence" }, { category: "Claims", label: "Statement of claims and supporting evidence" }, ...health],
  },
  {
    code: "785", name: "Temporary Protection", category: "Humanitarian", permanent: false,
    summary: "Temporary protection for people who arrived without a valid visa and engage protection obligations.",
    requirements: ["Engages Australia's protection obligations", "Arrived without a valid visa"],
    url: `${HA}/temporary-protection-785`,
    checklist: [...identity, { category: "Claims", label: "Statement of protection claims" }, { category: "Claims", label: "Country information and supporting evidence" }, ...character, ...health],
  },
  {
    code: "790", name: "Safe Haven Enterprise", category: "Humanitarian", permanent: false,
    summary: "5-year protection visa for people who arrived without a valid visa, with pathways for regional work or study.",
    requirements: ["Engages Australia's protection obligations", "Arrived without a valid visa"],
    url: `${HA}/safe-haven-enterprise-790`,
    checklist: [...identity, { category: "Claims", label: "Statement of protection claims" }, ...character, ...health],
  },
  {
    code: "851", name: "Resolution of Status", category: "Humanitarian", permanent: true,
    summary: "Permanent visa for eligible TPV/SHEV holders and certain long-term temporary visa holders.",
    requirements: ["Held or applied for an eligible TPV/SHEV (or other eligible visa) on the specified date"],
    url: `${HA}/resolution-of-status-851`,
    checklist: [...identity, { category: "Status", label: "Current TPV/SHEV grant notice" }, ...character, ...health],
  },
  {
    code: "449", name: "Humanitarian Stay (Temporary)", category: "Humanitarian", permanent: false,
    summary: "Short-term visa for people displaced or at risk, while longer-term options are considered.",
    requirements: ["Displaced or at risk of harm", "Invited by the Department"],
    url: `${HA}/humanitarian-stay-temporary-449`, checklist: [...identity, ...health],
  },
  {
    code: "786", name: "Temporary (Humanitarian Concern)", category: "Humanitarian", permanent: false,
    summary: "3-year visa for 449 holders of humanitarian concern.",
    requirements: ["Holds a 449", "Of humanitarian concern"],
    url: `${HA}/temporary-humanitarian-concern-786`, checklist: [...identity, ...character, ...health],
  },
  {
    code: "MIN", name: "Ministerial intervention request", category: "Humanitarian", permanent: false,
    summary: "Request for the Minister to substitute a more favourable decision after a Tribunal decision (s351/s417/s501J).",
    requirements: ["Tribunal (ART) decision affirmed", "Unique or exceptional circumstances under the Minister's guidelines"],
    url: "https://immi.homeaffairs.gov.au/what-we-do/ministerial-intervention",
    checklist: [{ category: "Decision", label: "Tribunal decision record" }, { category: "Submissions", label: "Submission addressing the Minister's guidelines" }, { category: "Evidence", label: "Supporting evidence (family, health, community ties)" }],
  },
  // ── Bridging (more) ──
  {
    code: "030", name: "Bridging C", category: "Bridging", permanent: false,
    summary: "Lets an applicant without a substantive visa stay while a further application is processed.",
    requirements: ["Valid application made while not holding a substantive visa"],
    url: `${HA}/bridging-visa-c-030`, checklist: [{ category: "Application", label: "Acknowledgement of the substantive application" }],
  },
  {
    code: "050/051", name: "Bridging E", category: "Bridging", permanent: false,
    summary: "Lets an unlawful non-citizen stay lawfully while they make arrangements to leave or finalise their immigration matter.",
    requirements: ["Unlawful non-citizen or holding a BVE", "Making arrangements to leave, or awaiting a decision/review"],
    url: `${HA}/bridging-visa-e-050-051`, checklist: [...identity, { category: "Circumstances", label: "Evidence of departure plans or pending matter" }],
  },
  {
    code: "070", name: "Bridging R (Removal Pending)", category: "Bridging", permanent: false,
    summary: "Release from immigration detention while removal is not reasonably practicable.",
    requirements: ["In immigration detention", "Removal not reasonably practicable"],
    url: `${HA}/bridging-visa-r-070`, checklist: [...identity],
  },
  // ── Other ──
  {
    code: "155/157", name: "Resident Return", category: "Other", permanent: true,
    summary: "Lets a permanent resident or former citizen travel and return as a PR.",
    requirements: ["Lived in Australia 2 of the last 5 years as a PR, or substantial ties"],
    url: `${HA}/resident-return-155-157`,
    checklist: [...identity, { category: "Residence", label: "Movement records or evidence of substantial ties" }],
  },
  {
    code: "151", name: "Former Resident", category: "Other", permanent: true,
    summary: "For former residents with significant ties, including ex-Australian Defence Force members.",
    requirements: ["Former PR who spent most of their life in Australia, or ADF service"],
    url: `${HA}/former-resident-151`, checklist: [...identity, { category: "Residence", label: "Evidence of former residence or ADF service" }, ...character, ...health],
  },
  {
    code: "444", name: "Special Category (New Zealand)", category: "Other", permanent: false,
    summary: "Granted on arrival to New Zealand citizens.",
    requirements: ["New Zealand passport", "Meet health and character requirements"],
    url: `${HA}/special-category-444`, checklist: [{ category: "Identity", label: "New Zealand passport" }],
  },
  {
    code: "CIT-D", name: "Australian citizenship (by descent)", category: "Other", permanent: true,
    summary: "Citizenship for a person born overseas to an Australian citizen parent.",
    requirements: ["A parent was an Australian citizen at the time of birth", "Good character (18+)"],
    url: "https://immi.homeaffairs.gov.au/citizenship/become-a-citizen/citizenship-by-descent",
    checklist: [...identity, { category: "Parent", label: "Parent's Australian citizenship evidence" }, { category: "Relationship", label: "Full birth certificate naming the parent" }],
  },
  {
    code: "CIT-E", name: "Evidence of Australian citizenship", category: "Other", permanent: true,
    summary: "A certificate proving someone is already an Australian citizen.",
    requirements: ["Already an Australian citizen (e.g. born in Australia to a citizen or PR parent)"],
    url: "https://immi.homeaffairs.gov.au/citizenship/certificates/evidence-of-australian-citizenship",
    checklist: [...identity, { category: "Evidence", label: "Australian birth certificate and parent's status at birth" }],
  },
  {
    code: "CANC", name: "Visa cancellation response", category: "Other", permanent: false,
    summary: "Responding to a Notice of Intention to Consider Cancellation (NOICC) or a mandatory cancellation (s501).",
    requirements: ["Response within the notice's time limit", "Address each ground and Ministerial Direction factors"],
    url: "https://immi.homeaffairs.gov.au/visas/already-have-a-visa/visa-cancellation",
    checklist: [{ category: "Notice", label: "NOICC or cancellation notice" }, { category: "Submissions", label: "Written response to each ground" }, { category: "Evidence", label: "Character references, family and community ties evidence" }],
  },
];


// ── Fuller checklists ──
// Forms and evidence every lodged application needs, and documents specific to each visa, added to
// the starting checklists above. Agencies edit their own copy in Settings → Workflow → Checklists.
const APPLICATION: ChecklistTemplate = [
  { category: "Application", label: "Form 956 (Appointment of a registered migration agent) signed by the applicant" },
  { category: "Application", label: "Completed application form / ImmiAccount application reviewed and signed off by the client" },
  { category: "Application", label: "Visa application charge payment method confirmed" },
  { category: "Application", label: "Previous visa refusals, cancellations or breaches disclosed (decision records)", required: false },
];
const SPECIFIC: Record<string, ChecklistTemplate> = {
  "500": [
    { category: "Enrolment", label: "Letter of offer and signed acceptance of offer" },
    { category: "Enrolment", label: "Evidence of tuition fee payment (receipt from the provider or agency)" },
    { category: "Enrolment", label: "Scholarship or sponsorship letter", required: false },
    { category: "Qualifications", label: "Academic transcripts and completion certificates for previous study" },
    { category: "Genuine Student", label: "Explanation of any study gaps, with employment evidence" },
    { category: "Genuine Student", label: "Ties to home country: family, property, employment offers on return" },
    { category: "Financial", label: "Bank statements (3+ months) showing funds for 12 months' living costs, tuition and travel" },
    { category: "Financial", label: "Sponsor's income evidence (tax returns, payslips) and relationship to the student", required: false },
    { category: "Financial", label: "Education loan sanction letter", required: false },
    { category: "Guardian", label: "Form 1229 (consent for a child under 18) if travelling without both parents", required: false },
  ],
  "590": [{ category: "Accommodation", label: "Evidence of accommodation and welfare arrangements for the student" }],
  "485": [
    { category: "Character", label: "Australian Federal Police check (applied for before lodging)" },
    { category: "Study", label: "Course completion letter dated within the last 6 months" },
    { category: "English", label: "English test taken within 3 years before lodging (score for the stream)" },
  ],
  "189": [
    { category: "SkillSelect", label: "SkillSelect invitation letter" },
    { category: "SkillSelect", label: "EOI summary matching every claim at invitation" },
    { category: "Points", label: "Age, English, employment, study and partner points evidence (as claimed in the EOI)" },
  ],
  "190": [
    { category: "SkillSelect", label: "SkillSelect invitation letter and EOI summary" },
    { category: "Nomination", label: "State or territory nomination approval" },
    { category: "Nomination", label: "Commitment to live and work in the nominating state" },
  ],
  "491": [
    { category: "SkillSelect", label: "SkillSelect invitation letter and EOI summary" },
    { category: "Nomination", label: "State nomination approval or eligible relative sponsorship (Form 1277)" },
    { category: "Regional", label: "Evidence of an intended address in a designated regional area" },
  ],
  "482": [
    { category: "Nomination", label: "Nomination approval (TRN) with matching occupation and salary" },
    { category: "Employment", label: "Employment contract at or above the Core Skills income threshold" },
    { category: "Employment", label: "Evidence of 1 year's relevant work experience in the last 5 years" },
    { category: "English", label: "English test (IELTS 5.0 overall or equivalent) unless exempt" },
  ],
  "186": [
    { category: "Employment", label: "TRT: evidence of 2 years with the sponsor on a 482/457 (payslips, tax records)", required: false },
    { category: "Skills", label: "Direct Entry: positive skills assessment and 3 years' relevant experience", required: false },
    { category: "English", label: "Competent English evidence or exemption" },
  ],
  "494": [{ category: "Regional", label: "Position located in a designated regional area" }],
  "820/801": [
    { category: "Sponsor", label: "Form 40SP (sponsorship for a partner to migrate) completed in ImmiAccount" },
    { category: "Relationship", label: "Form 47SP details: relationship history, how you met, living arrangements" },
    { category: "Relationship", label: "Photos together over time, with dates and places" },
    { category: "Relationship", label: "801 stage: updated relationship evidence for the last 2 years", required: false },
  ],
  "309/100": [
    { category: "Sponsor", label: "Form 40SP (sponsorship for a partner to migrate)" },
    { category: "Relationship", label: "Photos together over time, with dates and places" },
    { category: "Relationship", label: "Evidence of contact while living apart (calls, messages, visits)" },
  ],
  "300": [
    { category: "Relationship", label: "Notice of Intended Marriage lodged with an authorised celebrant" },
    { category: "Relationship", label: "Evidence you have met in person as adults" },
  ],
  "143": [{ category: "Assurance", label: "Assurance of Support and bond (Services Australia)" }],
  "870": [
    { category: "Sponsor", label: "Approved parent sponsor (sponsor application approved first)" },
    { category: "Health", label: "Health insurance for the whole stay" },
  ],
  "600": [
    { category: "Travel", label: "Travel itinerary and purpose of visit" },
    { category: "Financial", label: "Bank statements showing funds for the trip" },
    { category: "Ties", label: "Employment letter with approved leave, or study enrolment" },
    { category: "Sponsor", label: "Invitation letter and sponsor's documents (Sponsored Family stream)", required: false },
    { category: "Travel", label: "Previous travel history (passport stamps, previous visas)", required: false },
  ],
  "417": [{ category: "Financial", label: "Evidence of about AUD 5,000 for initial stay and a return ticket or funds for one" }],
  "462": [
    { category: "Eligibility", label: "Government letter of support (where required for your country)" },
    { category: "Education", label: "Evidence of the education requirement" },
  ],
  "188": [
    { category: "Nomination", label: "State or territory nomination" },
    { category: "Business", label: "Business and personal assets, net worth statements" },
  ],
  "858": [{ category: "Talent", label: "Form 1000 nomination and evidence of an internationally recognised record of achievement" }],
  "866": [
    { category: "Claims", label: "Detailed statement of protection claims" },
    { category: "Claims", label: "Country information and any evidence supporting the claims" },
  ],
  CIT: [
    { category: "Citizenship", label: "Citizenship test appointment and result" },
    { category: "Identity", label: "Identity declaration signed by an eligible person, with a certified photo" },
  ],
  "010": [{ category: "Application", label: "Acknowledgement of the substantive application and the Bridging A grant notice (granted automatically)" }],
  ART: [{ category: "Time limit", label: "Date of notification of the decision and the review time limit calculated" }],
};

for (const v of visas) {
  const big = v.checklist.length >= 3 && !["ART", "SA", "MIN", "CANC", "NOM", "SBS", "PI", "444", "601", "651", "771", "988"].includes(v.code);
  const extraItems = SPECIFIC[v.code] ?? [];
  const seen = new Set(v.checklist.map((i) => i.label));
  v.checklist = [...(big ? APPLICATION : []), ...v.checklist, ...extraItems.filter((i) => !seen.has(i.label))];
}

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
