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
    key: "statutory-declaration-support",
    title: "Statutory declaration in support of an application",
    group: "Application",
    summary: "A declaration of facts by the client or a supporter (relationship, dependency, name variations) for the Department.",
    suggestFor: ["820/801", "309/100", "300", "114", "838", "117", "CIT"],
    body: `${parties}

## Declaration
I, the person signing below, make this declaration in support of the application above. The facts set out below are true and correct to the best of my knowledge and belief, and are based on my own knowledge unless I say otherwise.

## Facts declared
The facts are set out in the space provided below, in numbered paragraphs.

## Commonwealth statutory declaration
I understand that this form is prepared for my convenience and that, where the Department requires a Commonwealth statutory declaration, I must also sign it before an authorised witness. A person who intentionally makes a false statement in a statutory declaration is guilty of an offence under the Statutory Declarations Act 1959.`,
    textField: { id: "facts", label: "The facts being declared (numbered paragraphs)", required: true },
    checkboxes: [{ id: "true", label: "The facts I have written are true and correct.", required: true }],
  },
  {
    key: "relationship-statement",
    title: "Relationship statement (partner visa)",
    group: "Application",
    summary: "The couple's joint account of how they met, their commitment and shared life, for Form 47SP/40SP.",
    suggestFor: ["820/801", "309/100", "300", "461"],
    countersign: false,
    body: `${parties}

## Purpose
This statement accompanies the partner visa application. It covers the four aspects the Department considers: the financial aspects of the relationship, the nature of the household, the social context, and the nature of our commitment to each other.

## Our relationship
We confirm that the account we have given {agencyLegal} of how we met, when the relationship began, when we started living together (or why we have lived apart), how we share finances and household responsibilities, and our plans for the future is true, and that the statement prepared from it accurately reflects our relationship.

## Both partners sign
Both the applicant and the sponsor must read and sign this statement. Neither of us has been pressured into the relationship or into making this application.`,
    checkboxes: [
      { id: "true", label: "The relationship statement prepared for us is true and complete.", required: true },
      { id: "free", label: "I am in this relationship and making this application freely.", required: true },
    ],
  },
  {
    key: "employment-reference",
    title: "Employment reference request and consent",
    group: "Third parties",
    summary: "Authorises the agency to request and verify employment references from current and past employers.",
    suggestFor: ["189", "190", "491", "186", "482", "494", "SA", "485"],
    body: `${parties}

## Authority
I authorise {agencyLegal} to contact my current and former employers named below to request employment references for my skills assessment or visa application, and to verify the details in references I provide (dates, hours, duties and salary).

## What references must show
I understand a reference must be on the employer's letterhead, signed by a manager or HR, and state my position, the dates of employment, hours per week, salary and main duties. References are checked by assessing authorities and the Department, who may contact employers directly.

## Honesty
I confirm the employment history I have given is true. Providing a false reference is a serious offence and can lead to refusal, cancellation and a three-year bar under public interest criterion 4020.`,
    textField: { id: "employers", label: "Employers you may contact (name, contact person, dates)", required: true },
  },
  {
    key: "change-of-circumstances",
    title: "Change of circumstances notice (Form 1022 / 929)",
    group: "Application",
    summary: "The client confirms a change (address, passport, relationship, new child) for the agency to notify the Department.",
    body: `${parties}

## Change being notified
I tell {agencyLegal} of the change described below, which happened after my application was lodged. I ask the agency to notify the Department using Form 1022 (Notification of changes in circumstances) or Form 929 (Change of address and/or passport details), as appropriate, and to update my ImmiAccount.

## Why it matters
I understand I have a legal obligation to tell the Department about changes in my circumstances while my application is being processed, and that failing to do so can affect the outcome. A change in relationship status, a new child, or a new passport may require further documents.`,
    textField: { id: "change", label: "What changed and when (with new details)", required: true },
    checkboxes: [{ id: "docs", label: "I will provide documents showing the change (e.g. new passport, birth certificate).", required: true }],
  },
  {
    key: "file-transfer",
    title: "Authority to transfer file to another agent",
    group: "Ending",
    summary: "The client authorises release of their file and documents to a new registered migration agent or lawyer.",
    countersign: true,
    body: `${parties}

## Authority to transfer
I authorise and direct {agencyLegal} to release my file, including my original documents, copies of applications and correspondence with the Department, to the new representative named below.

## Fees and records
I understand {agencyLegal} must give my documents to me or my new representative in a timely way, whether or not fees are outstanding, and may keep a copy of the file as required by the Code of Conduct. Any unearned money held in the client account will be refunded or transferred as I direct.

## Form 956
I understand my new representative will lodge a new Form 956 and that the appointment of {agent} ends when the Department is notified.`,
    textField: { id: "newagent", label: "New representative (name, MARN or lawyer, email)", required: true },
  },
  {
    key: "refund-request",
    title: "Refund request and acknowledgement",
    group: "Money",
    summary: "Records a client's request for a refund of unearned fees or client account money, and how it's paid.",
    countersign: true,
    body: `${parties}

## Request
I request a refund of the amount described below from {agencyLegal}, for the reasons given. I understand the agency will refund any fees paid in advance for services not yet provided, in line with our service agreement and the Code of Conduct.

## Payment details
The refund will be paid to the account I nominate in writing. The agency will give me a statement showing the money received, services provided, and the amount refunded.

## Government charges
I understand visa application charges paid to the Department are refunded only in limited circumstances, by the Department, and not by the agency.`,
    textField: { id: "refund", label: "Amount requested and reason", required: true },
  },
  {
    key: "complaint-acknowledgement",
    title: "Complaint acknowledgement and handling consent",
    group: "Ending",
    summary: "Acknowledges a client complaint and explains the agency's process and the OMARA complaints option.",
    body: `${parties}

## Your complaint
{agencyLegal} acknowledges the complaint described below. The agency will investigate it, respond in writing within 14 days where possible, and tell you what will be done to resolve it.

## Your options
You can also complain to the Office of the Migration Agents Registration Authority (OMARA) at any time. Making a complaint to the agency does not stop you from complaining to OMARA.

## Consent
I consent to the agency reviewing my file and speaking with the staff involved to investigate my complaint.`,
    textField: { id: "complaint", label: "Summary of the complaint", required: true },
  },
  {
    key: "guardian-caaw",
    title: "Welfare arrangements for a student under 18 (CAAW consent)",
    group: "Application",
    summary: "Parent consent to the education provider's accommodation and welfare arrangements, or a nominated relative guardian (Form 157N).",
    suggestFor: ["500", "590"],
    body: `${parties}

## Arrangement
As parent or legal guardian of the student, I confirm the student will be under one of these welfare arrangements until they turn 18: living with a parent or legal custodian, living with a relative over 21 nominated on Form 157N, or under accommodation and welfare arranged by the education provider (a Confirmation of Appropriate Accommodation and Welfare letter).

## Consent
I consent to the arrangement described below and to {agencyLegal} sharing the student's details with the education provider and the nominated guardian to put it in place.

## Changes
I understand the student must not change their welfare arrangements without the provider's approval, and that the student visa can be cancelled if appropriate arrangements are not maintained.`,
    textField: { id: "arrangement", label: "Arrangement (CAAW from provider, or guardian's name and relationship)", required: true },
  },
  {
    key: "release-letter",
    title: "Request for a release letter / provider transfer consent",
    group: "Third parties",
    summary: "The student authorises the agency to request a release from their current provider before 6 months of study.",
    suggestFor: ["500"],
    body: `${parties}

## Request
I ask {agencyLegal} to help me request a release letter from my current education provider so I can transfer to the new course described below before completing six months of my principal course.

## What I understand
I understand my current provider decides whether to release me under its transfer policy and the National Code, that I may need a new Confirmation of Enrolment, and that changing provider or course may affect my visa conditions and the Genuine Student assessment of any future application.

## Information sharing
I consent to the agency sharing my enrolment details with my current and new providers for this request.`,
    textField: { id: "transfer", label: "Current provider and course → new provider and course", required: true },
  },
  {
    key: "offer-acceptance",
    title: "Authority to accept a course offer",
    group: "Application",
    summary: "The student authorises the agency to accept a letter of offer and pay the deposit on their behalf.",
    suggestFor: ["500", "590"],
    body: `${parties}

## Authority
I authorise {agencyLegal} to accept, on my behalf, the offer of a place described below, sign the provider's acceptance form where permitted, and pay the deposit from funds I provide.

## Provider terms
I have read the provider's written agreement, including its refund policy, and understand that the deposit may not be refundable if I withdraw or my visa is refused, except as the provider's policy and the ESOS framework allow.

## Next steps
I understand that a Confirmation of Enrolment is issued once the provider receives acceptance and payment, and that the CoE is required to lodge my student visa.`,
    textField: { id: "offer", label: "Provider, course, intake and deposit amount", required: true },
    checkboxes: [{ id: "refund", label: "I have read the provider's refund policy.", required: true }],
  },
  {
    key: "visitor-invitation",
    title: "Invitation letter for a visitor",
    group: "Third parties",
    summary: "A host in Australia invites a family member or friend to visit and confirms support for the stay.",
    suggestFor: ["600"],
    body: `${parties}

## Invitation
I, the host signing below, invite the visitor named above to visit me in Australia for the period and purpose described below. I am an Australian citizen, permanent resident, or lawful resident, and my contact details are with {agencyLegal}.

## Support
I will provide accommodation for the visitor during their stay, and support them financially to the extent described below. I understand the visitor must leave Australia before their visa expires, and that a Sponsored Family stream application may require me to give a security bond.

## Truth
The information in this letter is true. I understand the Department may contact me to confirm it.`,
    textField: { id: "visit", label: "Relationship, dates, purpose, and support offered", required: true },
  },
  {
    key: "grant-acknowledgement",
    title: "Visa grant acknowledgement and conditions briefing",
    group: "Ending",
    summary: "The client confirms they received the grant notice and understand their visa conditions and expiry.",
    body: `${parties}

## Grant received
I confirm {agencyLegal} has given me the grant notice for the visa above and explained what it allows: the visa period, the dates I must first enter by (where relevant), and any travel restrictions.

## Conditions
I understand the conditions on my visa, as listed in the grant notice and in VEVO, and that breaching a condition can lead to cancellation. I will check my visa details in VEVO and keep a copy of the grant notice.

## What happens next
I understand my agent's engagement for this matter is now complete, unless we agree otherwise in writing, and that I should seek advice before applying for another visa or travelling if my circumstances change.`,
    checkboxes: [{ id: "conditions", label: "My visa conditions and expiry have been explained to me.", required: true }],
  },
  {
    key: "dependent-inclusion",
    title: "Consent to include a family member in the application",
    group: "Application",
    summary: "An adult family member (partner or child over 18) consents to being included as a secondary applicant.",
    body: `${parties}

## Consent
I, the family member signing below, consent to being included as a secondary applicant in the application above, and to {agencyLegal} acting for me in it.

## Requirements
I understand that I must meet health and character requirements, provide my own identity and relationship documents, and that a child over 18 must show they are dependent on the main applicant. A false or misleading statement by any applicant can lead to refusal for everyone in the application.

## Information
I agree to my personal information being collected, used and given to the Department for this application.`,
    textField: { id: "member", label: "Family member's name, date of birth and relationship", required: true },
  },
  {
    key: "s48-bar-acknowledgement",
    title: "Acknowledgement of visa restrictions (section 48 bar / no further stay)",
    group: "Application",
    summary: "Records that the client has been told about a section 48 bar, 8503 condition, or other restriction affecting their options.",
    body: `${parties}

## Advice given
{agent} has advised me that the restriction described below applies to me, and how it limits which visas I can apply for in Australia.

## What I understand
I understand that a section 48 bar (after a refusal or cancellation while in Australia) or a No Further Stay condition (8503, 8534 or 8535) means I can only apply for certain visas onshore unless the condition is waived, and that any application I make that is not permitted will be invalid.

## My decision
I have had the chance to ask questions, and I will tell the agency before lodging any application myself.`,
    textField: { id: "restriction", label: "The restriction and the options discussed", required: true },
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

/** Letters made from student data (not in the consent library): filled with extra values when sent. */
export const scholarshipOffer: ConsentTemplate = {
  key: "scholarship-offer",
  title: "Scholarship offer",
  group: "Application",
  summary: "Offer of a scholarship under the agency's agreement with the institution; the student accepts by signing.",
  countersign: true,
  body: `## Offer
{agencyLegal} is pleased to offer {client} the {scholarshipName} for study at {institution}.

Course: {course}{intakeText}. Value: {scholarshipValue} ({appliesToText}), applied as a reduction of the tuition fees payable.

## Funding
{fundingText}

## Conditions
{conditions}

The scholarship is conditional on the student accepting the offer of a place, paying the remaining tuition fees when due, holding a valid student visa, and enrolling full-time. It has no cash value, can't be transferred, and ends if the student withdraws, transfers to another provider or course, or doesn't meet the conditions above.

## Accepting
By signing, the student accepts the scholarship on these terms and authorises {agencyLegal} to share their enrolment and academic progress with {institution} to administer it.`,
  checkboxes: [{ id: "conditions", label: "I have read and accept the scholarship conditions.", required: true }],
};

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
