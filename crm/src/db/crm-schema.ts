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
  ...stamps,
});

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
    ...stamps,
  },
  (t) => [index("clients_agency_idx").on(t.agencyId, t.stage), index("clients_visa_expiry_idx").on(t.agencyId, t.visaExpiry)],
);

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
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const staffProfiles = pgTable("staff_profiles", {
  id: id(),
  agencyId: agency(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** principal | migration_agent | education_agent | consultant | reception | accounts | hr */
  position: text("position").default("consultant").notNull(),
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
  lines: jsonb("lines").$type<{ label: string; hours?: number; rate?: number; amount: number }[]>().default([]).notNull(),
  ...stamps,
});

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
  ...stamps,
});

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
  ...stamps,
});

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
    kind: text("kind").notNull(), // resend
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
