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
  text,
  timestamp,
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
  nextInvoiceNumber: integer("next_invoice_number").default(1001).notNull(),
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
    sentAt: timestamp("sent_at", { withTimezone: true }).defaultNow().notNull(),
    ...stamps,
  },
  (t) => [index("messages_mailbox_idx").on(t.agencyId, t.mailbox, t.folder, t.sentAt)],
);

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
