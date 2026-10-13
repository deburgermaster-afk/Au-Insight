// The product's feature list, shown on the landing page and at /app/features. "live" means it
// works in this build; "next" is designed and queued. Keep this honest: move items to live only
// when they ship.

export type Feature = { name: string; status: "live" | "next" };
const live = (...names: string[]): Feature[] => names.map((name) => ({ name, status: "live" }));
const next = (...names: string[]): Feature[] => names.map((name) => ({ name, status: "next" }));

export const features: { group: string; items: Feature[] }[] = [
  {
    group: "Clients",
    items: [
      ...live(
        "Client records with passport, visa and occupation details",
        "Client stages: lead, prospect, active, on hold, past, lost",
        "Instant client search by name, email or passport",
        "Filter clients by stage",
        "Visa expiry countdown on every client",
        "Onshore / offshore flag",
        "Lead source tracking",
        "Assigned case officer per client",
        "Client timeline of notes, calls, emails and changes",
        "Pinned notes",
        "Log calls and meetings",
        "Dependants and family members",
        "Per-client matters, documents, tasks, invoices and bookings",
      ),
      ...live(
        "Import clients from a CSV or Excel export: columns matched automatically",
        "Import review: new, already in Lodgely, warnings and rows that can't import",
        "Import choice for existing clients: skip, fill in the gaps, or create anyway",
        "Duplicate finder: same email, passport, name and date of birth, or phone and name",
        "Merge duplicates: pick each detail, cases, documents, invoices and payments move across",
        "Mark look-alikes as different people",
      ),
      ...next("Custom fields", "Client tags and segments", "Birthday and anniversary reminders"),
    ],
  },
  {
    group: "Matters & lodgement",
    items: [
      ...live(
        "Matters with automatic references (LDG-YYYY-NNNN)",
        "Nine-stage pipeline from enquiry to closed",
        "Kanban board with drag-and-drop between stages",
        "List view with checklist progress",
        "Visa and stream per matter",
        "Priority levels",
        "Target lodgement date",
        "Lodgement date and TRN tracking",
        "Decision date and outcome (granted, refused, withdrawn)",
        "Professional and government fee estimates",
        "Sponsoring employer linked to employer-sponsored matters",
        "Stage changes logged to the timeline",
        "Per-matter document checklist generated from the visa library",
        "Checklist statuses: needed, requested, received, approved, rejected, waived",
        "Add custom checklist items",
        "Checklist progress bar",
        "Matter notes and tasks",
      ),
      ...live("Points test calculator (189, 190, 491)", "RFI (s56) deadline tracker with dashboard alerts", "Consumer Guide given (Code s38) on every matter", "Signed service agreement (Code s42) blocks invoicing until recorded", "Lodgement and decision steps limited to agents with a current MARN"),
      ...next("Supervisor sign-off before lodgement", "ImmiAccount lodgement pack export (PDF bundle)", "AAT/ART review deadlines", "Matter templates per agency", "Bulk stage changes"),
    ],
  },
  {
    group: "Visa library",
    items: [
      ...live(
        "33 visas and services: skilled, employer, student, graduate, family, visitor, business, review, citizenship",
        "Streams per subclass",
        "Core eligibility requirements",
        "Document checklist per visa",
        "Links to the Home Affairs page for each visa",
        "Search the library from ⌘K",
      ),
      ...next("Legislative instrument updates feed", "Occupation lists (MLTSSL, STSOL, CSOL) lookup", "Processing-time tracker", "Visa fee calculator"),
    ],
  },
  {
    group: "Occupations & SkillSelect",
    items: [
      ...live(
        "Search all 714 listed ANZSCO occupations by code or title",
        "Filter occupations by MLTSSL, STSOL, ROL and CSOL",
        "Visa options matrix per occupation, with caveats",
        "Shortage rating by state (Occupation Shortage List)",
        "State and territory nomination counts for the program year",
        "SkillSelect EOI backlog by points for 189, 190 and 491",
        "Submitted, invited, lodged, on-hold and closed EOI views",
        "Monthly EOI trend for each subclass",
        "Client's points: how many submitted EOIs sit at or above them",
        "Invitation cut-off history and chart",
        "Assessing authority fees, processing time and validity",
        "ANZSCO 2013 and 2022 codes with ABS links",
        "Labour market profile and employment projection",
      ),
      ...next("Link an occupation to a client and track their rank monthly", "Alerts when a cut-off drops below a client's points"),
    ],
  },
  {
    group: "Mailbox",
    items: [
      ...live("Agency inbox", "Sent, archive and starred folders", "Compose and send email", "Messages filed to clients", "Read / unread state", "Sending through Resend from your agency domain"),
      ...next("A mailbox for every employee", "Shared mailboxes (info@, admin@)", "Inbound mail routing", "Email templates with merge fields", "Attachments to client documents", "Scheduled send"),
    ],
  },
  {
    group: "Tasks & calendar",
    items: [
      ...live(
        "Tasks with status, priority, due date and assignee",
        "Task board: to do, doing, waiting, done",
        "One-click complete",
        "Tasks linked to clients and matters",
        "My tasks on the dashboard",
        "Calendar month view",
        "Agenda of upcoming appointments",
        "Appointment types: consultation, follow-up, document check, interview, lodgement",
        "Consultation fees on bookings",
      ),
      ...next("Online booking page for clients", "Google and Outlook calendar sync", "SMS and email reminders", "Recurring tasks", "Video consultation links"),
    ],
  },
  {
    group: "Billing & trust",
    items: [
      ...live(
        "Invoices with GST at 10%",
        "GST-free disbursements for government charges",
        "Automatic invoice numbering with your prefix",
        "Invoice statuses: draft, sent, partial, paid, overdue",
        "Record payments",
        "Office and client trust accounts kept separate",
        "Trust balance",
        "Ledger of every receipt",
        "Billed, collected and outstanding totals",
      ),
      ...next("Stripe card payments", "Trust account reconciliation report", "Xero and MYOB sync", "Service agreements and Consumer Guide e-sign", "Payment plans", "Refund workflow"),
    ],
  },
  {
    group: "Employers",
    items: [...live("Employer directory", "ABN and contact details", "SBS approval and expiry", "Matters per employer"), ...next("Nomination tracking", "Sponsorship obligation reminders", "Labour market testing evidence tracker")],
  },
  {
    group: "Documents",
    items: [...live("Document register per client and matter", "Certified and translated flags", "Document expiry dates"), ...next("File uploads to Cloudflare R2", "Client upload links", "Passport OCR", "Document versioning")],
  },
  {
    group: "Team & organisation",
    items: [
      ...live(
        "Agencies as isolated workspaces",
        "Roles: owner, admin, supervisor, agent, staff, client",
        "Change a member's role",
        "Team workload: open matters per person",
        "Organisation chart",
        "Pending invitations",
        "Audit log of every change",
      ),
      ...live("Invite by email with position and MARN", "Positions: principal, MARA agent, education agent, consultant, reception, accounts, HR", "Navigation and actions follow each person's position", "MARN expiry warnings"),
      ...next("Multiple offices and branches", "Two-factor authentication", "Single sign-on", "Per-role permission editor"),
    ],
  },
  {
    group: "Employee portal & HR",
    items: [
      ...live(
        "Employee portal: my work, payslips, leave, timesheet, CPD and details",
        "Leave requests with manager approval",
        "Annual and personal leave accrual (NES)",
        "Timesheets with billable time against matters",
        "Pay runs: weekly, fortnightly or monthly",
        "PAYG withholding estimate on 2026–27 rates, Medicare levy and LITO",
        "Super guarantee at 12%",
        "Printable payslips with year-to-date totals",
        "Payslip emails when a pay run is finalised",
        "CPD log against the yearly target (mandatory ethics topics flagged)",
      ),
      ...next("Single Touch Payroll lodgement", "Payday super file export", "Rosters"),
    ],
  },
  {
    group: "AI mail assistant",
    items: [
      ...live(
        "Understands mail from Home Affairs, assessing bodies, state nomination, providers and clients",
        "Links each email to the right client by TRN, reference, passport, email or name, without sending your client list to AI",
        "Classifies grants, refusals, RFIs, health, biometrics, skills outcomes, invitations, offers and CoEs",
        "Pulls out grant numbers, decision dates, deadlines and conditions",
        "One suggested action per email: record the decision, set the RFI deadline or create a task",
        "Nothing changes until a person clicks; AI never replies, sends or deletes",
        "Agency consent with a visual three-step explainer; per-case consent when a case moves forward",
        "Client Emails tab and alerts on the client file",
        "Analyse any single email on request",
        "Connect Gmail or Outlook: synced into the inbox and understood by AI",
        "Send from the connected Gmail/Outlook account",
        "Use the agency's own email domain: add it, copy the DNS records, verify, and mailboxes move to it",
      ),
    ],
  },
  {
    group: "Settings & connectors",
    items: [
      ...live(
        "Settings hub: one card per area with live status, each opening its own page with tabs",
        "Connectors: Resend, Gmail, Outlook, your domain and Lodgely AI, each showing what it can and can't access",
        "Connect Resend with one click (OAuth, no API keys): mail on your domain sends from your own plan",
        "Lodgely adds its webhook to your Resend account, so replies come straight in",
        "Picks up a domain already verified in your Resend account automatically",
        "Live usage against your plan (Resend free plan: 100 a day, 3,000 a month)",
        "Automatic limit emails to owners and admins at 80% and 100%, once per period",
        "Domain DNS checked automatically while you add records, with a link to your DNS provider",
      ),
    ],
  },
  {
    group: "Lodgement",
    items: [
      ...live(
        "Lodgement pack per matter: every value ImmiAccount asks for, grouped the way the forms ask, with click-to-copy",
        "Dates in ImmiAccount's DD Mon YYYY format; family members and agent details included",
        "Documents ordered by the checklist, renamed (01 Passport - Surname Given.pdf) with a suggested ImmiAccount attachment type",
        "Checks before lodging: missing fields, outstanding checklist items, expiring passport, files over 5 MB or in formats ImmiAccount refuses",
        "Download the pack as a ZIP with a printable data sheet",
        "Lodgely for ImmiAccount (Chrome/Edge extension): pick the case in a side panel and fill the page you're on",
        "The extension signs in with one click and outlines what it filled; it never clicks Next, Submit or Pay",
        "Supervisor sign-off: a second registered agent approves the pack before a matter can be marked Lodged",
        "Sign-off records exactly what was approved; any later change to data or documents needs approving again",
        "Sole practitioners sign off their own; owners can make sign-off optional (Settings, Practice rules)",
        "Sign-off requests arrive as a task and an email; decisions go back the same way",
        "ART review deadline calculator: deemed notification (email, hand, post in Australia or overseas), 28 / 70 / 9 days or 7 working days, weekends and national holidays",
        "Deadline card on the matter, a task for the agent, and the countdown on the dashboard",
        "A refusal recorded from an email (AI mail assistant) diarises the ART deadline automatically for clients in Australia",
        "Service agreement e-signing: send from the matter, the client reads and signs on their phone in the portal",
        "Agreement includes parties, agent's MARN, fee estimate (GST and visa charge) and the agency's terms (editable, with a Code-of-Conduct template)",
        "Client confirms receiving the Consumer Guide, types their name and draws a signature",
        "Signed PDF with a signing record (times, sign-in, IP, device, fingerprint) saved to the client's documents; matter marked signed",
      ),
    ],
  },
  {
    group: "AI document checks & drafting",
    items: [
      ...live(
        "Every upload read by AI (photos, PDFs, scanned PDFs) and compared with its checklist item",
        "Flags wrong documents, unreadable copies, expired documents, passports expiring within 6 months",
        "Compares name, date of birth and passport number with the client record",
        "Spots documents that need an English translation",
        "Verdict on the checklist (looks good / check / wrong document) with details and re-check",
        "Findings feed the lodgement pack's Before lodging list",
        "AI drafts from the case file: cover letter, criteria submission, Genuine Student outline, s56 response, employer reference",
        "Drafts use [[placeholders]] instead of inventing facts, with a list of things to verify; edit, copy or download for Word",
        "Off until an admin agrees to what is shared (Settings → AI assistant)",
      ),
    ],
  },
  {
    group: "Payments & trust",
    items: [
      ...live(
        "Clients pay invoices in the portal by card through Stripe, Square, PayPal or Airwallex (whichever the agency connects)",
        "Card payments are confirmed with the provider before they're recorded; unfinished checkouts are re-checked daily",
        "Zeller Pay by Link per invoice; the client uploads the receipt",
        "Bank transfer with the trust account details and reference; the client uploads a screenshot for accounts to approve",
        "Payments to check: approve (records the receipt) or reject with a reason the client is emailed",
        "Payments recorded to the trust or office account, as the agency chooses",
        "Trust balances by client, move earned fees to office (never below zero), printable trust statements",
        "Monthly trust reconciliation: bank statement vs cashbook vs client ledgers, with history",
      ),
    ],
  },
  {
    group: "Onboarding",
    items: [
      ...live(
        "Guided agency setup: practice, MARN, services, brand, trust account, team, demo or clean start",
        "Live preview of the agency brand while setting up",
        "Team invites from setup with positions",
        "Welcome wizard for new staff: contact, emergency contact, MARN or QEAC, bank and super, policy agreements",
        "Role-aware welcome: shows what each position can do",
      ),
    ],
  },
  {
    group: "Education agents",
    items: [
      ...live(
        "Student application pipeline: preparing to enrolled",
        "Search every current CRICOS course, cheapest first",
        "Open an application straight from a course",
        "Partner institutions with commission rate and agreement expiry",
        "Commission tracking: claimable, invoiced, received",
        "Onshore-transfer commission ban flagged automatically (after 31 March 2026)",
        "Suggested pathways on every student file: learns from the agency's similar students",
        "Fastest PR route from the current visa and course when there's no agency history",
        "Courses that add points, matched to real CRICOS courses",
      ),
      ...next("Offer letter and CoE upload to the student", "Commission invoices to providers", "Provider portal links"),
    ],
  },
  {
    group: "Files",
    items: [...live("Agency drive with nested folders", "Move documents between folders", "Seven-year file retention: only admins can delete"), ...next("Folder sharing with clients", "Version history")],
  },
  {
    group: "Insight",
    items: [
      ...live("Dashboard with live counts", "Pipeline by stage chart", "Expiring visas in the next 90 days", "Upcoming appointments", "Recent activity", "Revenue by month", "Matters by visa", "Clients by source", "Outcomes"),
      ...next("Conversion funnel", "Staff performance report", "Export any report to CSV"),
    ],
  },
  {
    group: "Workspace",
    items: [
      ...live("⌘K command menu", "Dark mode", "Works on phones, tablets and desktops", "Collapsible sidebar", "Instant page navigation", "Agency profile with MARN and ABN", "Demo agency in one click"),
      ...live("Client upload portal for checklist documents", "Client portal app: sign in with a 6-digit email code or one-tap link, no password", "Client portal: case progress, Home Affairs status and RFI due dates", "Client portal: checklist uploads from the phone camera", "Client portal: case timeline and files", "Client portal: invoices, bank transfer details with copy buttons, payments received", "Client portal: messages to the agency inbox", "Client portal: clients keep their contact details current", "View the portal as the client"),
      ...next("Mobile app"),
    ],
  },
];

export const featureCount = features.reduce((a, g) => a + g.items.length, 0);
export const liveCount = features.reduce((a, g) => a + g.items.filter((i) => i.status === "live").length, 0);
