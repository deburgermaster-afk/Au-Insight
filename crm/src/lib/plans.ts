// Plans shown on the landing page and in Settings → Plans. Prices are placeholders until billing
// is wired up; every plan is free during the beta.

export type Plan = { key: string; name: string; blurb: string; price: string; unit: string; highlight?: boolean; badge?: string; perks: string[] };

export const plans: Plan[] = [
  { key: "solo", name: "Solo", blurb: "One registered agent working alone.", price: "$0", unit: "during beta", perks: ["1 agent", "Unlimited clients", "Visa checklists"] },
  { key: "practice", name: "Practice", blurb: "Small agencies with a front desk.", price: "$29", unit: "per user per month", highlight: true, perks: ["Unlimited staff", "Mailbox per employee", "Trust accounting"] },
  { key: "firm", name: "Firm", blurb: "Several agents and supervisors.", price: "$49", unit: "per user per month", badge: "Most control", perks: ["Supervisor review", "Client portal", "Advanced reports"] },
  { key: "enterprise", name: "Enterprise", blurb: "Multi-office and franchise groups.", price: "Custom", unit: "annual contract", perks: ["SSO and audit export", "Data residency", "Dedicated migration"] },
];

type Cell = string | boolean;
export const compare: { feature: string; values: [Cell, Cell, Cell, Cell] }[] = [
  { feature: "Users", values: ["1 user", "Unlimited", "Unlimited", "Unlimited"] },
  { feature: "Clients and matters", values: ["Unlimited", "Unlimited", "Unlimited", "Unlimited"] },
  { feature: "Visa checklists", values: [true, true, true, true] },
  { feature: "Mailboxes", values: ["Shared only", "Per employee", "Per employee", "Per employee"] },
  { feature: "Trust accounting", values: [false, true, true, true] },
  { feature: "Roles and hierarchy", values: [false, "Owner to staff", "Full hierarchy", "Custom roles"] },
  { feature: "Client portal", values: [false, false, true, true] },
  { feature: "Reports", values: ["Basic", "Standard", "Advanced", "Advanced"] },
  { feature: "Single sign-on", values: [false, false, false, true] },
];
