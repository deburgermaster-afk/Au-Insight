// Lodgely's data: everything belongs to an agency (a Better Auth organization). Every query is
// scoped by agency_id in the data layer (src/lib/data); on a self-hosted Postgres the same column
// carries row-level security.
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth-schema";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);
const agency = () =>
  text("agency_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
const stamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const clientStage = pgEnum("client_stage", ["lead", "prospect", "active", "on_hold", "past", "lost"]);
export const matterStage = pgEnum("matter_stage", [
  "enquiry",
  "consultation",
  "engaged",
  "documents",
  "ready",
  "lodged",
  "rfi",
  "decision",
  "closed",
]);
export const priority = pgEnum("priority", ["low", "normal", "high", "urgent"]);
export const checklistStatus = pgEnum("checklist_status", ["needed", "requested", "received", "approved", "rejected", "waived"]);
export const taskStatus = pgEnum("task_status", ["todo", "doing", "waiting", "done"]);
export const invoiceStatus = pgEnum("invoice_status", ["draft", "sent", "partial", "paid", "overdue", "void"]);

/** The agency's own details (one row per organization): registration, branding, defaults. */
export const agencyProfile = pgTable("agency_profile", {
  agencyId: agency().primaryKey(),
  legalName: text("legal_name"),
  abn: text("abn"),
  marn: text("marn"), // principal's Migration Agents Registration Number
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  state: text("state"),
  brandColor: text("brand_color").default("#6d5efc"),
  /** R2 key of the agency logo (PNG or JPG), shown on letterheads, receipts and agreements. */
  logoKey: text("logo_key"),
  gstRegistered: boolean("gst_registered").default(true).notNull(),
  invoicePrefix: text("invoice_prefix").default("INV").notNull(),
  /** Where clients pay: shown on invoices and in the client portal. */
  bankName: text("bank_name"),
  bankAccountName: text("bank_account_name"),
  bankBsb: text("bank_bsb"),
  bankAccount: text("bank_account"),
  nextInvoiceNumber: integer("next_invoice_number").default(1001).notNull(),
  /** What the practice offers, picked during setup: skilled, employer, family, student, education… */
  services: text("services").array(),
  teamSize: text("team_size"),
  /** Set when the owner finishes the setup wizard. */
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  /** AI mail assistant: when an admin turned it on (null = off) and who. */
  aiMailEnabledAt: timestamp("ai_mail_enabled_at", { withTimezone: true }),
  aiMailEnabledBy: text("ai_mail_enabled_by"),
  /** The agency's own email domain in Resend (sending + receiving), once added in Settings. */
  mailDomain: text("mail_domain"),
  mailDomainId: text("mail_domain_id"),
  mailDomainStatus: text("mail_domain_status"), // not_started | pending | verified | failed | partially_verified …
  mailDomainRecords: jsonb("mail_domain_records").$type<{ record: string; name: string; type: string; value: string; priority?: number; status: string }[]>(),
  mailDomainCheckedAt: timestamp("mail_domain_checked_at", { withTimezone: true }),
  mailDomainVia: text("mail_domain_via"), // lodgely (shared account) | resend (the agency's connected account)
  mailUsageAlerts: jsonb("mail_usage_alerts").$type<string[]>(), // limit emails already sent, e.g. "day:2026-10-12:80"
  /** A second registered agent must sign off a lodgement before the matter can move to Lodged. */
  requireSignoff: boolean("require_signoff").default(true).notNull(),
  /** The agency's own wording for service agreements (null = Lodgely's template). */
  agreementTerms: text("agreement_terms"),
  /** Clients can pay by bank transfer and upload proof. */
  bankTransferEnabled: boolean("bank_transfer_enabled").default(true).notNull(),
  /** Where online and transfer payments are recorded: trust (money for future work) or office. */
  paymentsAccount: text("payments_account").default("trust").notNull(),
  /** AI document checks and drafting switched on (consent recorded). */
  aiDocsEnabledAt: timestamp("ai_docs_enabled_at", { withTimezone: true }),
  aiDocsEnabledBy: text("ai_docs_enabled_by"),
  /** Agency's own checklists, fees, assignment rules and pick lists (Settings → Workflow). */
  workflow: jsonb("workflow").$type<WorkflowConfig>(),
  /** Xero / MYOB account codes and whether invoices sync automatically. */
  accounting: jsonb("accounting").$type<AccountingSettings>(),
  ...stamps,
});

export type AccountingSettings = {
  /** Revenue account for professional fees (Xero AU default 200 Sales). */
  salesAccount?: string;
  /** Account for disbursements passed on at cost. */
  disbursementAccount?: string;
  /** Bank account office receipts are paid into (Xero account code). */
  bankAccount?: string;
  /** Push invoices and office receipts to Xero as they happen. */
  autoSync?: boolean;
};

export type WorkflowConfig = {
  checklists?: Record<string, { category: string; label: string; required: boolean }[]>;
  fees?: Record<string, { professional: number | null; government: number | null }>;
  assignment?: { rules: { match: string; userId: string }[]; fallback: "creator" | "round_robin" | "least_busy"; pool: string[]; cursor?: number };
  lists?: { sources?: string[]; tags?: string[]; documentCategories?: string[]; outcomes?: string[] };
  referencePrefix?: string;
};

export const clients = pgTable(
  "clients",
  {
    id: id(),
    agencyId: agency(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    dateOfBirth: date("date_of_birth"),
    gender: text("gender"),
    nationality: text("nationality"),
    countryOfBirth: text("country_of_birth"),
    passportNumber: text("passport_number"),
    passportExpiry: date("passport_expiry"),
    address: text("address"),
    city: text("city"),
    state: text("state"),
    onshore: boolean("onshore").default(true).notNull(),
    currentVisa: text("current_visa"), // subclass, e.g. "500"
    visaExpiry: date("visa_expiry"),
    visaConditions: text("visa_conditions").array(),
    englishTest: text("english_test"),
    englishScore: text("english_score"),
    occupation: text("occupation"),
    anzsco: text("anzsco"),
    stage: clientStage("stage").default("lead").notNull(),
    source: text("source"), // referral, website, walk-in, social…
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    portalEnabled: boolean("portal_enabled").default(false).notNull(),
    /** The matching contact in the agency's Xero file. */
    xeroContactId: text("xero_contact_id"),
    ...stamps,
  },
  (t) => [index("clients_agency_idx").on(t.agencyId, t.stage), index("clients_visa_expiry_idx").on(t.agencyId, t.visaExpiry)],
);

/** A saved client filter ("segment"): reused for lists, bulk email and exports. */
export const clientSegments = pgTable("client_segments", {
  id: id(),
  agencyId: agency(),
  name: text("name").notNull(),
  filters: jsonb("filters").$type<SegmentFilters>().notNull(),
  createdBy: text("created_by"),
  createdByName: text("created_by_name"),
  ...stamps,
});

export type SegmentFilters = {
  q?: string;
  stages?: string[];
  tags?: string[];
  /** any: has at least one of the tags; all: has every tag. */
  tagMode?: "any" | "all";
  visas?: string[];
  sources?: string[];
  nationalities?: string[];
  location?: "onshore" | "offshore";
  /** Current visa expires within this many days. */
  expiryDays?: number;
  assignedTo?: string[];
};

/** Family members included in a client's applications. */
export const dependants = pgTable("dependants", {
  id: id(),
  agencyId: agency(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  relationship: text("relationship").notNull(), // partner, child, parent…
  dateOfBirth: date("date_of_birth"),
  passportNumber: text("passport_number"),
  ...stamps,
});

/** Sponsoring employers (482, 186, 494, labour agreements). */
export const employers = pgTable("employers", {
  id: id(),
  agencyId: agency(),
  name: text("name").notNull(),
  abn: text("abn"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  industry: text("industry"),
  sbsApproved: boolean("sbs_approved").default(false).notNull(),
  sbsExpiry: date("sbs_expiry"),
  annualTurnover: numeric("annual_turnover"),
  ...stamps,
});

/** A nomination lodged by a sponsoring employer for a position (482, 186, 494, labour agreement, 407). */
export const nominations = pgTable(
  "nominations",
  {
    id: id(),
    agencyId: agency(),
    employerId: text("employer_id")
      .notNull()
      .references(() => employers.id, { onDelete: "cascade" }),
    /** The nominee, and the visa application the nomination supports. */
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    /** 482_core | 482_specialist | 482_essential | 186_direct | 186_trt | 494 | labour_agreement | 407 */
    program: text("program").notNull(),
    positionTitle: text("position_title").notNull(),
    anzsco: text("anzsco"),
    /** Annual base salary offered (AUD), checked against the income threshold. */
    salary: numeric("salary"),
    worksite: text("worksite"),
    /** preparing | lodged | further_info | approved | refused | withdrawn | lapsed */
    status: text("status").default("preparing").notNull(),
    trn: text("trn"),
    lodgedAt: date("lodged_at"),
    decidedAt: date("decided_at"),
    /** The last day the nominee's visa can be lodged against this approval. */
    approvalExpires: date("approval_expires"),
    /** Labour market testing: not_required | needed | in_progress | done */
    lmt: text("lmt").default("needed").notNull(),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    notes: text("notes"),
    ...stamps,
  },
  (t) => [index("nominations_agency_idx").on(t.agencyId, t.status), index("nominations_employer_idx").on(t.employerId)],
);

/** A matter: one application or piece of work for a client (a visa, a review, citizenship…). */
export const matters = pgTable(
  "matters",
  {
    id: id(),
    agencyId: agency(),
    reference: text("reference").notNull(), // LDG-2026-0042
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    employerId: text("employer_id").references(() => employers.id, { onDelete: "set null" }),
    visaCode: text("visa_code").notNull(), // key into the visa library, e.g. "190"
    stream: text("stream"),
    title: text("title").notNull(),
    stage: matterStage("stage").default("enquiry").notNull(),
    priority: priority("priority").default("normal").notNull(),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    supervisorId: text("supervisor_id").references(() => user.id, { onDelete: "set null" }),
    lodgedAt: date("lodged_at"),
    trn: text("trn"), // Home Affairs transaction reference number
    decisionAt: date("decision_at"),
    outcome: text("outcome"), // granted, refused, withdrawn…
    dueAt: date("due_at"),
    /** Deadline to respond to a Home Affairs request (s56 / RFI) or for a review application. */
    rfiDueAt: date("rfi_due_at"),
    /** Last day to apply to the Administrative Review Tribunal after a refusal or cancellation. */
    reviewDueAt: date("review_due_at"),
    reviewBasis: jsonb("review_basis").$type<ReviewBasis>(),
    reviewLodgedAt: date("review_lodged_at"),
    /** OMARA Code s38: Consumer Guide given before any assistance. */
    consumerGuideAt: date("consumer_guide_at"),
    /** OMARA Code s42/s51: signed service agreement before fees are taken. */
    agreementSignedAt: date("agreement_signed_at"),
    /** AI email tracking for this matter: null = not asked yet, true/false = staff decision. */
    aiTracking: boolean("ai_tracking"),
    aiTrackingAt: timestamp("ai_tracking_at", { withTimezone: true }),
    aiTrackingBy: text("ai_tracking_by"),
    feeProfessional: numeric("fee_professional"),
    feeGovernment: numeric("fee_government"),
    pointsClaimed: integer("points_claimed"),
    occupation: text("occupation"),
    anzsco: text("anzsco"),
    notes: text("notes"),
    ...stamps,
  },
  (t) => [index("matters_agency_stage_idx").on(t.agencyId, t.stage), index("matters_client_idx").on(t.clientId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: id(),
    agencyId: agency(),
    matterId: text("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    category: text("category").notNull(), // Identity, Character, Health, English, Skills…
    label: text("label").notNull(),
    required: boolean("required").default(true).notNull(),
    status: checklistStatus("status").default("needed").notNull(),
    documentId: text("document_id"),
    note: text("note"),
    sort: integer("sort").default(0).notNull(),
    ...stamps,
  },
  (t) => [index("checklist_matter_idx").on(t.matterId)],
);

export const documents = pgTable(
  "documents",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    category: text("category"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key"),
    expiresAt: date("expires_at"),
    uploadedBy: text("uploaded_by"),
    checklistItemId: text("checklist_item_id"),
    folderId: text("folder_id"),
    source: text("source"), // upload | email | portal
    /** Offer letters and CoEs filed against a study application. */
    applicationId: text("application_id"),
    certified: boolean("certified").default(false).notNull(),
    translated: boolean("translated").default(false).notNull(),
    ...stamps,
  },
  (t) => [index("documents_client_idx").on(t.agencyId, t.clientId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    agencyId: agency(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").default("todo").notNull(),
    priority: priority("priority").default("normal").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    assignedTo: text("assigned_to").references(() => user.id, { onDelete: "set null" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    createdBy: text("created_by"),
    ...stamps,
  },
  (t) => [index("tasks_agency_idx").on(t.agencyId, t.status, t.dueAt)],
);

/** Everything that happened on a client or matter: notes, calls, stage changes, emails, files. */
export const activities = pgTable(
  "activities",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // note, call, meeting, email, stage, document, task, invoice, system
    title: text("title").notNull(),
    body: text("body"),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    pinned: boolean("pinned").default(false).notNull(),
    ...stamps,
  },
  (t) => [index("activities_client_idx").on(t.agencyId, t.clientId, t.createdAt)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    agencyId: agency(),
    title: text("title").notNull(),
    kind: text("kind").default("consultation").notNull(), // consultation, follow-up, document check, interview
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    location: text("location"), // office, phone, video link
    clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    staffId: text("staff_id").references(() => user.id, { onDelete: "set null" }),
    fee: numeric("fee"),
    notes: text("notes"),
    ...stamps,
  },
  (t) => [index("appointments_agency_idx").on(t.agencyId, t.startsAt)],
);

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    agencyId: agency(),
    number: text("number").notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    status: invoiceStatus("status").default("draft").notNull(),
    issuedAt: date("issued_at"),
    dueAt: date("due_at"),
    items: jsonb("items").$type<{ description: string; quantity: number; unitPrice: number; gst: boolean; disbursement?: boolean }[]>().default([]).notNull(),
    subtotal: numeric("subtotal").default("0").notNull(),
    gst: numeric("gst").default("0").notNull(),
    total: numeric("total").default("0").notNull(),
    paid: numeric("paid").default("0").notNull(),
    notes: text("notes"),
    /** A Zeller Pay by Link the agency created for this invoice. */
    zellerLink: text("zeller_link"),
    /** The invoice in the agency's Xero file, when synced. */
    xeroId: text("xero_id"),
    xeroSyncedAt: timestamp("xero_synced_at", { withTimezone: true }),
    xeroError: text("xero_error"),
    ...stamps,
  },
  (t) => [index("invoices_agency_idx").on(t.agencyId, t.status)],
);

/** Money in and out, including client money held in trust (OMARA Code of Conduct). */
export const ledger = pgTable(
  "ledger",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    account: text("account").default("office").notNull(), // office | trust
    kind: text("kind").notNull(), // receipt, payment, transfer, refund
    amount: numeric("amount").notNull(),
    method: text("method"), // bank transfer, card, cash
    reference: text("reference"),
    occurredAt: date("occurred_at").notNull(),
    memo: text("memo"),
    /** The payment in Xero, when an office receipt has been synced. */
    xeroId: text("xero_id"),
    ...stamps,
  },
  (t) => [index("ledger_agency_idx").on(t.agencyId, t.account, t.occurredAt)],
);

/** Mailbox: every message sent or received by the agency's staff, linked to clients and matters. */
export const messages = pgTable(
  "messages",
  {
    id: id(),
    agencyId: agency(),
    threadKey: text("thread_key").notNull(),
    folder: text("folder").default("inbox").notNull(), // inbox, sent, drafts, archive, trash
    mailbox: text("mailbox").notNull(), // the staff or shared address it belongs to
    fromAddress: text("from_address").notNull(),
    fromName: text("from_name"),
    toAddresses: text("to_addresses").array().notNull(),
    ccAddresses: text("cc_addresses").array(),
    subject: text("subject").notNull(),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    read: boolean("read").default(false).notNull(),
    starred: boolean("starred").default(false).notNull(),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    providerId: text("provider_id"),
    bccAddresses: text("bcc_addresses").array(),
    attachments: jsonb("attachments").$type<MailAttachment[]>().default([]).notNull(),
    /** sent → delivered | bounced | failed | complained | delayed; "received" for inbound. */
    status: text("status"),
    /** Inbound only: the sender's SPF / DKIM / DMARC results from Authentication-Results. */
    auth: jsonb("auth").$type<{ spf?: string; dkim?: string; dmarc?: string; verified: boolean }>(),
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    ...stamps,
  },
  (t) => [index("messages_mailbox_idx").on(t.agencyId, t.mailbox, t.folder, t.sentAt)],
);

/** HR record for each staff member: position, registration, employment and pay. */
/** Client portal sign-in: single-use email links ("magic") and the sessions they start. Tokens are stored hashed. */
export const clientSessions = pgTable("client_sessions", {
  id: id(),
  agencyId: agency(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  kind: text("kind").notNull(), // magic | code | session
  /** Wrong guesses against a sign-in code; the code dies after 5. */
  attempts: integer("attempts").default(0).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** The position an invitee gets once they accept (Better Auth invitations only carry a role). */
export const invitePositions = pgTable("invite_positions", {
  invitationId: text("invitation_id").primaryKey(),
  agencyId: agency(),
  position: text("position").notNull(),
  marn: text("marn"),
  /** Custom access role chosen at invite (agency_roles.id), and the work address to create on joining. */
  roleId: text("role_id"),
  workEmail: text("work_email"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** An agency's own access role: a named set of features (capabilities) assigned to staff instead of their position's defaults. */
export const agencyRoles = pgTable("agency_roles", {
  id: id(),
  agencyId: agency(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color").default("#6d5efc").notNull(),
  caps: text("caps").array().notNull(),
  createdByName: text("created_by_name"),
  ...stamps,
});

export const staffProfiles = pgTable("staff_profiles", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** principal | migration_agent | education_agent | consultant | reception | accounts | hr */
  position: text("position").default("consultant").notNull(),
  /** A custom access role (agency_roles.id); when set its features replace the position's defaults. */
  roleId: text("role_id"),
  title: text("title"),
  phone: text("phone"),
  managerId: text("manager_id"),
  marn: text("marn"),
  marnExpiry: date("marn_expiry"),
  /** Education agent training, e.g. PIER QEAC number. */
  qeac: text("qeac"),
  employment: text("employment").default("full_time").notNull(), // full_time | part_time | casual | contractor
  startDate: date("start_date"),
  payType: text("pay_type").default("salary").notNull(), // salary | hourly
  payRate: numeric("pay_rate"), // annual salary or hourly rate
  hoursPerWeek: numeric("hours_per_week").default("38").notNull(),
  superRate: numeric("super_rate").default("12").notNull(),
  taxFreeThreshold: boolean("tax_free_threshold").default(true).notNull(),
  superFund: text("super_fund"),
  bankBsb: text("bank_bsb"),
  bankAccount: text("bank_account"),
  annualLeaveHours: numeric("annual_leave_hours").default("0").notNull(),
  personalLeaveHours: numeric("personal_leave_hours").default("0").notNull(),
  cpdTarget: integer("cpd_target").default(10).notNull(),
  emergencyName: text("emergency_name"),
  emergencyPhone: text("emergency_phone"),
  emergencyRelation: text("emergency_relation"),
  // Legal identity and contact, as reported to the ATO through Single Touch Payroll.
  givenName: text("given_name"),
  middleName: text("middle_name"),
  familyName: text("family_name"),
  dob: date("dob"),
  gender: text("gender"), // female | male | other | unspecified
  personalEmail: text("personal_email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  suburb: text("suburb"),
  addressState: text("address_state"),
  postcode: text("postcode"),
  country: text("country").default("AU"),
  // TFN declaration. The TFN is encrypted at rest and only shown masked.
  tfnEnc: text("tfn_enc"),
  /** provided | pending (applied for) | under18 | pensioner | none */
  tfnStatus: text("tfn_status").default("none").notNull(),
  residency: text("residency").default("resident").notNull(), // resident | foreign | whm
  stsl: boolean("stsl").default(false).notNull(),
  medicareExemption: text("medicare_exemption").default("none").notNull(), // none | half | full
  extraWithholding: numeric("extra_withholding"),
  tfnDeclaredAt: timestamp("tfn_declared_at", { withTimezone: true }),
  // Employment details for STP and awards.
  incomeType: text("income_type").default("SAW").notNull(), // SAW | WHM | FEI | CHP | IAA | SWP | JPD | VOL | LAB | OSP
  homeCountry: text("home_country"), // WHM and foreign employment: ISO country
  payFrequency: text("pay_frequency"), // weekly | fortnightly | monthly; null = agency default
  endDate: date("end_date"),
  cessationType: text("cessation_type"), // V | I | D | R | F | C | T
  awardCode: text("award_code"), // e.g. MA000002
  awardName: text("award_name"),
  classification: text("classification"),
  classificationRate: numeric("classification_rate"), // award minimum hourly rate
  payrollId: text("payroll_id"),
  // Super choice.
  superType: text("super_type").default("default").notNull(), // apra | smsf | stapled | default
  superUsi: text("super_usi"),
  superAbn: text("super_abn"),
  superMember: text("super_member"),
  smsfEsa: text("smsf_esa"),
  smsfBsb: text("smsf_bsb"),
  smsfAccount: text("smsf_account"),
  smsfAccountName: text("smsf_account_name"),
  salarySacrificeSuper: numeric("salary_sacrifice_super"), // per pay, before tax
  extraSuperRate: numeric("extra_super_rate"), // employer contributions above SG, % of earnings
  superChoiceAt: timestamp("super_choice_at", { withTimezone: true }),
  bankAccountName: text("bank_account_name"),
  externalIds: jsonb("external_ids").$type<Record<string, string>>(),
  /** Code of Conduct, privacy and confidentiality acknowledged in the welcome wizard. */
  policiesAcceptedAt: timestamp("policies_accepted_at", { withTimezone: true }),
  onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
  ...stamps,
});

export const leaveRequests = pgTable("leave_requests", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id").notNull(),
  kind: text("kind").default("annual").notNull(), // annual | personal | unpaid | other
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  hours: numeric("hours").notNull(),
  status: text("status").default("pending").notNull(), // pending | approved | declined
  note: text("note"),
  decidedBy: text("decided_by"),
  ...stamps,
});

/** Time worked; billable entries can be linked to a matter. */
export const timeEntries = pgTable("time_entries", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  hours: numeric("hours").notNull(),
  note: text("note"),
  matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
  billable: boolean("billable").default(false).notNull(),
  payRunId: text("pay_run_id"),
  ...stamps,
});

export const payRuns = pgTable("pay_runs", {
  id: id(),
  agencyId: agency(),
  periodStart: date("period_start").notNull(),
  periodEnd: date("period_end").notNull(),
  payDate: date("pay_date").notNull(),
  frequency: text("frequency").default("fortnightly").notNull(), // weekly | fortnightly | monthly
  status: text("status").default("draft").notNull(), // draft | finalised
  gross: numeric("gross").default("0").notNull(),
  tax: numeric("tax").default("0").notNull(),
  superTotal: numeric("super_total").default("0").notNull(),
  net: numeric("net").default("0").notNull(),
  createdBy: text("created_by"),
  ...stamps,
});

export const payslips = pgTable("payslips", {
  id: id(),
  agencyId: agency(),
  payRunId: text("pay_run_id")
    .notNull()
    .references(() => payRuns.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  hours: numeric("hours").default("0").notNull(),
  gross: numeric("gross").notNull(),
  tax: numeric("tax").notNull(),
  superAmount: numeric("super_amount").notNull(),
  net: numeric("net").notNull(),
  annualAccrued: numeric("annual_accrued").default("0").notNull(),
  personalAccrued: numeric("personal_accrued").default("0").notNull(),
  lines: jsonb("lines").$type<PayLine[]>().default([]).notNull(),
  /** Lines staff added to this payslip by hand (overtime, allowances, bonuses, deductions). */
  extras: jsonb("extras").$type<PayLine[]>().default([]).notNull(),
  stsl: numeric("stsl").default("0").notNull(),
  qualifying: numeric("qualifying").default("0").notNull(),
  salarySacrifice: numeric("salary_sacrifice").default("0").notNull(),
  deductions: numeric("deductions").default("0").notNull(),
  taxScale: text("tax_scale"),
  taxTreatment: text("tax_treatment"),
  superDue: date("super_due"),
  notes: jsonb("notes").$type<string[]>().default([]).notNull(),
  ...stamps,
});

/** One line on a payslip, tagged with how Single Touch Payroll reports it. */
export type PayLine = {
  label: string;
  kind: "ordinary" | "casual_loading" | "overtime" | "allowance" | "bonus" | "leave" | "sacrifice_super" | "sacrifice_other" | "deduction" | "lump_sum" | "note";
  hours?: number;
  rate?: number;
  amount: number;
  /** STP Phase 2 code: allowance (CD, AD, LD, MD, RD, TD, KN, QN, OD), leave (O, C, U, P, W, A), deduction (F, W, G, D), lump sum (A, B, D, E, W). */
  code?: string;
  /** Counts as ordinary time earnings for super. */
  ote?: boolean;
};

/** Payroll set-up for the agency: who reports to the ATO, when staff are paid, where super goes. */
export const payrollSettings = pgTable("payroll_settings", {
  agencyId: agency().primaryKey(),
  branch: text("branch").default("001").notNull(),
  /** Business management software ID: identifies this payroll to the ATO. */
  bmsId: text("bms_id")
    .default(sql`gen_random_uuid()::text`)
    .notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  addressLine1: text("address_line1"),
  suburb: text("suburb"),
  addressState: text("address_state"),
  postcode: text("postcode"),
  frequency: text("frequency").default("fortnightly").notNull(),
  /** First day of the next pay period; periods roll forward from here. */
  periodStart: date("period_start"),
  /** Days after the period ends that staff are paid. */
  payLagDays: integer("pay_lag_days").default(2).notNull(),
  defaultFundName: text("default_fund_name"),
  defaultFundUsi: text("default_fund_usi"),
  defaultFundAbn: text("default_fund_abn"),
  clearingHouse: text("clearing_house"), // beam | quicksuper | clicksuper | superchoice | fund | other
  whmRegistered: boolean("whm_registered").default(false).notNull(),
  awardCode: text("award_code"),
  awardName: text("award_name"),
  /** How STP reports leave the agency: file (upload to a registered STP solution) | employment_hero | xero */
  stpVia: text("stp_via").default("file").notNull(),
  stpDeclarationName: text("stp_declaration_name"),
  // Account wages are paid from, for the ABA bank file.
  payBankCode: text("pay_bank_code"), // CBA, WBC, NAB, ANZ, ...
  payBsb: text("pay_bsb"),
  payAccount: text("pay_account"),
  payAccountName: text("pay_account_name"),
  apcaId: text("apca_id"), // direct entry user ID from the bank
  expenseAccount: text("expense_account").default("Wages and salaries").notNull(),
  superExpenseAccount: text("super_expense_account").default("Superannuation").notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  ...stamps,
});

/** Payday Super: one contribution per employee per pay, due at the fund within 7 days. */
export const superContributions = pgTable(
  "super_contributions",
  {
    id: id(),
    agencyId: agency(),
    payRunId: text("pay_run_id")
      .notNull()
      .references(() => payRuns.id, { onDelete: "cascade" }),
    payslipId: text("payslip_id").notNull(),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    fund: jsonb("fund").$type<{ type: string; name: string | null; usi: string | null; abn: string | null; member: string | null; esa?: string | null; bsb?: string | null; account?: string | null }>().notNull(),
    sg: numeric("sg").notNull(),
    sacrifice: numeric("sacrifice").default("0").notNull(),
    extra: numeric("extra").default("0").notNull(),
    payDate: date("pay_date").notNull(),
    dueDate: date("due_date").notNull(),
    status: text("status").default("due").notNull(), // due | sent | paid
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("super_contrib_agency_idx").on(t.agencyId, t.status)],
);

/** Single Touch Payroll reports: pay events, update events and end-of-year finalisation. */
export const stpEvents = pgTable(
  "stp_events",
  {
    id: id(),
    agencyId: agency(),
    kind: text("kind").notNull(), // pay | update | finalisation
    payRunId: text("pay_run_id"),
    financialYear: text("financial_year").notNull(),
    submissionId: text("submission_id")
      .default(sql`gen_random_uuid()::text`)
      .notNull(),
    status: text("status").default("ready").notNull(), // ready | needs_fixing | lodged | accepted | rejected
    via: text("via"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    problems: jsonb("problems").$type<{ who: string; text: string }[]>().default([]).notNull(),
    payees: integer("payees").default(0).notNull(),
    gross: numeric("gross").default("0").notNull(),
    tax: numeric("tax").default("0").notNull(),
    receipt: text("receipt"),
    response: text("response"),
    lodgedAt: timestamp("lodged_at", { withTimezone: true }),
    lodgedBy: text("lodged_by"),
    ...stamps,
  },
  (t) => [index("stp_events_agency_idx").on(t.agencyId, t.createdAt)],
);

/** Employment contract templates: built in, drafted by AI from a description, or imported from a file. */
export const contractTemplates = pgTable("contract_templates", {
  id: id(),
  agencyId: agency(),
  name: text("name").notNull(),
  employment: text("employment").default("full_time").notNull(),
  body: text("body").notNull(),
  source: text("source").default("manual").notNull(), // builtin | ai_description | ai_import | manual
  analysis: jsonb("analysis").$type<ContractReview>(),
  createdBy: text("created_by"),
  ...stamps,
});

export type ContractReview = {
  summary: string;
  issues: { level: "block" | "warn" | "info"; text: string }[];
  missing: string[];
};

/** A contract issued to one staff member, signed in their Me portal. */
export const employmentContracts = pgTable(
  "employment_contracts",
  {
    id: id(),
    agencyId: agency(),
    userId: text("user_id").notNull(),
    templateId: text("template_id"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").default("draft").notNull(), // draft | sent | signed | void
    hash: text("hash"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedName: text("signed_name"),
    signedIp: text("signed_ip"),
    signedAgent: text("signed_agent"),
    pdfKey: text("pdf_key"),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    ...stamps,
  },
  (t) => [index("employment_contracts_user_idx").on(t.agencyId, t.userId)],
);

/** Continuing professional development, for registered migration agents. */
export const cpdRecords = pgTable("cpd_records", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id").notNull(),
  date: date("date").notNull(),
  activity: text("activity").notNull(),
  provider: text("provider"),
  points: numeric("points").notNull(),
  ...stamps,
});

/** The agency drive: nested folders, optionally tied to a client, with a minimum role to see them. */
export const folders = pgTable("folders", {
  id: id(),
  agencyId: agency(),
  parentId: text("parent_id"),
  name: text("name").notNull(),
  clientId: text("client_id").references(() => clients.id, { onDelete: "cascade" }),
  /** Lowest member role that can open it: staff (everyone) … admin. */
  minRole: text("min_role").default("staff").notNull(),
  createdBy: text("created_by"),
  ...stamps,
});

/** Education providers the agency represents. */
export const institutions = pgTable("institutions", {
  id: id(),
  agencyId: agency(),
  name: text("name").notNull(),
  cricos: text("cricos"),
  state: text("state"),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  commissionRate: numeric("commission_rate"), // % of first-year tuition
  agreementExpiry: date("agreement_expiry"),
  /** Partnership: a signed agency agreement with the institution (commission, scholarships, fee collection). */
  partner: boolean("partner").default(false).notNull(),
  agreementStart: date("agreement_start"),
  agreementRef: text("agreement_ref"),
  /** The agency may collect tuition on the institution's behalf and remit it. */
  collectsTuition: boolean("collects_tuition").default(false).notNull(),
  remitDays: integer("remit_days"), // days to remit collected tuition, per the agreement
  bankDetails: text("bank_details"), // for remittances
  website: text("website"),
  notes: text("notes"),
  ...stamps,
});

/** A scholarship the agency can offer under a partner institution's agreement (or fund itself). */
export const scholarships = pgTable("scholarships", {
  id: id(),
  agencyId: agency(),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("percent"), // percent | amount
  value: numeric("value").notNull(),
  appliesTo: text("applies_to").notNull().default("first_year"), // first_year | full_course | first_semester | one_off
  funding: text("funding").notNull().default("institution"), // institution | agency | shared
  eligibility: text("eligibility"),
  conditions: text("conditions"), // e.g. maintain 65% average, full-time enrolment
  maxAwards: integer("max_awards"),
  closesAt: date("closes_at"),
  active: boolean("active").default(true).notNull(),
  ...stamps,
});

/** A scholarship offered to a student for an application; accepted by signing the offer letter. */
export const scholarshipAwards = pgTable(
  "scholarship_awards",
  {
    id: id(),
    agencyId: agency(),
    scholarshipId: text("scholarship_id")
      .notNull()
      .references(() => scholarships.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => studentApplications.id, { onDelete: "set null" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    amount: numeric("amount").notNull(), // dollar value of the award
    status: text("status").notNull().default("offered"), // offered | accepted | declined | revoked
    signRequestId: text("sign_request_id"),
    awardedBy: text("awarded_by"),
    awardedByName: text("awarded_by_name"),
    ...stamps,
  },
  (t) => [index("scholarship_awards_client_idx").on(t.agencyId, t.clientId)],
);

/** Tuition the agency collects from a student on the institution's behalf, billed as an invoice and remitted. */
export const tuitionPayments = pgTable(
  "tuition_payments",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    applicationId: text("application_id").references(() => studentApplications.id, { onDelete: "set null" }),
    institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
    invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "set null" }),
    period: text("period").notNull(), // "Semester 1, 2027"
    kind: text("kind").notNull().default("tuition"), // tuition | enrolment | materials | oshc | other
    gross: numeric("gross").notNull(), // fee before scholarship
    scholarship: numeric("scholarship").notNull().default("0"),
    amount: numeric("amount").notNull(), // what the student pays
    status: text("status").notNull().default("billed"), // billed | paid | remitted | refunded
    remittedAt: date("remitted_at"),
    remittedRef: text("remitted_ref"),
    createdBy: text("created_by"),
    ...stamps,
  },
  (t) => [index("tuition_payments_agency_idx").on(t.agencyId, t.status), index("tuition_payments_client_idx").on(t.clientId)],
);

export const studentApplications = pgTable("student_applications", {
  id: id(),
  agencyId: agency(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  institutionId: text("institution_id").references(() => institutions.id, { onDelete: "set null" }),
  course: text("course").notNull(),
  courseCode: text("course_code"),
  intake: text("intake"),
  /** preparing | submitted | offer | conditional | accepted | coe | enrolled | rejected | withdrawn */
  status: text("status").default("preparing").notNull(),
  tuitionFee: numeric("tuition_fee"),
  commissionRate: numeric("commission_rate"),
  /** not_due | claimable | invoiced | received | ineligible */
  commissionStatus: text("commission_status").default("not_due").notNull(),
  /** Already a student in Australia moving providers: no commission for students accepted after 31 March 2026 (ESOS). */
  onshoreTransfer: boolean("onshore_transfer").default(false).notNull(),
  acceptedAt: date("accepted_at"),
  assignedTo: text("assigned_to"),
  notes: text("notes"),
  /** Course or provider change: the application this one replaced, and why. */
  transferredFromId: text("transferred_from_id"),
  transferReason: text("transfer_reason"),
  /** Release from the current provider (ESOS Standard 7, first 6 months): not_needed | needed | requested | granted | refused */
  releaseLetter: text("release_letter").default("not_needed").notNull(),
  coeNumber: text("coe_number"),
  coeIssuedAt: date("coe_issued_at"),
  courseStart: date("course_start"),
  courseEnd: date("course_end"),
  /** Australian Qualifications Framework level, 1–10 (ELICOS and foundation are 0). */
  aqfLevel: integer("aqf_level"),
  ...stamps,
});

/** Work moved between staff: permanent handovers, temporary cover (with a return date) and swaps. */
export const handovers = pgTable(
  "handovers",
  {
    id: id(),
    agencyId: agency(),
    mode: text("mode").notNull(), // permanent | cover | swap
    fromUserId: text("from_user_id").notNull(),
    toUserId: text("to_user_id"), // null when items go to several people
    reason: text("reason"),
    note: text("note"),
    returnOn: date("return_on"),
    status: text("status").default("active").notNull(), // active | returned | done
    items: jsonb("items").$type<HandoverItem[]>().default([]).notNull(),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("handovers_agency_idx").on(t.agencyId, t.status)],
);

export type HandoverItem = { entity: "matter" | "client" | "task" | "appointment" | "application"; id: string; field: "assignedTo" | "supervisorId" | "staffId"; from: string | null; to: string | null; label: string };

export type MailAttachment = { name: string; size: number; type: string; key: string };

/** A sending and receiving address: one per staff member, plus shared ones (info@…). */
export const mailboxes = pgTable("mailboxes", {
  id: id(),
  agencyId: agency(),
  address: text("address").notNull().unique(),
  name: text("name").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  kind: text("kind").default("personal").notNull(), // personal | shared
  signature: text("signature"),
  ...stamps,
});

/** A private upload link a client uses to send documents for a matter. */
export const portalLinks = pgTable("portal_links", {
  id: id(),
  agencyId: agency(),
  token: text("token").notNull().unique(),
  matterId: text("matter_id")
    .notNull()
    .references(() => matters.id, { onDelete: "cascade" }),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  note: text("note"),
  /** The checklist items requested in this link; null means every outstanding item. */
  itemIds: text("item_ids").array(),
  dueAt: date("due_at"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdBy: text("created_by"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  ...stamps,
});

export const templates = pgTable("templates", {
  id: id(),
  agencyId: agency(),
  kind: text("kind").notNull(), // email, letter, checklist, agreement
  name: text("name").notNull(),
  subject: text("subject"),
  body: text("body").notNull(),
  ...stamps,
});

export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    agencyId: agency(),
    actorId: text("actor_id"),
    actorName: text("actor_name"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    detail: jsonb("detail"),
    createdAt: stamps.createdAt,
  },
  (t) => [index("audit_agency_idx").on(t.agencyId, t.createdAt)],
);

export const clientsRelations = relations(clients, ({ many, one }) => ({
  matters: many(matters),
  dependants: many(dependants),
  documents: many(documents),
  assignee: one(user, { fields: [clients.assignedTo], references: [user.id] }),
}));
export const mattersRelations = relations(matters, ({ one, many }) => ({
  client: one(clients, { fields: [matters.clientId], references: [clients.id] }),
  employer: one(employers, { fields: [matters.employerId], references: [employers.id] }),
  checklist: many(checklistItems),
  assignee: one(user, { fields: [matters.assignedTo], references: [user.id] }),
}));
export const checklistRelations = relations(checklistItems, ({ one }) => ({
  matter: one(matters, { fields: [checklistItems.matterId], references: [matters.id] }),
}));

/** Suggested study and visa pathways for a client, generated by Claude (or the rules engine) and cached. */
export const aiPathways = pgTable("ai_pathways", {
  id: id(),
  agencyId: agency(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id, { onDelete: "cascade" }),
  /** agency_pattern: learned from this agency's similar students; fastest_pr: general fastest route. */
  mode: text("mode").notNull(),
  source: text("source").notNull(), // claude | rules
  model: text("model"),
  payload: jsonb("payload").notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** What the AI understood from an email: category, facts and one suggested action for staff to apply. */
export const mailInsights = pgTable(
  "mail_insights",
  {
    id: id(),
    agencyId: agency(),
    messageId: text("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    clientId: text("client_id").references(() => clients.id, { onDelete: "set null" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    /** grant | refusal | rfi | acknowledgement | health | biometrics | bridging | skills_outcome | invitation | nomination | offer | coe | payment | client_message | other | unrelated */
    category: text("category").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    facts: jsonb("facts").$type<Record<string, string | null>>().default({}).notNull(),
    /** set_stage:decision | set_rfi_due | create_task | none */
    action: text("action").notNull().default("none"),
    actionLabel: text("action_label"),
    actionDue: date("action_due"),
    actionStatus: text("action_status").notNull().default("open"), // open | applied | dismissed
    actionBy: text("action_by"),
    confidence: text("confidence").notNull().default("medium"),
    matchedBy: text("matched_by"), // trn | reference | email | passport | name | ai
    model: text("model"),
    ...stamps,
  },
  (t) => [index("mail_insights_client_idx").on(t.agencyId, t.clientId, t.createdAt)],
);

/** A staff member's own Gmail or Outlook account, connected with OAuth. Tokens are encrypted at rest. */
export const mailConnections = pgTable("mail_connections", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(), // google | microsoft
  email: text("email").notNull(),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  status: text("status").notNull().default("active"), // active | error
  lastError: text("last_error"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  ...stamps,
});

/** OAuth clients this deployment registered with a provider (dynamic client registration). */
export const oauthClients = pgTable(
  "oauth_clients",
  {
    provider: text("provider").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    clientId: text("client_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.provider, t.redirectUri] })],
);

export type MailUsage = {
  daily: { used: number; limit: number | null; resetsAt: string | null };
  monthly: { used: number; limit: number | null; resetsAt: string | null };
};

/** Agency-wide app connections authorized with OAuth (one per kind). Tokens are encrypted at rest. */
export const connectors = pgTable(
  "connectors",
  {
    id: id(),
    agencyId: agency(),
    kind: text("kind").notNull(), // resend | fwc | abr | employment_hero | xero
    status: text("status").notNull().default("active"), // active | error
    account: text("account"),
    scope: text("scope"),
    accessToken: text("access_token").notNull(),
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    connectedBy: text("connected_by"),
    connectedByName: text("connected_by_name"),
    webhookId: text("webhook_id"),
    webhookSecret: text("webhook_secret"),
    usage: jsonb("usage").$type<MailUsage>(),
    usageCheckedAt: timestamp("usage_checked_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...stamps,
  },
  (t) => [uniqueIndex("connectors_agency_kind").on(t.agencyId, t.kind)],
);

/** "Lodgely for ImmiAccount" browser extension sign-ins: one per browser, stored as a hash, revocable. */
export const extensionTokens = pgTable(
  "extension_tokens",
  {
    id: id(),
    agencyId: agency(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("extension_tokens_hash").on(t.tokenHash), index("extension_tokens_user").on(t.agencyId, t.userId)],
);

export type ReviewBasis = { decision: string; notifiedOn: string; method: string; documentDate: string | null; deemedOn: string; days: number; unit: "days" | "working"; explanation: string[]; override?: boolean };

/** Supervisor sign-off before lodging: who asked, who reviewed, what they saw (fingerprint), and the outcome. */
export const lodgementSignoffs = pgTable(
  "lodgement_signoffs",
  {
    id: id(),
    agencyId: agency(),
    matterId: text("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    requestedBy: text("requested_by").notNull(),
    requestedByName: text("requested_by_name").notNull(),
    reviewerId: text("reviewer_id").notNull(),
    reviewerName: text("reviewer_name").notNull(),
    status: text("status").notNull().default("pending"), // pending | approved | changes | withdrawn
    requestNote: text("request_note"),
    decisionNote: text("decision_note"),
    /** Hash of the data sheet and document list when requested / approved, to spot later changes. */
    fingerprint: text("fingerprint"),
    blockingAtRequest: integer("blocking_at_request"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("signoffs_matter_idx").on(t.agencyId, t.matterId), index("signoffs_reviewer_idx").on(t.agencyId, t.reviewerId, t.status)],
);

export type AgreementContent = {
  title: string;
  agency: { name: string; legalName: string | null; abn: string | null; marn: string | null; agent: string; agentMarn: string | null; email: string | null; phone: string | null; address: string | null };
  client: { name: string; email: string | null; dateOfBirth: string | null; address: string | null };
  matter: { reference: string; visa: string; stream: string | null };
  fees: { label: string; amount: number; note?: string }[];
  sections: { heading: string; body: string[] }[];
  preparedOn: string;
};

/** A service agreement sent to a client to e-sign in the portal. The content is frozen when sent. */
export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: id(),
    agencyId: agency(),
    matterId: text("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("sent"), // sent | viewed | signed | void
    content: jsonb("content").$type<AgreementContent>().notNull(),
    contentHash: text("content_hash").notNull(),
    sentBy: text("sent_by"),
    sentByName: text("sent_by_name"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signerName: text("signer_name"),
    signerEmail: text("signer_email"),
    signerIp: text("signer_ip"),
    signerAgent: text("signer_agent"),
    signature: text("signature"), // PNG data URL of the drawn signature
    guideAcknowledged: boolean("guide_acknowledged").default(false).notNull(),
    documentId: text("document_id"),
    ...stamps,
  },
  (t) => [index("agreements_matter_idx").on(t.agencyId, t.matterId), index("agreements_client_idx").on(t.clientId, t.status)],
);

/** An agency's card payment account (Stripe, Square, PayPal, Airwallex) or Zeller. Secrets encrypted. */
export const paymentProviders = pgTable(
  "payment_providers",
  {
    id: id(),
    agencyId: agency(),
    provider: text("provider").notNull(), // stripe | square | paypal | airwallex | zeller
    enabled: boolean("enabled").default(true).notNull(),
    status: text("status").notNull().default("active"), // active | error
    mode: text("mode").notNull().default("live"), // live | test
    account: text("account"),
    secrets: text("secrets"), // encrypted JSON
    settings: jsonb("settings").$type<Record<string, string>>(),
    connectedBy: text("connected_by"),
    lastError: text("last_error"),
    ...stamps,
  },
  (t) => [uniqueIndex("payment_providers_agency_provider").on(t.agencyId, t.provider)],
);

/** A client's attempt to pay an invoice in the portal (card checkout, or a transfer/Zeller with proof). */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: id(),
    agencyId: agency(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // stripe | square | paypal | airwallex | zeller | bank
    amount: numeric("amount").notNull(),
    status: text("status").notNull().default("pending"), // pending | paid | review | rejected | cancelled | failed
    externalId: text("external_id"),
    checkoutUrl: text("checkout_url"),
    proofKey: text("proof_key"),
    proofName: text("proof_name"),
    clientNote: text("client_note"),
    reviewedBy: text("reviewed_by"),
    reviewedByName: text("reviewed_by_name"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    ledgerId: text("ledger_id"),
    ...stamps,
  },
  (t) => [index("payment_attempts_invoice_idx").on(t.agencyId, t.invoiceId), index("payment_attempts_status_idx").on(t.agencyId, t.status)],
);

/** A monthly trust account reconciliation: bank statement vs trust cashbook vs client ledgers. */
export const trustReconciliations = pgTable("trust_reconciliations", {
  id: id(),
  agencyId: agency(),
  periodEnd: date("period_end").notNull(),
  bankBalance: numeric("bank_balance").notNull(),
  cashbookBalance: numeric("cashbook_balance").notNull(),
  clientTotal: numeric("client_total").notNull(),
  difference: numeric("difference").notNull(),
  notes: text("notes"),
  reconciledBy: text("reconciled_by"),
  reconciledByName: text("reconciled_by_name"),
  ...stamps,
});

export type DocCheck = {
  documentType: string;
  matchesItem: "yes" | "no" | "unsure";
  readable: boolean;
  nameOnDocument: string | null;
  nameMatches: "yes" | "no" | "unsure" | "n/a";
  dateOfBirth: string | null;
  documentNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  language: string;
  needsTranslation: boolean;
  certifiedCopy: "yes" | "no" | "unsure";
  summary: string;
  issues: { level: "block" | "warn" | "info"; text: string }[];
  verdict: "looks_good" | "needs_attention" | "wrong_document";
};

/** AI read of an uploaded document, compared with its checklist item and the client's record. */
export const documentChecks = pgTable(
  "document_checks",
  {
    id: id(),
    agencyId: agency(),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    matterId: text("matter_id"),
    status: text("status").notNull().default("done"), // done | failed | unsupported
    verdict: text("verdict"),
    result: jsonb("result").$type<DocCheck>(),
    error: text("error"),
    model: text("model"),
    checkedBy: text("checked_by"),
    ...stamps,
  },
  (t) => [uniqueIndex("document_checks_doc").on(t.documentId), index("document_checks_matter").on(t.agencyId, t.matterId)],
);

/** AI-drafted documents for a matter (cover letters, statements, responses), edited by staff. */
export const drafts = pgTable(
  "drafts",
  {
    id: id(),
    agencyId: agency(),
    matterId: text("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    checks: jsonb("checks").$type<string[]>(),
    model: text("model"),
    createdBy: text("created_by"),
    createdByName: text("created_by_name"),
    ...stamps,
  },
  (t) => [index("drafts_matter_idx").on(t.agencyId, t.matterId)],
);

/** Pairs of clients staff confirmed are different people, so they stop showing as duplicates. */
export const duplicateDismissals = pgTable(
  "duplicate_dismissals",
  {
    agencyId: agency(),
    a: text("a").notNull(),
    b: text("b").notNull(),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.agencyId, t.a, t.b] })],
);

/** A field the signer completes, placed on a PDF page. Coordinates are fractions of the page (0–1, top-left origin). */
export type SignField = {
  id: string;
  page: number; // 1-based
  x: number;
  y: number;
  w: number;
  h: number;
  type: "signature" | "initials" | "date" | "name" | "text" | "checkbox";
  label: string;
  required: boolean;
  source?: "template" | "detected" | "ai" | "manual";
  /** Who completes it: a signer id from the request's signers ("client" when absent). */
  signer?: string;
};

/** Someone who signs a request: the client (in the portal), another person (by emailed link) or the agent (countersign). */
export type SignSigner = {
  id: string; // "client", "agent", or "s2", "s3"…
  role: "client" | "other" | "agent";
  label: string; // "Client", "Sponsor", "Second parent", "Registered migration agent"
  name: string;
  email: string | null;
  userId?: string | null; // agent
  tokenHash?: string | null; // other: sha256 of the link token
  status: "pending" | "viewed" | "signed";
  viewedAt?: string | null;
  signedAt?: string | null;
  signedName?: string | null;
  ip?: string | null;
  agent?: string | null;
};
export type SignValue = { id: string; value: string }; // signature/initials: PNG data URL; checkbox: "yes" | ""
export type SignEvent = { at: string; kind: "created" | "sent" | "viewed" | "signed" | "void" | "reminded"; by: string | null; detail?: string };

/**
 * A document sent to a client to sign: a consent form made from a template, an uploaded PDF, or a
 * file from the client's folder. The source PDF is frozen (hashed) when it's sent.
 */
export const signRequests = pgTable(
  "sign_requests",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    message: text("message"),
    origin: text("origin").notNull(), // template | upload | file
    templateKey: text("template_key"),
    sourceDocumentId: text("source_document_id"),
    sourceKey: text("source_key").notNull(), // R2 key of the PDF the client signs
    sourceHash: text("source_hash").notNull(),
    pages: integer("pages").notNull().default(1),
    fields: jsonb("fields").$type<SignField[]>().notNull(),
    status: text("status").notNull().default("sent"), // sent | viewed | signed | void
    events: jsonb("events").$type<SignEvent[]>().notNull().default([]),
    sentBy: text("sent_by"),
    sentByName: text("sent_by_name"),
    dueAt: date("due_at"),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signerName: text("signer_name"),
    signerEmail: text("signer_email"),
    signerIp: text("signer_ip"),
    signerAgent: text("signer_agent"),
    values: jsonb("values").$type<SignValue[]>(),
    signers: jsonb("signers").$type<SignSigner[]>().notNull().default([]),
    bundle: jsonb("bundle").$type<string[]>(), // template keys when several forms go as one pack
    invoiceId: text("invoice_id"), // pay straight after signing
    documentId: text("document_id"), // the signed PDF in the client's documents
    ...stamps,
  },
  (t) => [index("sign_requests_agency_idx").on(t.agencyId, t.status), index("sign_requests_client_idx").on(t.clientId, t.status), index("sign_requests_matter_idx").on(t.matterId)],
);

export type CaseFlag = { level: "critical" | "warning" | "info"; area: string; title: string; detail: string; fix?: string; document?: string | null; source?: "rule" | "ai" };
export type CaseReviewResult = {
  profileScore: number; // 0–100
  documentScore: number; // 0–100
  readiness: "not_ready" | "needs_work" | "nearly_ready" | "ready";
  summary: string;
  strengths: string[];
  flags: CaseFlag[];
  missing: string[];
  nextSteps: string[];
  documentsRead: number;
  documentsChecked: { name: string; verdict: string | null }[];
  /** Critical flags that weren't in the previous review (overnight reviews). */
  newCritical?: string[];
};

/** AI review of a client's profile and documents (for a matter, or the client overall). Latest row per scope wins. */
export const caseReviews = pgTable(
  "case_reviews",
  {
    id: id(),
    agencyId: agency(),
    clientId: text("client_id")
      .notNull()
      .references(() => clients.id, { onDelete: "cascade" }),
    matterId: text("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // running | done | failed
    stage: text("stage"), // what it's reading right now, shown while running
    result: jsonb("result").$type<CaseReviewResult>(),
    error: text("error"),
    model: text("model"),
    requestedBy: text("requested_by"),
    requestedByName: text("requested_by_name"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ...stamps,
  },
  (t) => [index("case_reviews_client_idx").on(t.agencyId, t.clientId, t.createdAt), index("case_reviews_matter_idx").on(t.matterId, t.createdAt)],
);

/** An agency's own wording for a consent template (key of a built-in one), or its own extra template. */
export const consentTemplateOverrides = pgTable(
  "consent_template_overrides",
  {
    id: id(),
    agencyId: agency(),
    key: text("key").notNull(),
    custom: boolean("custom").default(false).notNull(),
    disabled: boolean("disabled").default(false).notNull(),
    title: text("title").notNull(),
    group: text("group").notNull(),
    summary: text("summary").notNull().default(""),
    body: text("body").notNull(),
    checkboxes: jsonb("checkboxes").$type<{ id: string; label: string; required?: boolean }[]>().notNull().default([]),
    textField: jsonb("text_field").$type<{ id: string; label: string; required?: boolean } | null>(),
    initials: boolean("initials").default(false).notNull(),
    countersign: boolean("countersign").default(false).notNull(),
    updatedBy: text("updated_by"),
    ...stamps,
  },
  (t) => [uniqueIndex("consent_template_overrides_key").on(t.agencyId, t.key)],
);

/** Home Affairs' published processing times (50% and 90%), copied daily from Immi Insight. */
export const processingTimes = pgTable(
  "processing_times",
  {
    subclass: text("subclass").notNull(),
    stream: text("stream").notNull().default(""),
    visaName: text("visa_name"),
    p50: text("p50"),
    p90: text("p90"),
    p50Days: integer("p50_days"),
    p90Days: integer("p90_days"),
    asAt: date("as_at"),
    sourceUrl: text("source_url"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.subclass, t.stream] })],
);
