import type { ChecklistTemplate } from "@/lib/visas";

// Visa-specific documents for the subclasses the main list doesn't cover in detail, so every visa in
// the library starts with a checklist built for it. Starting points only: agencies confirm against
// the Home Affairs document checklist for the stream and edit their copy in Settings → Workflow.

const opt = false;

export const MORE_SPECIFIC: Record<string, ChecklistTemplate> = {
  // ── Skilled ──
  "191": [
    { category: "Visa history", label: "Grant notice for the 491 or 494 held for at least 3 years" },
    { category: "Regional", label: "Lease, rates or utility bills showing a regional address for each year" },
    { category: "Employment", label: "Payslips and employer letters for regional employment", required: opt },
  ],
  "189-NZ": [
    { category: "Residence", label: "Evidence of living in Australia for 5 years as a Special Category (444) visa holder" },
    { category: "Income", label: "ATO notices of assessment for the last 5 income years", required: opt },
    { category: "Identity", label: "New Zealand passport and evidence of arrival in Australia on or before 26 Feb 2001 or later SCV" },
  ],
  "887": [
    { category: "Visa history", label: "Grant notice for the eligible provisional visa (489, 495, 496, 475, 487)" },
    { category: "Regional", label: "Evidence of living 2 years in a designated regional area (lease, bills, bank statements)" },
    { category: "Employment", label: "Evidence of 1 year's full-time work in a designated regional area (payslips, PAYG summaries)" },
  ],
  "476": [
    { category: "Qualifications", label: "Engineering degree from a recognised institution (Washington Accord) completed within 2 years" },
    { category: "Qualifications", label: "Academic transcript and award certificate" },
    { category: "Age", label: "Evidence of being under 31 at the time of applying" },
  ],
  "124": [
    { category: "Talent", label: "Evidence of an internationally recognised record of exceptional achievement" },
    { category: "Talent", label: "Form 1000 nomination by an Australian citizen, PR or organisation with a national reputation" },
    { category: "Talent", label: "Letters from experts in the field", required: opt },
  ],
  // ── Employer ──
  "407": [
    { category: "Nomination", label: "Approved training nomination and the structured training plan" },
    { category: "Training", label: "Evidence the training improves skills in the occupation (registration, professional development)" },
    { category: "Financial", label: "Evidence of adequate health insurance (OVHC)" },
  ],
  "400": [
    { category: "Work", label: "Invitation or letter from the Australian organisation describing the short-term highly specialised work" },
    { category: "Work", label: "CV and evidence of the specialised skills, knowledge or experience" },
    { category: "Financial", label: "Evidence of funds and return travel arrangements" },
  ],
  "408": [
    { category: "Sponsor", label: "Temporary activities sponsor approval or support letter (by stream)" },
    { category: "Activity", label: "Letter from the organisation describing the activity, dates and location" },
    { category: "Financial", label: "Evidence of health insurance and funds for the stay" },
  ],
  "494": [
    { category: "Nomination", label: "Approved regional employer nomination (TRN)" },
    { category: "Skills", label: "Positive skills assessment for the nominated occupation" },
    { category: "Employment", label: "Evidence of 3 years' relevant work experience" },
    { category: "English", label: "Competent English evidence or exemption" },
  ],
  "187": [
    { category: "Visa history", label: "Grant notice and evidence of the transitional arrangements that apply (scheme closed to new Direct Entry)" },
    { category: "Nomination", label: "Approved RSMS nomination" },
  ],
  "403": [
    { category: "Sponsor", label: "Letter from the sponsoring government agency, foreign government or organisation (by stream)" },
    { category: "Activity", label: "Details of the work or program, dates and location" },
    { category: "Health", label: "Evidence of adequate health insurance", required: opt },
  ],
  "482-LA": [
    { category: "Nomination", label: "Labour agreement and the approved nomination under it" },
    { category: "Employment", label: "Employment contract matching the agreement's terms and salary" },
    { category: "Skills", label: "Skills, experience and English as set by the labour agreement" },
  ],
  NOM: [
    { category: "Business", label: "Approved standard business sponsorship (or application)" },
    { category: "Position", label: "Position description, organisation chart and employment contract" },
    { category: "Salary", label: "Evidence the salary meets the annual market salary rate and income threshold" },
    { category: "Labour market", label: "Labour market testing advertisements and results (unless exempt)" },
    { category: "Training", label: "Skilling Australians Fund levy payment" },
  ],
  SBS: [
    { category: "Business", label: "ABN/ACN registration and evidence the business is lawfully operating" },
    { category: "Business", label: "Financial statements, BAS and business activity statements" },
    { category: "Business", label: "Declaration of no adverse information about the business or associates" },
  ],
  // ── Family ──
  "101": [
    { category: "Relationship", label: "Full birth certificate showing both parents" },
    { category: "Sponsor", label: "Sponsor's evidence of citizenship, PR or eligible NZ citizenship" },
    { category: "Custody", label: "Form 1229 or custody orders if a parent isn't included", required: opt },
  ],
  "102": [
    { category: "Adoption", label: "Adoption order or evidence of the adoption process (Hague or overseas authority)" },
    { category: "Sponsor", label: "Sponsor's evidence of citizenship, PR or eligible NZ citizenship" },
    { category: "Custody", label: "Consent of anyone with custody rights", required: opt },
  ],
  "445": [
    { category: "Relationship", label: "Child's full birth certificate" },
    { category: "Parent", label: "Parent's partner visa application or grant notice (309/820)" },
    { category: "Custody", label: "Form 1229 or custody orders where needed", required: opt },
  ],
  "117": [
    { category: "Relationship", label: "Evidence both parents have died or are permanently incapacitated or can't be located" },
    { category: "Relationship", label: "Birth certificates showing the relationship to the sponsor" },
    { category: "Sponsor", label: "Sponsor's evidence of citizenship, PR or eligible NZ citizenship" },
  ],
  "837": [
    { category: "Relationship", label: "Evidence both parents have died or are permanently incapacitated or can't be located" },
    { category: "Relationship", label: "Birth certificates showing the relationship to the sponsor" },
  ],
  "114": [
    { category: "Dependence", label: "Evidence of being single and relying on the relative for support (financial and personal)" },
    { category: "Relationship", label: "Birth certificates showing the relationship to the sponsor" },
    { category: "Assurance", label: "Assurance of Support", required: opt },
  ],
  "838": [
    { category: "Dependence", label: "Evidence of being single and relying on the relative for support" },
    { category: "Relationship", label: "Birth certificates showing the relationship to the sponsor" },
  ],
  "115": [
    { category: "Family", label: "Evidence the sponsor and their partner are your only near relatives, and none live outside Australia" },
    { category: "Relationship", label: "Birth certificates for you, your parents and siblings" },
  ],
  "835": [
    { category: "Family", label: "Evidence the sponsor and their partner are your only near relatives" },
    { category: "Relationship", label: "Birth certificates for you, your parents and siblings" },
  ],
  "116": [
    { category: "Care", label: "Medical report for the person needing care (Bupa Medical Visa Services assessment)" },
    { category: "Care", label: "Statement of why care can't reasonably be obtained in Australia" },
    { category: "Relationship", label: "Birth certificates showing the relationship" },
  ],
  "836": [
    { category: "Care", label: "Medical report for the person needing care (Bupa Medical Visa Services assessment)" },
    { category: "Care", label: "Statement of why care can't reasonably be obtained in Australia" },
  ],
  "103": [
    { category: "Balance of family", label: "Birth certificates for all children, showing at least half live permanently in Australia" },
    { category: "Sponsor", label: "Sponsor's evidence of 2 years' lawful residence in Australia" },
    { category: "Assurance", label: "Assurance of Support and bond (Services Australia)" },
  ],
  "804": [
    { category: "Balance of family", label: "Birth certificates for all children, showing balance of family" },
    { category: "Age", label: "Evidence of being old enough for the Age Pension" },
    { category: "Assurance", label: "Assurance of Support and bond (Services Australia)" },
  ],
  "173": [
    { category: "Balance of family", label: "Birth certificates for all children, showing balance of family" },
    { category: "Sponsor", label: "Sponsor's evidence of 2 years' lawful residence in Australia" },
    { category: "Fees", label: "First instalment of the VAC; second instalment at grant" },
  ],
  "864": [
    { category: "Balance of family", label: "Birth certificates for all children, showing balance of family" },
    { category: "Age", label: "Evidence of being old enough for the Age Pension" },
    { category: "Assurance", label: "Assurance of Support and bond (Services Australia)" },
  ],
  "884": [
    { category: "Balance of family", label: "Birth certificates for all children, showing balance of family" },
    { category: "Age", label: "Evidence of being old enough for the Age Pension" },
  ],
  "802": [
    { category: "Relationship", label: "Child's full birth certificate showing both parents" },
    { category: "Sponsor", label: "Sponsor's evidence of citizenship, PR or eligible NZ citizenship" },
    { category: "Study", label: "School enrolment for children over 18 claiming dependency", required: opt },
  ],
  "461": [
    { category: "Relationship", label: "Evidence of the relationship to the New Zealand citizen (marriage, de facto or birth certificate)" },
    { category: "Sponsor", label: "The New Zealand citizen's passport and evidence they live in or are travelling to Australia" },
  ],
  "870": [
    { category: "Sponsor", label: "Sponsor's income evidence (at least the threshold) and the approved sponsorship" },
  ],
  "300": [
    { category: "Sponsor", label: "Form 40SP (sponsorship for a partner to migrate)" },
    { category: "Relationship", label: "Evidence of a genuine relationship and contact while apart" },
  ],
  // ── Visitor ──
  "601": [
    { category: "Eligibility", label: "Eligible passport (ETA countries) and an ETA lodged through the AustralianETA app" },
    { category: "Character", label: "Character declarations answered in the app" },
  ],
  "651": [
    { category: "Eligibility", label: "Eligible European passport for an eVisitor" },
    { category: "Financial", label: "Evidence of funds for the stay if asked" },
  ],
  "602": [
    { category: "Medical", label: "Letter from the treating doctor or hospital: diagnosis, treatment plan and costs" },
    { category: "Financial", label: "Evidence of funds or arrangements to pay for treatment and living costs" },
    { category: "Support", label: "Details of anyone travelling to support the patient", required: opt },
  ],
  "771": [
    { category: "Travel", label: "Confirmed onward ticket to a third country within 72 hours" },
    { category: "Travel", label: "Visa or entry permission for the destination country" },
  ],
  "988": [
    { category: "Crew", label: "Employer letter confirming the maritime crew role and vessel" },
    { category: "Crew", label: "Seafarer's identity document or discharge book" },
  ],
  "417": [
    { category: "Eligibility", label: "Eligible passport and age evidence (18-30, or 18-35 for some countries)" },
    { category: "Second/third year", label: "Payslips and Form 1263 for specified work done", required: opt },
  ],
  "462": [
    { category: "Financial", label: "Evidence of about AUD 5,000 and a return ticket or funds for one" },
    { category: "English", label: "Functional English evidence" },
    { category: "Ballot", label: "Ballot selection notice (for countries in the pre-application ballot)", required: opt },
  ],
  // ── Business and investment ──
  "888": [
    { category: "Visa history", label: "Grant notice for the 188 held for the required period" },
    { category: "Business", label: "Evidence the business or investment requirements were met (turnover, investment statements)" },
    { category: "Residence", label: "Evidence of residence in the nominating state" },
    { category: "Nomination", label: "State or territory nomination for the 888" },
  ],
  "132": [
    { category: "Business", label: "Evidence of the business record or venture capital funding (stream-specific)" },
    { category: "Nomination", label: "State or territory nomination" },
    { category: "Assets", label: "Net business and personal assets statement" },
  ],
  "192": [
    { category: "Talent", label: "Evidence of an internationally recognised record of exceptional achievement in the target sector" },
    { category: "Nomination", label: "Nominator's details and Form 1000" },
    { category: "Talent", label: "Evidence of ability to attract a high salary or establish yourself in Australia" },
  ],
  "858": [
    { category: "Talent", label: "Evidence of being prominent in your field (awards, publications, media)" },
    { category: "Talent", label: "Evidence of ability to establish yourself in Australia (job offer, contracts, salary)" },
  ],
  // ── Humanitarian ──
  "200": [
    { category: "Referral", label: "UNHCR referral or registration documents" },
    { category: "Claims", label: "Statement describing persecution or risk of harm" },
  ],
  "202": [
    { category: "Proposer", label: "Form 681 (refugee and special humanitarian proposal) by the proposer in Australia" },
    { category: "Claims", label: "Statement describing substantial discrimination or gross human rights violations" },
  ],
  "785": [
    { category: "Claims", label: "Detailed statement of protection claims" },
    { category: "Identity", label: "Identity documents or a statutory declaration explaining why they're unavailable" },
  ],
  "790": [
    { category: "Claims", label: "Detailed statement of protection claims" },
    { category: "Regional", label: "Intention to work or study in a regional area (SHEV pathway)", required: opt },
  ],
  "851": [
    { category: "Visa history", label: "Evidence of the resolution of status eligibility (previous TPV/SHEV or related visa)" },
    { category: "Identity", label: "Identity documents held by the Department" },
  ],
  "449": [{ category: "Referral", label: "Evidence of displacement and the Department's invitation to apply" }],
  "786": [{ category: "Visa history", label: "Evidence of holding a 449 visa" }],
  "866": [{ category: "Identity", label: "Identity documents, or a statutory declaration explaining why they're unavailable" }],
  // ── Bridging and other ──
  "020": [
    { category: "Visa history", label: "Bridging visa grant notice or evidence of the eligible circumstance (e.g. review, removal pending)" },
    { category: "Application", label: "Form 1008 (bridging visa B) or form for the class applied for" },
  ],
  "030": [
    { category: "Application", label: "Form 1006 and evidence of the pending application or review" },
    { category: "Character", label: "Detention or compliance records where relevant", required: opt },
  ],
  "050/051": [
    { category: "Application", label: "Form 1008 or 1006 and evidence of the reason for remaining in Australia" },
    { category: "Departure", label: "Evidence of arrangements to depart, or why departure isn't possible", required: opt },
  ],
  "070": [{ category: "Removal", label: "Evidence of removal pending (Departmental advice)" }],
  "155/157": [
    { category: "Residence", label: "Evidence of 2 years' residence in Australia in the last 5 years as a permanent resident (155)" },
    { category: "Ties", label: "Evidence of substantial ties to Australia if residence isn't met (employment, family, property)", required: opt },
    { category: "Compelling", label: "Compelling reasons for absence (157)", required: opt },
  ],
  "151": [
    { category: "Former resident", label: "Evidence of former permanent residence and close ties to Australia" },
    { category: "Military", label: "Discharge papers for former Australian Defence Force members", required: opt },
  ],
  "444": [
    { category: "Identity", label: "Valid New Zealand passport presented on arrival" },
    { category: "Character", label: "Disclosure of any criminal convictions on the incoming passenger card" },
  ],
  "010": [{ category: "Application", label: "Copy of the substantive application lodged in Australia" }],
  CIT: [
    { category: "Residence", label: "Travel movements showing the general residence requirement (4 years, 1 as PR)" },
    { category: "Identity", label: "Name change documents if your name differs across documents", required: opt },
  ],
  "CIT-D": [
    { category: "Parent", label: "Evidence one parent was an Australian citizen at the time of birth" },
    { category: "Identity", label: "Child's full birth certificate" },
    { category: "Parent", label: "Parent's evidence of 2 years' lawful presence in Australia (if citizen by descent)", required: opt },
  ],
  "CIT-E": [
    { category: "Former citizen", label: "Evidence of former Australian citizenship (certificate or renunciation)" },
    { category: "Reason", label: "Evidence explaining why citizenship was lost or renounced", required: opt },
  ],
  SA: [
    { category: "Skills", label: "Qualifications, transcripts and CV prepared for the assessing authority" },
    { category: "Employment", label: "Employment references on letterhead with duties, hours and dates" },
    { category: "Payment", label: "Assessing authority fee paid" },
  ],
  PI: [
    { category: "Visa history", label: "Grant notice or approval being relied upon" },
    { category: "Questions", label: "Client's questions and any documents they want reviewed" },
  ],
  MIN: [
    { category: "Grounds", label: "Statement of unique or exceptional circumstances (Minister's guidelines)" },
    { category: "Evidence", label: "Supporting letters, medical and community evidence" },
    { category: "Decision", label: "Tribunal decision record (most requests follow a merits review)" },
  ],
  CANC: [
    { category: "Notice", label: "Notice of intention to consider cancellation (NOICC) and its response deadline" },
    { category: "Response", label: "Written response with evidence addressing each ground" },
    { category: "Character", label: "Character references and rehabilitation evidence (for s501 matters)", required: opt },
  ],
  ART: [
    { category: "Decision", label: "Copy of the decision record and the notification letter" },
    { category: "Application", label: "Review application form and fee" },
    { category: "Submissions", label: "Written submissions and new evidence addressing the reasons for refusal" },
  ],
};
