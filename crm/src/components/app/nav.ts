import {
  BarChart3,
  BookOpenCheck,
  Briefcase,
  Building2,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FileStack,
  Inbox,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  SearchCheck,
  Settings,
  Sparkles,
  UsersRound,
  UserRoundCog,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon; keywords?: string };

export const nav: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/app", icon: LayoutDashboard },
      { title: "Inbox", href: "/app/inbox", icon: Inbox, keywords: "mail email messages" },
      { title: "Calendar", href: "/app/calendar", icon: CalendarDays, keywords: "appointments bookings" },
      { title: "Tasks", href: "/app/tasks", icon: ClipboardCheck, keywords: "todo" },
    ],
  },
  {
    label: "Practice",
    items: [
      { title: "Clients", href: "/app/clients", icon: UsersRound, keywords: "contacts leads people" },
      { title: "Matters", href: "/app/matters", icon: Briefcase, keywords: "cases applications pipeline kanban" },
      { title: "Employers", href: "/app/employers", icon: Building2, keywords: "sponsors business 482 186" },
      { title: "Documents", href: "/app/documents", icon: FileStack, keywords: "files uploads" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { title: "Occupations", href: "/app/occupations", icon: SearchCheck, keywords: "anzsco eoi skillselect invitations backlog points" },
      { title: "Visa library", href: "/app/visas", icon: BookOpenCheck, keywords: "subclass checklist requirements" },
      { title: "Features", href: "/app/features", icon: Sparkles, keywords: "roadmap" },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Billing & trust", href: "/app/billing", icon: CircleDollarSign, keywords: "invoices payments money ledger" },
      { title: "Reports", href: "/app/reports", icon: BarChart3, keywords: "analytics charts" },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Team", href: "/app/team", icon: UserRoundCog, keywords: "staff users roles permissions" },
      { title: "Audit log", href: "/app/audit", icon: ScrollText, keywords: "history security" },
      { title: "Settings", href: "/app/settings", icon: Settings, keywords: "agency profile marn abn" },
    ],
  },
];
