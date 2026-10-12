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
      ...next("Duplicate detection and merge", "Bulk import from CSV and other CRMs", "Custom fields", "Client tags and segments", "Birthday and anniversary reminders"),
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
    group: "Education agents",
    items: [
      ...live(
        "Student application pipeline: preparing to enrolled",
        "Search every current CRICOS course, cheapest first",
        "Open an application straight from a course",
        "Partner institutions with commission rate and agreement expiry",
        "Commission tracking: claimable, invoiced, received",
        "Onshore-transfer commission ban flagged automatically (after 31 March 2026)",
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
      ...live("Client upload portal for checklist documents"),
      ...next("AI drafting of submissions and cover letters", "AI document check against the checklist", "Mobile app"),
    ],
  },
];

export const featureCount = features.reduce((a, g) => a + g.items.length, 0);
export const liveCount = features.reduce((a, g) => a + g.items.filter((i) => i.status === "live").length, 0);
