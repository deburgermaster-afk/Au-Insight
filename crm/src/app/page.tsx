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
import { DuskScene } from "@/components/marketing/dusk";
import { CompareTable, PlanCards } from "@/components/app/plans";
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
      <div className="relative">
        <DuskScene />
        <div className="absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-background" />
        <header className="relative z-30">
          <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-white">
              <Logo className="size-7" /> Lodgely
            </Link>
            <nav className="ml-6 hidden gap-6 text-sm text-white/65 md:flex">
              <a href="#features" className="hover:text-white">
                Features
              </a>
              <a href="#security" className="hover:text-white">
                Security
              </a>
              <a href="#pricing" className="hover:text-white">
                Pricing
              </a>
            </nav>
            <div className="ml-auto flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild className="text-white hover:bg-white/10 hover:text-white">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild className="rounded-full bg-white px-4 text-black hover:bg-white/90">
                <Link href="/sign-up">
                  Start free <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <section className="relative mx-auto max-w-6xl px-4 pb-10 pt-14 sm:px-6 sm:pt-24">
          <FadeIn className="mx-auto max-w-3xl text-center">
            <Link href="/sign-up" className="glass inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-1 text-xs font-medium text-white/80 hover:text-white">
              <Sparkles className="size-3.5 text-amber-300" /> Built for registered migration agents in Australia
            </Link>
            <h1 className="mt-6 text-balance text-4xl font-semibold tracking-tight text-white sm:text-6xl">
              Run your whole migration practice <span className="text-gradient">in one place</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-balance text-base text-white/70 sm:text-lg">
              Clients, matters, visa checklists, staff mailboxes, bookings, invoicing and trust accounting, for agencies of one to one hundred.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button size="lg" asChild className="h-11 rounded-full bg-white px-6 text-black hover:bg-white/90">
                <Link href="/sign-up">
                  Create your agency <ArrowRight />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="glass h-11 rounded-full border-white/20 px-6 text-white hover:bg-white/10 hover:text-white">
                <Link href="/sign-in">I have an account</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-white/55">Comes with a demo agency, so you can try everything in a minute.</p>
          </FadeIn>
          <FadeIn delay={0.15} y={24} className="mt-14">
            <HeroPreview />
          </FadeIn>
        </section>
      </div>

      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight">Everything an agency runs on</h2>
          <p className="mt-3 text-muted-foreground">Replaces the spreadsheet, the shared inbox, the booking tool and the accounting add-on.</p>
        </div>
        <Stagger className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {pillars.map((p) => (
            <StaggerItem key={p.title}>
              <div className="group h-full rounded-2xl border bg-card p-6 transition hover:border-foreground/20">
                <div className="grid size-10 place-items-center rounded-xl border bg-muted/40 transition group-hover:scale-110">
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
            <Link href="/sign-up" className="text-sm font-medium hover:underline">
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
        <div className="relative grid gap-6 overflow-hidden rounded-3xl border p-8 sm:p-12 lg:grid-cols-2">
          <DuskScene className="opacity-60" />
          <div className="absolute inset-0 bg-background/60" />
          <div className="relative">
            <h2 className="text-3xl font-semibold tracking-tight">Client files deserve better than a shared drive</h2>
            <p className="mt-3 text-muted-foreground">
              Every record belongs to one agency and every change is in the audit log. Roles decide who sees what, down to the client portal.
            </p>
          </div>
          <ul className="relative grid gap-3 text-sm">
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
                <li key={text as string} className="glass flex items-center gap-3 rounded-xl border p-3 text-white">
                  <I className="size-4 text-amber-300" /> {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-semibold tracking-tight">Simple pricing</h2>
        <p className="mt-2 text-center text-muted-foreground">Free for everyone during the beta.</p>
        <div className="mt-10">
          <PlanCards current="" cta="Start free" href="/sign-up" />
        </div>
        <div className="mt-14">
          <h3 className="text-xl font-semibold tracking-tight">Compare features by plan</h3>
          <p className="mb-3 text-sm text-muted-foreground">Easily compare what each plan includes.</p>
          <CompareTable />
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
