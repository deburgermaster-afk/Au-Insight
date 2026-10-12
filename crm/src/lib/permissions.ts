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

export function capsFor(role: Role, position: Position): Cap[] {
  const caps = new Set(base[position] ?? base.consultant);
  if (role === "owner" || role === "admin") for (const c of ["team", "payroll", "billing", "reports", "clients", "mail", "files"] as Cap[]) caps.add(c);
  if (role === "supervisor") caps.add("reports");
  return [...caps];
}

export const positionLabel = (p: string) => positions.find((x) => x.key === p)?.short ?? p;

/** A MARN only counts while its registration is current. */
export const marnCurrent = (marn: string | null | undefined, expiry: string | null | undefined) =>
  Boolean(marn && (!expiry || expiry >= new Date().toISOString().slice(0, 10)));
