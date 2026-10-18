// What each person can do = their membership level (owner … staff) combined with their position
// in the agency. Positions mirror how migration practices are staffed; only registered migration
// agents (with a current MARN) may give immigration assistance or lodge, as the Migration Act
// requires, so those actions check the "immigration" capability.

export type Role = "owner" | "admin" | "supervisor" | "agent" | "staff" | "client";
export type Position = "principal" | "migration_agent" | "education_agent" | "consultant" | "reception" | "accounts" | "hr";
export type Cap = "immigration" | "education" | "billing" | "payroll" | "team" | "reports" | "clients" | "mail" | "files";

export const positions: { key: Position; label: string; short: string; about: string }[] = [
  { key: "principal", label: "Principal migration agent", short: "Principal", about: "Runs the practice. Everything, including payroll and compliance." },
  { key: "migration_agent", label: "Registered migration agent", short: "MARA agent", about: "Holds a MARN. Advises, prepares and lodges applications, supervises consultants." },
  { key: "education_agent", label: "Education agent", short: "Education agent", about: "Course and provider advice, student applications, offers, CoEs and commissions. No immigration advice." },
  { key: "consultant", label: "Migration consultant", short: "Consultant", about: "Intake, document collection and case preparation under a registered agent." },
  { key: "reception", label: "Reception / admin", short: "Reception", about: "Enquiries, bookings, mail and documents." },
  { key: "accounts", label: "Accounts", short: "Accounts", about: "Invoices, payments, trust account and reports." },
  { key: "hr", label: "HR & payroll", short: "HR", about: "Staff records, leave, timesheets and pay runs." },
];

const base: Record<Position, Cap[]> = {
  principal: ["immigration", "education", "billing", "payroll", "team", "reports", "clients", "mail", "files"],
  migration_agent: ["immigration", "education", "billing", "reports", "clients", "mail", "files"],
  education_agent: ["education", "clients", "mail", "files"],
  consultant: ["clients", "mail", "files", "education"],
  reception: ["clients", "mail", "files"],
  accounts: ["billing", "reports", "clients", "mail", "files"],
  hr: ["payroll", "team", "mail", "files"],
};

/** Each feature an agency can switch on or off for a role, and the pages it opens. */
export const features: { cap: Cap; label: string; about: string; pages: string[] }[] = [
  { cap: "clients", label: "Clients & cases", about: "Client records, matters, employers, e-sign and the case pipeline.", pages: ["Clients", "Matters", "Employers", "E-sign"] },
  { cap: "immigration", label: "Immigration work", about: "Advice, lodging and immigration fields. Also needs a current MARN, as the Migration Act requires.", pages: ["Lodge", "Visa decisions", "Case review"] },
  { cap: "education", label: "Students & education", about: "Course advice, offers, CoEs, scholarships, tuition and commissions.", pages: ["Students"] },
  { cap: "billing", label: "Billing & trust", about: "Invoices, payments, the client trust account and receipts.", pages: ["Billing & trust"] },
  { cap: "reports", label: "Reports", about: "Practice analytics and exports.", pages: ["Reports"] },
  { cap: "mail", label: "Inbox", about: "Shared and personal mailboxes, sending and the AI mail assistant.", pages: ["Inbox"] },
  { cap: "files", label: "Documents & files", about: "Client documents, uploads and the agency drive.", pages: ["Documents", "Files"] },
  { cap: "payroll", label: "HR & payroll", about: "Staff records, leave, timesheets and pay runs.", pages: ["HR & payroll"] },
  { cap: "team", label: "Team & admin", about: "Invite staff, change access, handovers and the audit log.", pages: ["Team", "Audit log"] },
];
export const allCaps = features.map((f) => f.cap);
export const defaultCaps = (position: Position): Cap[] => [...(base[position] ?? base.consultant)];

/**
 * A person's features: their custom role's when they have one, otherwise their position's; owners
 * always have everything. (Immigration is then limited to people with a current MARN.)
 */
export function capsFor(role: Role, position: Position, custom?: string[] | null): Cap[] {
  if (custom && role !== "owner") {
    const caps = custom.filter((c): c is Cap => allCaps.includes(c as Cap));
    // Admins keep team access so a role change can never lock the agency out of its own settings.
    return role === "admin" && !caps.includes("team") ? [...caps, "team"] : caps;
  }
  const caps = new Set(base[position] ?? base.consultant);
  if (role === "owner" || role === "admin") for (const c of ["team", "payroll", "billing", "reports", "clients", "mail", "files"] as Cap[]) caps.add(c);
  if (role === "supervisor") caps.add("reports");
  return [...caps];
}

export const positionLabel = (p: string) => positions.find((x) => x.key === p)?.short ?? p;

/** A MARN only counts while its registration is current. */
export const marnCurrent = (marn: string | null | undefined, expiry: string | null | undefined) =>
  Boolean(marn && (!expiry || expiry >= new Date().toISOString().slice(0, 10)));
