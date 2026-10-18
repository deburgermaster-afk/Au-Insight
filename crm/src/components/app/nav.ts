import {
  BarChart3,
  BookOpenCheck,
  Briefcase,
  Building2,
  Calculator,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  FileSignature,
  FileStack,
  FolderTree,
  GraduationCap,
  Inbox,
  Newspaper,
  LayoutDashboard,
  type LucideIcon,
  ScrollText,
  SearchCheck,
  Settings,
  Sparkles,
  UserRound,
  UserRoundCog,
  UsersRound,
  Wallet,
} from "lucide-react";
import type { Cap } from "@/lib/permissions";

export type NavItem = { title: string; href: string; icon: LucideIcon; keywords?: string; cap?: Cap };

export const nav: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", href: "/app", icon: LayoutDashboard },
      { title: "Inbox", href: "/app/inbox", icon: Inbox, keywords: "mail email messages", cap: "mail" },
      { title: "Calendar", href: "/app/calendar", icon: CalendarDays, keywords: "appointments bookings" },
      { title: "Tasks", href: "/app/tasks", icon: ClipboardCheck, keywords: "todo" },
      { title: "Me", href: "/app/me", icon: UserRound, keywords: "payslips leave timesheet cpd profile employee portal" },
    ],
  },
  {
    label: "Practice",
    items: [
      { title: "Clients", href: "/app/clients", icon: UsersRound, keywords: "contacts leads people", cap: "clients" },
      { title: "Matters", href: "/app/matters", icon: Briefcase, keywords: "cases applications pipeline kanban", cap: "clients" },
      { title: "Students", href: "/app/students", icon: GraduationCap, keywords: "education offers coe commissions institutions", cap: "education" },
      { title: "Employers", href: "/app/employers", icon: Building2, keywords: "sponsors business 482 186", cap: "clients" },
      { title: "E-sign", href: "/app/sign", icon: FileSignature, keywords: "signature consent forms templates sign pdf docusign", cap: "clients" },
      { title: "Documents", href: "/app/documents", icon: FileStack, keywords: "files uploads", cap: "files" },
      { title: "Files", href: "/app/files", icon: FolderTree, keywords: "drive folders", cap: "files" },
    ],
  },
  {
    label: "Knowledge",
    items: [
      { title: "Occupations", href: "/app/occupations", icon: SearchCheck, keywords: "anzsco eoi skillselect invitations backlog points" },
      { title: "Immigration updates", href: "/app/updates", icon: Newspaper, keywords: "news changes invitation rounds skillselect announcements" },
      { title: "Visa library", href: "/app/visas", icon: BookOpenCheck, keywords: "subclass checklist requirements" },
      { title: "Points calculator", href: "/app/points", icon: Calculator, keywords: "points test 189 190 491" },
      { title: "Features", href: "/app/features", icon: Sparkles, keywords: "roadmap" },
    ],
  },
  {
    label: "Business",
    items: [
      { title: "Billing & trust", href: "/app/billing", icon: CircleDollarSign, keywords: "invoices payments money ledger", cap: "billing" },
      { title: "Reports", href: "/app/reports", icon: BarChart3, keywords: "analytics charts", cap: "reports" },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Team", href: "/app/team", icon: UserRoundCog, keywords: "staff users roles permissions" },
      { title: "HR & payroll", href: "/app/hr", icon: Wallet, keywords: "pay run payslips leave timesheets super", cap: "payroll" },
      { title: "Audit log", href: "/app/audit", icon: ScrollText, keywords: "history security", cap: "team" },
      { title: "Settings", href: "/app/settings", icon: Settings, keywords: "agency profile marn abn", cap: "team" },
    ],
  },
];
