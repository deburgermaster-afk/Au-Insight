import { Blocks, Bot, Building2, CreditCard, Mail, Palette, ScrollText, Users, Wallet } from "lucide-react";

export type SettingsTab = { key: string; label: string };
export type SettingsSection = { slug: string; title: string; short: string; blurb: string; icon: typeof Mail; tone: string; tabs?: SettingsTab[]; href?: string };

/** The settings hub: each card opens its own page, with tabs in the page header where needed. */
export const settingsSections: SettingsSection[] = [
  { slug: "agency", short: "Details, invoicing and trust account", title: "Agency profile", blurb: "Legal name, ABN, principal's MARN, contact details, invoicing and the client trust account.", icon: Building2, tone: "from-sky-500/20 to-sky-500/5 text-sky-500", tabs: [{ key: "details", label: "Details" }, { key: "invoicing", label: "Invoicing & trust account" }, { key: "agreement", label: "Agreement terms" }, { key: "practice", label: "Practice rules" }] },
  { slug: "email", short: "Addresses, domain and sending limits", title: "Email & domain", blurb: "Your agency's addresses, your own domain, and how much of your sending limit is used.", icon: Mail, tone: "from-orange-500/20 to-orange-500/5 text-orange-500", tabs: [{ key: "overview", label: "Overview" }, { key: "domain", label: "Domain" }, { key: "usage", label: "Usage & limits" }] },
  { slug: "connectors", short: "Resend, Gmail, Outlook and more", title: "Connectors", blurb: "Connect Resend, Gmail and Outlook with one click. No keys to copy.", icon: Blocks, tone: "from-violet-500/20 to-violet-500/5 text-violet-500", tabs: [{ key: "all", label: "All" }, { key: "connected", label: "Connected" }] },
  { slug: "payments", short: "Card payments, bank transfer, trust", title: "Payments", blurb: "How clients pay invoices in the portal: Stripe, Square, PayPal, Airwallex, Zeller and bank transfer.", icon: Wallet, tone: "from-lime-500/20 to-lime-500/5 text-lime-500" },
  { slug: "ai", short: "Mail assistant and pathways", title: "AI assistant", blurb: "The mail assistant that understands Home Affairs and assessing-body emails, and suggested pathways.", icon: Bot, tone: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500", tabs: [{ key: "mail", label: "Mail assistant" }, { key: "pathways", label: "Pathways" }] },
  { slug: "plans", short: "Your plan and upgrades", title: "Plan & billing", blurb: "Your plan, what's included, and upgrades.", icon: CreditCard, tone: "from-emerald-500/20 to-emerald-500/5 text-emerald-500", tabs: [{ key: "plans", label: "Plans" }, { key: "compare", label: "Compare features" }] },
  { slug: "appearance", short: "Light, dark or system", title: "Appearance", blurb: "Light, dark or match your device.", icon: Palette, tone: "from-amber-500/20 to-amber-500/5 text-amber-500" },
  { slug: "team", short: "Staff, positions and permissions", title: "Team & roles", blurb: "Invite staff, set positions and what each role can see.", icon: Users, tone: "from-teal-500/20 to-teal-500/5 text-teal-500", href: "/app/team" },
  { slug: "audit", short: "Every change, by whom and when", title: "Audit log", blurb: "Every change made in your agency, by whom and when.", icon: ScrollText, tone: "from-zinc-500/20 to-zinc-500/5 text-zinc-400", href: "/app/audit" },
];

export const sectionBySlug = (slug: string) => settingsSections.find((s) => s.slug === slug && !s.href);
export const tabOf = (section: SettingsSection, tab?: string | string[]) => (section.tabs?.find((t) => t.key === tab) ?? section.tabs?.[0])?.key ?? "";
