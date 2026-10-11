import {
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Briefcase,
  CalendarDays,
  CircleDollarSign,
  FileCheck2,
  Inbox,
  Landmark,
  Lock,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { FadeIn, Stagger, StaggerItem } from "@/components/app/motion";
import { HeroPreview } from "@/components/marketing/hero-preview";
import { Button } from "@/components/ui/button";
import { features } from "@/lib/features";

const pillars = [
  { icon: Briefcase, title: "Matters & pipeline", body: "Every application from enquiry to grant on a drag-and-drop board, with stage history and SLAs." },
  { icon: FileCheck2, title: "Visa checklists", body: "33 subclasses with Home Affairs document checklists that become a live, per-matter tracker." },
  { icon: Inbox, title: "Mailbox per employee", body: "Every staff member gets their own address. Mail is filed to the client and matter automatically." },
  { icon: Landmark, title: "Trust accounting", body: "Client money in trust kept apart from office money, as the OMARA Code of Conduct requires." },
  { icon: UsersRound, title: "Whole-agency hierarchy", body: "Owner, admin, supervisor, agent, staff and client roles, with supervision and workload views." },
  { icon: CalendarDays, title: "Bookings & reminders", body: "Consultations, document checks and visa-expiry alerts on one calendar." },
];

export default function Home() {
  return (
    <div className="relative overflow-x-clip">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[44rem] bg-grid [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]" />
      <div className="pointer-events-none absolute left-1/2 top-[-18rem] h-[36rem] w-[60rem] -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

      <header className="sticky top-0 z-30 border-b border-transparent bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <Logo className="size-7" /> Lodgely
          </Link>
          <nav className="ml-6 hidden gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              Features
            </a>
            <a href="#security" className="hover:text-foreground">
              Security
            </a>
            <a href="#pricing" className="hover:text-foreground">
              Pricing
            </a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">
                Start free <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="relative mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pt-24">
        <FadeIn className="mx-auto max-w-3xl text-center">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur hover:text-foreground"
          >
            <Sparkles className="size-3.5 text-primary" /> Built for registered migration agents in Australia
          </Link>
          <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            Run your whole migration practice <span className="text-gradient">in one place</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            Clients, matters, visa checklists, staff mailboxes, bookings, invoicing and trust accounting, for agencies of one to one hundred.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" asChild className="h-11 px-6 shadow-lg shadow-primary/25">
              <Link href="/sign-up">
                Create your agency <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="h-11 px-6">
              <Link href="/sign-in">I have an account</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Comes with a demo agency, so you can try everything in a minute.</p>
        </FadeIn>
        <FadeIn delay={0.15} y={24} className="mt-14">
          <HeroPreview />
        </FadeIn>
      </section>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Everything an agency runs on</h2>
          <p className="mt-3 text-muted-foreground">Replaces the spreadsheet, the shared inbox, the booking tool and the accounting add-on.</p>
        </div>
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <StaggerItem key={p.title}>
              <div className="group h-full rounded-2xl border bg-card p-6 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary transition group-hover:scale-110">
                  <p.icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold">{p.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
        <div className="mt-10 rounded-2xl border bg-card/60 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-semibold">
              {features.reduce((a, g) => a + g.items.length, 0)} features and counting
            </h3>
            <Link href="/sign-up" className="text-sm font-medium text-primary hover:underline">
              Try them all →
            </Link>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {features
              .flatMap((g) => g.items)
              .slice(0, 40)
              .map((f) => (
                <span key={f.name} className="rounded-full border bg-background px-3 py-1 text-xs text-muted-foreground">
                  {f.name}
                </span>
              ))}
          </div>
        </div>
      </section>

      <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="grid gap-6 rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-background p-8 sm:p-12 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight">Client files deserve better than a shared drive</h2>
            <p className="mt-3 text-muted-foreground">
              Every record belongs to one agency and every change is in the audit log. Roles decide who sees what, down to the client portal.
            </p>
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              [ShieldCheck, "Agency-isolated data, Australian region hosting"],
              [Lock, "Role-based access from owner to client"],
              [BadgeCheck, "Audit log of every change, export any time"],
              [Workflow, "Supervisor review before lodgement"],
              [BookOpenCheck, "Checklists based on Home Affairs requirements"],
              [CircleDollarSign, "Trust money tracked separately from office money"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof Lock;
              return (
                <li key={text as string} className="flex items-center gap-3 rounded-xl border bg-background/70 p-3">
                  <I className="size-4 text-primary" /> {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Simple pricing</h2>
        <div className="mx-auto mt-10 grid max-w-4xl gap-4 md:grid-cols-3">
          {[
            ["Solo", "$0", "One agent, everything included while in beta."],
            ["Practice", "$29", "Per staff member per month. Mailboxes, portal, trust."],
            ["Firm", "Talk to us", "Multiple offices, SSO, data residency, migration help."],
          ].map(([name, price, body], i) => (
            <div key={name} className={`rounded-2xl border p-6 ${i === 1 ? "border-primary bg-primary/5 shadow-lg shadow-primary/10" : "bg-card"}`}>
              <p className="text-sm font-medium text-muted-foreground">{name}</p>
              <p className="mt-2 text-3xl font-semibold">{price}</p>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              <Button className="mt-6 w-full" variant={i === 1 ? "default" : "outline"} asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-8 text-sm text-muted-foreground sm:px-6">
          <Logo className="size-5" /> Lodgely
          <span className="ml-auto">Made in Australia. Not affiliated with the Department of Home Affairs.</span>
        </div>
      </footer>
    </div>
  );
}
