// What can be edited on each kind of record, in one place. The edit dialog draws its form from
// these specs, and the save action only accepts these fields, converts them by type, checks the
// permission, and writes a before → after audit entry.

export type FieldType = "text" | "textarea" | "date" | "datetime" | "number" | "money" | "boolean" | "select" | "user" | "tags" | "employer" | "institution" | "list";

export type FieldSpec = {
  key: string;
  label: string;
  type: FieldType;
  options?: { value: string; label: string }[];
  /** For type "list": which workflow pick list feeds the options. */
  list?: "sources" | "tags" | "documentCategories" | "outcomes";
  required?: boolean;
  /** Needs this capability to change (e.g. lodgement details need a registered agent). */
  cap?: "immigration" | "education" | "billing" | "payroll" | "team";
  hint?: string;
  group?: string;
  wide?: boolean;
  /** A date picker over a timestamp column (stored as midnight UTC, like new tasks). */
  stamp?: boolean;
};

export type EntityKey = "client" | "matter" | "task" | "appointment" | "employer" | "institution" | "application" | "dependant" | "checklist" | "document" | "nomination";

export type EntitySpec = { label: string; cap?: FieldSpec["cap"]; fields: FieldSpec[] };

export const AQF: Record<number, string> = {
  1: "Certificate I",
  2: "Certificate II",
  3: "Certificate III",
  4: "Certificate IV",
  5: "Diploma",
  6: "Advanced Diploma / Associate Degree",
  7: "Bachelor",
  8: "Graduate Certificate / Diploma, Honours",
  9: "Master",
  10: "Doctorate",
};

import { LMT_STATUSES, NOMINATION_PROGRAMS, NOMINATION_STATUSES } from "@/lib/nominations";

const stages = ["lead", "prospect", "active", "on_hold", "past", "lost"].map((v) => ({ value: v, label: v.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) }));
const priorities = ["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v.replace(/^\w/, (c) => c.toUpperCase()) }));
const states = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"].map((v) => ({ value: v, label: v }));

export const SPECS: Record<EntityKey, EntitySpec> = {
  client: {
    label: "client",
    fields: [
      { key: "firstName", label: "First name", type: "text", required: true, group: "Identity" },
      { key: "lastName", label: "Family name", type: "text", required: true, group: "Identity" },
      { key: "dateOfBirth", label: "Date of birth", type: "date", group: "Identity" },
      { key: "gender", label: "Gender", type: "select", options: [{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "other", label: "Other" }], group: "Identity" },
      { key: "nationality", label: "Nationality", type: "text", group: "Identity" },
      { key: "countryOfBirth", label: "Country of birth", type: "text", group: "Identity" },
      { key: "passportNumber", label: "Passport number", type: "text", group: "Identity" },
      { key: "passportExpiry", label: "Passport expiry", type: "date", group: "Identity" },
      { key: "email", label: "Email", type: "text", group: "Contact" },
      { key: "phone", label: "Phone", type: "text", group: "Contact" },
      { key: "address", label: "Address", type: "text", group: "Contact", wide: true },
      { key: "city", label: "Suburb or city", type: "text", group: "Contact" },
      { key: "state", label: "State", type: "select", options: states, group: "Contact" },
      { key: "onshore", label: "In Australia", type: "boolean", group: "Visa" },
      { key: "currentVisa", label: "Current visa", type: "text", group: "Visa", hint: "Subclass, e.g. 500" },
      { key: "visaExpiry", label: "Visa expiry", type: "date", group: "Visa" },
      { key: "englishTest", label: "English test", type: "text", group: "Visa" },
      { key: "englishScore", label: "English score", type: "text", group: "Visa" },
      { key: "occupation", label: "Occupation", type: "text", group: "Visa" },
      { key: "anzsco", label: "ANZSCO", type: "text", group: "Visa" },
      { key: "stage", label: "Stage", type: "select", options: stages, group: "Practice" },
      { key: "assignedTo", label: "Case officer", type: "user", group: "Practice" },
      { key: "source", label: "Source", type: "list", list: "sources", group: "Practice" },
      { key: "tags", label: "Tags", type: "tags", list: "tags", group: "Practice", wide: true },
      { key: "notes", label: "Notes", type: "textarea", group: "Practice", wide: true },
    ],
  },
  matter: {
    label: "case",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, group: "Case", wide: true },
      { key: "stream", label: "Stream", type: "text", group: "Case" },
      { key: "priority", label: "Priority", type: "select", options: priorities, group: "Case" },
      { key: "employerId", label: "Sponsor", type: "employer", group: "Case" },
      { key: "dueAt", label: "Target lodgement", type: "date", group: "Case" },
      { key: "occupation", label: "Nominated occupation", type: "text", group: "Case" },
      { key: "anzsco", label: "ANZSCO", type: "text", group: "Case" },
      { key: "pointsClaimed", label: "Points claimed", type: "number", group: "Case" },
      { key: "feeProfessional", label: "Professional fee", type: "money", group: "Fees", cap: "billing" },
      { key: "feeGovernment", label: "Government charge", type: "money", group: "Fees", cap: "billing" },
      { key: "trn", label: "TRN", type: "text", group: "Lodgement", cap: "immigration" },
      { key: "lodgedAt", label: "Lodged", type: "date", group: "Lodgement", cap: "immigration" },
      { key: "rfiDueAt", label: "Request due", type: "date", group: "Lodgement", cap: "immigration" },
      { key: "decisionAt", label: "Decision", type: "date", group: "Lodgement", cap: "immigration" },
      { key: "outcome", label: "Outcome", type: "list", list: "outcomes", group: "Lodgement", cap: "immigration" },
      { key: "notes", label: "Notes", type: "textarea", group: "Notes", wide: true },
    ],
  },
  task: {
    label: "task",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, wide: true },
      { key: "description", label: "Details", type: "textarea", wide: true },
      { key: "dueAt", label: "Due", type: "date", stamp: true },
      { key: "priority", label: "Priority", type: "select", options: priorities },
      { key: "status", label: "Status", type: "select", options: ["todo", "doing", "waiting", "done"].map((v) => ({ value: v, label: { todo: "To do", doing: "Doing", waiting: "Waiting", done: "Done" }[v]! })) },
      { key: "assignedTo", label: "Assignee", type: "user" },
    ],
  },
  appointment: {
    label: "appointment",
    fields: [
      { key: "title", label: "Title", type: "text", required: true, wide: true },
      { key: "kind", label: "Type", type: "select", options: ["consultation", "follow-up", "document check", "interview"].map((v) => ({ value: v, label: v.replace(/^\w/, (c) => c.toUpperCase()) })) },
      { key: "staffId", label: "With", type: "user" },
      { key: "startsAt", label: "Starts", type: "datetime", required: true },
      { key: "endsAt", label: "Ends", type: "datetime", required: true },
      { key: "location", label: "Where", type: "text", hint: "Office, phone or video link" },
      { key: "fee", label: "Fee", type: "money", cap: "billing" },
      { key: "notes", label: "Notes", type: "textarea", wide: true },
    ],
  },
  employer: {
    label: "employer",
    fields: [
      { key: "name", label: "Business name", type: "text", required: true, wide: true },
      { key: "abn", label: "ABN", type: "text" },
      { key: "industry", label: "Industry", type: "text" },
      { key: "contactName", label: "Contact", type: "text" },
      { key: "contactEmail", label: "Contact email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "sbsApproved", label: "Approved sponsor", type: "boolean" },
      { key: "sbsExpiry", label: "Sponsorship expiry", type: "date" },
      { key: "annualTurnover", label: "Annual turnover", type: "money" },
    ],
  },
  nomination: {
    label: "nomination",
    fields: [
      { key: "positionTitle", label: "Position", type: "text", required: true, wide: true, group: "Position" },
      { key: "program", label: "Program", type: "select", required: true, group: "Position", options: NOMINATION_PROGRAMS.map((p) => ({ value: p.value, label: p.label })) },
      { key: "anzsco", label: "ANZSCO code", type: "text", group: "Position" },
      { key: "salary", label: "Annual base salary", type: "money", group: "Position", hint: "Check it against the current income threshold and market rate." },
      { key: "worksite", label: "Worksite", type: "text", group: "Position" },
      { key: "status", label: "Status", type: "select", required: true, group: "Progress", options: NOMINATION_STATUSES.map((p) => ({ value: p.value, label: p.label })) },
      { key: "trn", label: "TRN", type: "text", group: "Progress" },
      { key: "lodgedAt", label: "Lodged", type: "date", group: "Progress" },
      { key: "decidedAt", label: "Decided", type: "date", group: "Progress" },
      { key: "approvalExpires", label: "Lodge visa by", type: "date", group: "Progress", hint: "The last day the visa can be lodged against this approval." },
      { key: "lmt", label: "Labour market testing", type: "select", group: "Progress", options: LMT_STATUSES.map((p) => ({ value: p.value, label: p.label })) },
      { key: "assignedTo", label: "Case officer", type: "user", group: "Progress" },
      { key: "notes", label: "Notes", type: "textarea", wide: true, group: "Notes" },
    ],
  },
  institution: {
    label: "institution",
    cap: "education",
    fields: [
      { key: "name", label: "Name", type: "text", required: true, wide: true },
      { key: "cricos", label: "CRICOS provider code", type: "text" },
      { key: "state", label: "State", type: "select", options: states },
      { key: "contactName", label: "Contact", type: "text" },
      { key: "contactEmail", label: "Contact email", type: "text" },
      { key: "commissionRate", label: "Commission %", type: "number" },
      { key: "agreementExpiry", label: "Agency agreement expires", type: "date" },
    ],
  },
  application: {
    label: "application",
    cap: "education",
    fields: [
      { key: "course", label: "Course", type: "text", required: true, wide: true, group: "Course" },
      { key: "courseCode", label: "CRICOS course code", type: "text", group: "Course" },
      { key: "aqfLevel", label: "AQF level", type: "select", group: "Course", options: [{ value: "0", label: "ELICOS / foundation" }, ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `${n} · ${AQF[n]}` }))] },
      { key: "institutionId", label: "Provider", type: "institution", group: "Course" },
      { key: "intake", label: "Intake", type: "text", group: "Course" },
      { key: "courseStart", label: "Course start", type: "date", group: "Course" },
      { key: "courseEnd", label: "Course end", type: "date", group: "Course" },
      { key: "coeNumber", label: "CoE number", type: "text", group: "Enrolment" },
      { key: "coeIssuedAt", label: "CoE issued", type: "date", group: "Enrolment" },
      { key: "tuitionFee", label: "Tuition fee", type: "money", group: "Money" },
      { key: "commissionRate", label: "Commission %", type: "number", group: "Money" },
      { key: "onshoreTransfer", label: "Onshore transfer", type: "boolean", group: "Money", hint: "Already studying in Australia" },
      { key: "assignedTo", label: "Education agent", type: "user", group: "Money" },
      { key: "notes", label: "Notes", type: "textarea", wide: true, group: "Notes" },
    ],
  },
  dependant: {
    label: "family member",
    fields: [
      { key: "fullName", label: "Full name", type: "text", required: true },
      { key: "relationship", label: "Relationship", type: "select", required: true, options: ["partner", "child", "parent", "sibling", "other"].map((v) => ({ value: v, label: v.replace(/^\w/, (c) => c.toUpperCase()) })) },
      { key: "dateOfBirth", label: "Date of birth", type: "date" },
      { key: "passportNumber", label: "Passport number", type: "text" },
    ],
  },
  checklist: {
    label: "checklist item",
    fields: [
      { key: "label", label: "Document", type: "text", required: true, wide: true },
      { key: "category", label: "Category", type: "list", list: "documentCategories" },
      { key: "required", label: "Required", type: "boolean" },
      { key: "note", label: "Note for the client", type: "textarea", wide: true },
    ],
  },
  document: {
    label: "document",
    fields: [
      { key: "name", label: "File name", type: "text", required: true, wide: true },
      { key: "category", label: "Category", type: "list", list: "documentCategories" },
      { key: "expiresAt", label: "Expires", type: "date" },
      { key: "certified", label: "Certified copy", type: "boolean" },
      { key: "translated", label: "Translated", type: "boolean" },
    ],
  },
};

/** Plain JSON for a client component: dates become ISO strings. */
export const plainValues = (row: object): Record<string, string | number | boolean | string[] | null> => JSON.parse(JSON.stringify(row));
