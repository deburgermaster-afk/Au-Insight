// Consent forms and client authorities an agency sends for e-signature. Each template is filled in
// with the agency, the responsible registered migration agent and the client when it's sent, then
// rendered to a PDF with its signature fields already placed. Wording is a starting point written
// around the Code of Conduct and the Australian Privacy Principles; agencies should review it.

export type ConsentCheckbox = { id: string; label: string; required?: boolean };

export type ConsentTemplate = {
  key: string;
  title: string;
  group: "Engagement" | "Privacy & authority" | "Application" | "Third parties" | "Money" | "Ending";
  summary: string;
  /** Visa codes or categories this is most useful for; empty means any matter. */
  suggestFor?: string[];
  /** "## Heading" starts a section; blank lines separate paragraphs; {var} is filled in. */
  body: string;
  checkboxes?: ConsentCheckbox[];
  /** Also asks for the client's initials beside the body. */
  initials?: boolean;
  /** A free-text field the client completes (e.g. names of people to share with). */
  textField?: { id: string; label: string; required?: boolean };
  /** The registered migration agent countersigns. */
  countersign?: boolean;
  /** Set for an agency's own wording (edited) or its own template (custom). */
  edited?: boolean;
  custom?: boolean;
};

export const CONSENT_VARS = {
  agency: "Agency trading name",
  agencyLegal: "Agency legal name",
  abn: "ABN",
  agencyAddress: "Agency address",
  agencyEmail: "Agency email",
  agencyPhone: "Agency phone",
  agent: "Responsible registered migration agent",
  agentMarn: "Agent's MARN",
  client: "Client full name",
  clientDob: "Client date of birth",
  clientEmail: "Client email",
  clientAddress: "Client address",
  passport: "Client passport number",
  nationality: "Client nationality",
  visa: "Visa / matter",
  matterRef: "Matter reference",
  date: "Date prepared",
} as const;
export type ConsentVars = Record<keyof typeof CONSENT_VARS, string>;

const parties = `## Parties
Client: {client} (date of birth {clientDob}, passport {passport}).

Agency: {agencyLegal} (ABN {abn}), {agencyAddress}. Responsible registered migration agent: {agent}, MARN {agentMarn}.

Matter: {visa} (reference {matterRef}).`;

export const consentTemplates: ConsentTemplate[] = [
  {
    key: "privacy",
    title: "Privacy consent and collection notice",
    group: "Privacy & authority",
    summary: "How the agency collects, uses, stores and discloses the client's personal and sensitive information (APP 5).",
    body: `${parties}

## Why we collect your information
{agencyLegal} collects your personal information, including sensitive information such as health, criminal history, racial or ethnic origin and relationship details, so we can give you immigration advice and prepare, lodge and manage your application.

## Who we share it with
We disclose your information to the Department of Home Affairs and, as needed for your matter, to skills assessing authorities, education providers, sponsors or employers, panel physicians, translators, the Administrative Review Tribunal and other bodies you authorise. Some of these may be overseas.

## How we keep it
Your file is kept securely in Lodgely, an Australian-hosted case management system, for at least 7 years after your matter ends, as required by the Code of Conduct for registered migration agents.

## Access and complaints
You can ask to see or correct the information we hold about you. If you have a privacy concern, contact us at {agencyEmail}. You may also contact the Office of the Australian Information Commissioner (OAIC).`,
    checkboxes: [
      { id: "sensitive", label: "I consent to the collection and use of my sensitive information for my matter.", required: true },
      { id: "overseas", label: "I consent to my information being disclosed overseas where needed for my matter." },
    ],
  },
  {
    key: "authority-to-act",
    countersign: true,
    title: "Authority to act and appointment of registered migration agent",
    group: "Engagement",
    summary: "Appoints the agent to act and receive correspondence for the client (pairs with Form 956).",
    body: `${parties}

## Appointment
I appoint {agent} (MARN {agentMarn}) of {agencyLegal} as my registered migration agent to give me immigration assistance and to act on my behalf in relation to the matter above.

## Correspondence
I authorise my agent to receive all written communications from the Department of Home Affairs and other bodies about this matter. My agent will lodge Form 956 (Appointment of a registered migration agent) with the Department. I understand the Department will send communications to my agent instead of to me.

## Instructions
I will give my agent complete and truthful instructions and documents, and will tell my agent straight away if my circumstances change.

## Ending the appointment
I can withdraw this appointment at any time by telling my agent and the Department in writing.`,
  },
  {
    key: "electronic-communication",
    title: "Consent to electronic communication",
    group: "Privacy & authority",
    summary: "Agrees to receive notices, documents and invoices by email, portal and SMS.",
    body: `${parties}

## Electronic communication
I agree that {agencyLegal} may send me notices, advice, documents, invoices and requests by email to {clientEmail}, through the Lodgely client portal, and by SMS or messaging apps.

## Keeping details current
I will keep my email address and phone number up to date and check them regularly. A notice sent to the email address I gave is treated as received the next business day.

## Electronic signatures
I agree that documents I sign electronically through the client portal are as binding as documents signed on paper.`,
  },
  {
    key: "third-party",
    title: "Consent to disclose information to a third party",
    group: "Third parties",
    summary: "Lets the agency discuss the matter with a named family member, friend, sponsor or adviser.",
    body: `${parties}

## Authority
I authorise {agencyLegal} and my agent {agent} to discuss my matter and share information and documents about it with the person or organisation named below.

## Limits
This consent covers the matter above only. My agent will still take instructions only from me unless I say otherwise in writing. I can withdraw this consent at any time in writing.`,
    textField: { id: "third_party", label: "Name, relationship and contact of the person or organisation", required: true },
  },
  {
    key: "consumer-guide",
    title: "Acknowledgement of receiving the Consumer Guide",
    group: "Engagement",
    summary: "Confirms the client received the OMARA Consumer Guide before services started (Code of Conduct).",
    body: `${parties}

## Acknowledgement
I confirm that before {agencyLegal} began providing immigration assistance to me, my agent {agent} (MARN {agentMarn}) gave me a copy of the Consumer Guide published by the Office of the Migration Agents Registration Authority (OMARA).

## What the guide explains
The Consumer Guide explains what I can expect from a registered migration agent, the Code of Conduct agents must follow, and how to make a complaint.`,
    checkboxes: [{ id: "read", label: "I have read, or had the opportunity to read, the Consumer Guide.", required: true }],
  },
  {
    key: "fee-estimate",
    countersign: true,
    title: "Fee estimate and costs disclosure",
    group: "Money",
    summary: "Acknowledges the professional fee estimate, government charges and third-party costs.",
    body: `${parties}

## Professional fees
I have received a written estimate of the professional fees for the services in my service agreement. If the work changes, {agencyLegal} will give me a revised estimate in writing before doing it.

## Government and third-party costs
I understand that the visa application charge is set by the Department of Home Affairs and may change, and that I will pay other costs directly, such as health examinations, police certificates, skills assessments, English tests and translations.

## No refund of government charges
Government charges are generally not refundable if an application is refused or withdrawn.`,
    checkboxes: [{ id: "understand", label: "I understand the fee estimate and the costs I will pay to others.", required: true }],
  },
  {
    key: "client-account",
    countersign: true,
    title: "Client account authority",
    group: "Money",
    summary: "Authorises the agency to hold money in its client (trust) account and pay it out for fees and charges.",
    body: `${parties}

## Money held for me
I authorise {agencyLegal} to deposit money I pay in advance into its client account and to hold it there until it is earned or paid out on my behalf.

## Payments out
I authorise payments from the client account for: professional fees once the work is done and invoiced, the visa application charge when the application is lodged, and other charges I have approved in writing.

## Statements
I will receive a written statement of money received and paid out. Any unused money will be refunded to me when my matter ends.`,
  },
  {
    key: "police-check",
    title: "Consent to obtain police and character checks",
    group: "Third parties",
    summary: "Authorises the agency to request an AFP or overseas police certificate on the client's behalf.",
    body: `${parties}

## Authority
I authorise {agencyLegal} to apply for, and receive, police certificates and character checks on my behalf, including an Australian Federal Police National Police Check and certificates from other countries where I have lived.

## Identity documents
I will provide certified copies of the identity documents and fingerprints each agency needs. I understand some agencies send results only to the applicant, in which case I will forward them to my agent promptly.`,
  },
  {
    key: "skills-assessment",
    title: "Authority to deal with a skills assessing authority",
    group: "Third parties",
    summary: "Lets the agent lodge and manage a skills assessment (ACS, EA, VETASSESS, TRA, ANMAC and others).",
    suggestFor: ["189", "190", "491", "186", "482", "485", "SA"],
    body: `${parties}

## Authority
I authorise my agent {agent} (MARN {agentMarn}) to prepare and lodge a skills assessment application for me with the relevant assessing authority, to correspond with that authority, and to receive the outcome on my behalf.

## Accuracy
I confirm that my qualifications, employment references and documents are genuine. I understand that giving false or misleading information to an assessing authority can lead to refusal and a ban on further applications.`,
    textField: { id: "authority", label: "Assessing authority and nominated occupation" },
  },
  {
    key: "education-provider",
    title: "Consent to liaise with education providers",
    group: "Third parties",
    summary: "For students: share information with providers, accept offers and receive CoEs on the student's behalf.",
    suggestFor: ["500", "590", "485"],
    body: `${parties}

## Authority
I authorise {agencyLegal} to apply to education providers for me, share my academic records, English results and identity documents with them, and receive offer letters and Confirmations of Enrolment (CoE) on my behalf.

## Offers and payments
My agent will not accept an offer or pay tuition on my behalf without my written approval of the provider, course, fees and refund policy.

## Commissions
I understand {agencyLegal} may receive a commission from education providers, and that this is disclosed to me in writing.`,
    checkboxes: [{ id: "commission", label: "I understand the agency may receive a commission from the provider.", required: true }],
  },
  {
    key: "sponsor-consent",
    title: "Employer sponsor consent and information sharing",
    group: "Third parties",
    summary: "For employer-sponsored cases: the applicant agrees to the agency sharing information with the sponsor.",
    suggestFor: ["482", "186", "494", "407", "NOM", "SBS", "482-LA"],
    body: `${parties}

## Information sharing
I consent to {agencyLegal} sharing information about my visa application with my sponsoring employer as needed for the nomination and visa, including the progress of the application and requests from the Department.

## Separate interests
I understand my agent may also act for my sponsor, and that if our interests conflict my agent will tell us both and may need to stop acting for one or both of us.

## Costs
I understand the law prohibits me from paying, or being asked to pay, my sponsor for sponsorship.`,
  },
  {
    key: "minor-consent",
    title: "Parent or guardian consent for a child applicant",
    group: "Application",
    summary: "Consent from the parent(s) or guardian for a child under 18 to be included in or to make an application.",
    body: `${parties}

## Consent
As the parent or legal guardian of the child named below, I consent to the child being included in, or making, the visa application above, and to {agencyLegal} acting for the child.

## Other parent
Where the child's other parent is not signing, I will provide Form 1229 (Consent to grant an Australian visa to a child under 18), or evidence of my sole parental responsibility.`,
    textField: { id: "child", label: "Child's full name and date of birth", required: true },
  },
  {
    key: "health-info",
    title: "Consent to collect and share health information",
    group: "Privacy & authority",
    summary: "Covers medical history, health examinations and disability information needed for the health requirement.",
    body: `${parties}

## Health information
I consent to {agencyLegal} collecting information about my health and the health of family members included in my application, and to sharing it with the Department of Home Affairs, panel physicians and medical specialists as needed to meet the health requirement.

## Health examinations
I will attend the health examinations requested (HAP ID) and tell my agent about any existing medical conditions that may affect my application.`,
  },
  {
    key: "declaration-accuracy",
    title: "Client declaration of complete and truthful information",
    group: "Application",
    summary: "Client declares the information and documents given are complete, true and not misleading.",
    initials: true,
    body: `${parties}

## Declaration
I declare that the information I have given {agencyLegal}, and every document I have provided, is complete, correct and genuine, and that I have not left out anything relevant to my application.

## Consequences
I understand that giving false or misleading information or bogus documents to the Department of Home Affairs is a serious offence. It can lead to refusal, cancellation, a ban of up to 10 years on further visas (Public Interest Criterion 4020), and prosecution.

## Changes
I will tell my agent straight away about any change in my circumstances, including address, relationship, health, character, employment, study and travel, until a decision is made.`,
  },
  {
    key: "pre-lodgement",
    title: "Pre-lodgement review and authority to lodge",
    group: "Application",
    summary: "Client confirms they reviewed the completed application and instructs the agent to lodge it.",
    initials: true,
    body: `${parties}

## Review
I have reviewed the completed application form and the documents to be lodged for the matter above. The answers are correct and complete.

## Instruction to lodge
I instruct my agent {agent} (MARN {agentMarn}) to lodge the application and pay the visa application charge on my behalf.

## Prospects
My agent has explained the requirements for this visa and my prospects of success. I understand that the decision is made by the Department of Home Affairs and no outcome is guaranteed.`,
    checkboxes: [
      { id: "reviewed", label: "I have reviewed the application and supporting documents.", required: true },
      { id: "lodge", label: "I instruct my agent to lodge the application.", required: true },
    ],
  },
  {
    key: "interpreter",
    title: "Interpreter and translation acknowledgement",
    group: "Engagement",
    summary: "Records that advice and documents were explained in the client's language.",
    body: `${parties}

## Acknowledgement
I confirm that the advice given to me and the documents I am signing were explained to me in a language I understand, with an interpreter where I asked for one.

## Translations
I understand that documents not in English must be translated by a NAATI-accredited translator (or an accredited translator overseas) before they are lodged.`,
    textField: { id: "language", label: "Language used, and interpreter's name if any" },
  },
  {
    key: "conflict",
    countersign: true,
    title: "Conflict of interest disclosure and consent",
    group: "Engagement",
    summary: "Discloses an actual or potential conflict (e.g. acting for both sponsor and applicant) and records consent.",
    body: `${parties}

## Disclosure
My agent has told me that {agencyLegal} also acts, or may act, for another party connected with my matter (for example a sponsor, employer, partner or family member), and has explained how this may affect the advice I receive.

## Consent
I consent to {agencyLegal} continuing to act for me. I understand that if a real conflict arises, my agent must tell me and may need to stop acting for me or the other party.`,
    textField: { id: "other_party", label: "The other party", required: true },
  },
  {
    key: "withdrawal",
    title: "Instruction to withdraw an application",
    group: "Ending",
    summary: "Client instructs the agent to withdraw a lodged application or nomination.",
    body: `${parties}

## Instruction
I instruct my agent {agent} (MARN {agentMarn}) to withdraw the application above from the Department of Home Affairs.

## Consequences
My agent has explained that the visa application charge is generally not refunded, that withdrawing may affect my current visa or bridging visa status, and any time limits for other applications.`,
    checkboxes: [{ id: "understand", label: "I understand the consequences of withdrawing.", required: true }],
  },
  {
    key: "termination",
    countersign: true,
    title: "Termination of services and return of documents",
    group: "Ending",
    summary: "Records the end of the agency's services, the final account and return of original documents.",
    body: `${parties}

## End of services
{agencyLegal} will stop providing immigration assistance on the matter above from the date of signing. My agent will tell the Department of Home Affairs that they no longer act for me.

## Final account
I will receive a final statement of fees for services provided and money held for me, and any money owing to me will be refunded.

## Documents
My original documents will be returned to me. {agencyLegal} will keep a copy of my file for 7 years as the Code of Conduct requires.`,
  },
  {
    key: "documents-receipt",
    countersign: true,
    title: "Receipt of original documents",
    group: "Ending",
    summary: "Confirms the client received their original documents back from the agency.",
    body: `${parties}

## Receipt
I confirm that I have received from {agencyLegal} the original documents listed below, and that nothing else of mine is held by the agency.`,
    textField: { id: "documents", label: "Documents returned", required: true },
  },
  {
    key: "id-verification",
    title: "Consent to verify identity documents",
    group: "Privacy & authority",
    summary: "Allows the agency to copy and verify identity documents (Document Verification Service).",
    body: `${parties}

## Identity verification
I consent to {agencyLegal} copying my identity documents and checking them with the issuer or the Document Verification Service (DVS) to confirm they are genuine.

## Use
This information is used only to confirm my identity for my matter and is handled under the privacy notice I received.`,
  },
  {
    key: "art-review",
    title: "Authority for Tribunal review representation",
    group: "Application",
    summary: "Authorises the agent to apply for and represent the client in a review at the Administrative Review Tribunal.",
    suggestFor: ["ART", "MIN", "CANC"],
    body: `${parties}

## Authority
I authorise my agent {agent} (MARN {agentMarn}) to apply for merits review of the decision on my matter at the Administrative Review Tribunal (ART), to make submissions, and to represent me at any hearing.

## Time limits
I understand review applications must be made within strict time limits from the date I was notified of the decision, and that the Tribunal can't accept a late application.`,
    textField: { id: "decision", label: "Decision being reviewed and date notified" },
  },
  {
    key: "marketing",
    title: "Testimonial and marketing consent",
    group: "Privacy & authority",
    summary: "Optional: lets the agency use a testimonial or the visa outcome (de-identified unless agreed).",
    body: `${parties}

## Consent
I consent to {agencyLegal} using my testimonial and the outcome of my matter in its marketing, on the terms ticked below. I can withdraw this consent at any time and the agency will stop using it for new material.`,
    checkboxes: [
      { id: "name", label: "You may use my first name." },
      { id: "photo", label: "You may use a photo I provide." },
    ],
  },
];

export const consentByKey = (key: string) => consentTemplates.find((t) => t.key === key);
export const consentGroups = [...new Set(consentTemplates.map((t) => t.group))];

/** Fills {vars}; unknown or empty values become a blank line to complete by hand. */
export function fillConsent(text: string, vars: Partial<ConsentVars>) {
  return text.replace(/\{(\w+)\}/g, (_, k) => (vars as Record<string, string | undefined>)[k]?.trim() || "________");
}

/** Splits a filled body into sections of paragraphs. */
export function consentSections(body: string) {
  const out: { heading: string; paras: string[] }[] = [];
  for (const block of body.split(/\n(?=## )/)) {
    const [first, ...rest] = block.trim().split("\n");
    const isHead = first.startsWith("## ");
    const paras = (isHead ? rest : [first, ...rest]).join("\n").split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).filter(Boolean);
    out.push({ heading: isHead ? first.slice(3).trim() : "", paras });
  }
  return out;
}
