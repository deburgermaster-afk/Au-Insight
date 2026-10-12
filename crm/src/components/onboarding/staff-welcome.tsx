"use client";

import { BadgeCheck, Briefcase, CheckCircle2, FileText, GraduationCap, HandHeart, Inbox, Landmark, LayoutDashboard, PartyPopper, ShieldCheck, Sparkles, UserRound, Wallet } from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { saveWelcomeStep } from "@/lib/onboarding-actions";
import { cn } from "@/lib/utils";
import { Field, inputCls, StepFooter, StepTitle, WizardShell, type WizardStep } from "./shell";

const capInfo: Record<string, { icon: typeof Inbox; t: string }> = {
  immigration: { icon: BadgeCheck, t: "Advise clients and lodge visa applications" },
  education: { icon: GraduationCap, t: "Student applications, offers, CoEs and commissions" },
  clients: { icon: UserRound, t: "Client files, matters and document checklists" },
  billing: { icon: Landmark, t: "Invoices, payments and the trust account" },
  payroll: { icon: Wallet, t: "Staff records, leave and pay runs" },
  mail: { icon: Inbox, t: "Your own mailbox plus the shared inbox" },
  files: { icon: FileText, t: "The agency drive and client documents" },
  reports: { icon: LayoutDashboard, t: "Reports and practice analytics" },
};

type Props = {
  org: string;
  inviter: string | null;
  name: string;
  position: string;
  positionLabel: string;
  about: string;
  caps: string[];
  mailbox: string | null;
  profile: { title: string | null; phone: string | null; emergencyName: string | null; emergencyPhone: string | null; marn: string | null; marnExpiry: string | null; qeac: string | null; bankBsb: string | null; bankAccount: string | null; superFund: string | null; taxFreeThreshold: boolean };
  brand: string | null;
};

export function StaffWelcome(props: Props) {
  const { org, name, position, positionLabel, caps, mailbox, brand } = props;
  const registered = position === "migration_agent" || position === "principal";
  const edu = position === "education_agent";
  const steps = useMemo<WizardStep[]>(
    () => [
      { key: "hello", title: "Welcome", hint: `Joining ${org}`, icon: Sparkles },
      { key: "about", title: "About you", hint: "Contact and emergency", icon: UserRound },
      ...(registered || edu ? [{ key: "registration", title: registered ? "Registration" : "Agent training", hint: registered ? "Your MARN" : "QEAC / PIER", icon: BadgeCheck }] : []),
      { key: "pay", title: "Pay details", hint: "Bank and super", icon: Wallet },
      { key: "policies", title: "Agreements", hint: "Privacy and conduct", icon: ShieldCheck },
      { key: "done", title: "You're in", hint: "Where to start", icon: PartyPopper },
    ],
    [org, registered, edu],
  );
  const [i, setI] = useState(0);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ name, ...props.profile, title: props.profile.title ?? positionLabel });
  const [agree, setAgree] = useState({ privacy: false, confidentiality: false, code: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const next = () => setI((x) => Math.min(steps.length - 1, x + 1));
  const back = () => setI((x) => Math.max(0, x - 1));
  const accent = brand ?? "#6d5efc";

  const save = (step: string, keys: (keyof typeof f)[], extra?: Record<string, string>) =>
    start(async () => {
      const d = new FormData();
      for (const k of keys) d.set(k, String(f[k] ?? ""));
      if (step === "pay" && f.taxFreeThreshold) d.set("taxFreeThreshold", "on");
      for (const [k, v] of Object.entries(extra ?? {})) d.set(k, v);
      const r = await saveWelcomeStep(step, d);
      if (!r.ok) return void toast.error(r.error);
      next();
    });

  const key = steps[i].key;
  return (
    <WizardShell steps={steps} index={i} org={org} accent={accent}>
      {key === "hello" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <StepTitle title={`Welcome to ${org}, ${name.split(" ")[0]}`} sub={`${props.inviter ? `${props.inviter} added you` : "You've joined"} as ${positionLabel}. ${props.about}`} />
          <p className="mb-3 text-[13px] text-white/60">Here's what you'll be able to do:</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {caps
              .filter((c) => capInfo[c])
              .map((c, n) => {
                const x = capInfo[c];
                return (
                  <motion.div key={c} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * n }} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: `${accent}22`, color: accent }}>
                      <x.icon className="size-4" />
                    </span>
                    <span className="text-[13px] text-white/85">{x.t}</span>
                  </motion.div>
                );
              })}
          </div>
          {mailbox ? (
            <p className="mt-5 text-xs text-white/50">
              Your email address: <span className="font-mono text-white/80">{mailbox}</span>
            </p>
          ) : null}
          <StepFooter next="Get started" />
        </form>
      ) : null}

      {key === "about" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("about", ["name", "title", "phone", "emergencyName", "emergencyPhone"]);
          }}
        >
          <StepTitle title="A little about you" sub="Your name and title appear on emails and client files." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name">
              <Input value={f.name} onChange={set("name")} className={inputCls} required />
            </Field>
            <Field label="Job title">
              <Input value={f.title ?? ""} onChange={set("title")} className={inputCls} />
            </Field>
            <Field label="Mobile" className="sm:col-span-2">
              <Input value={f.phone ?? ""} onChange={set("phone")} type="tel" className={inputCls} placeholder="0400 000 000" />
            </Field>
            <Field label="Emergency contact">
              <Input value={f.emergencyName ?? ""} onChange={set("emergencyName")} className={inputCls} placeholder="Name and relationship" />
            </Field>
            <Field label="Their phone">
              <Input value={f.emergencyPhone ?? ""} onChange={set("emergencyPhone")} type="tel" className={inputCls} />
            </Field>
          </div>
          <StepFooter onBack={back} pending={pending} />
        </form>
      ) : null}

      {key === "registration" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("registration", ["marn", "marnExpiry", "qeac"]);
          }}
        >
          <StepTitle title={registered ? "Your registration" : "Education agent training"} sub={registered ? "Lodgement and advice features unlock only while your MARN is current. We'll remind you before it expires." : "Record your Education Agent Training Course (QEAC) number. Commission features stay available either way."} />
          <div className="grid gap-4 sm:grid-cols-2">
            {registered ? (
              <>
                <Field label="MARN" hint="7 digits">
                  <Input value={f.marn ?? ""} onChange={set("marn")} inputMode="numeric" className={inputCls} />
                </Field>
                <Field label="Registration expiry">
                  <Input value={f.marnExpiry ?? ""} onChange={set("marnExpiry")} type="date" className={inputCls} />
                </Field>
              </>
            ) : (
              <Field label="QEAC / PIER number" className="sm:col-span-2">
                <Input value={f.qeac ?? ""} onChange={set("qeac")} className={inputCls} placeholder="QEAC-A1234" />
              </Field>
            )}
          </div>
          {registered ? (
            <div className="mt-5 flex gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-xs text-white/55">
              <Briefcase className="size-4 shrink-0" style={{ color: accent }} /> CPD from 1 April 2026 must include ethics and Code of Conduct topics. Log it under Me → CPD and track progress to your yearly target.
            </div>
          ) : null}
          <StepFooter onBack={back} pending={pending} onSkip={next} />
        </form>
      ) : null}

      {key === "pay" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("pay", ["bankBsb", "bankAccount", "superFund"]);
          }}
        >
          <StepTitle title="Getting paid" sub="Only you and HR can see these. Payslips land in your portal each pay run." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="BSB">
              <Input value={f.bankBsb ?? ""} onChange={set("bankBsb")} inputMode="numeric" className={inputCls} placeholder="062-000" />
            </Field>
            <Field label="Account number">
              <Input value={f.bankAccount ?? ""} onChange={set("bankAccount")} inputMode="numeric" className={inputCls} />
            </Field>
            <Field label="Super fund" className="sm:col-span-2" hint="Leave blank to use the agency's default fund or your stapled fund">
              <Input value={f.superFund ?? ""} onChange={set("superFund")} className={inputCls} placeholder="AustralianSuper" />
            </Field>
          </div>
          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
            <Switch checked={f.taxFreeThreshold} onCheckedChange={(v) => setF((x) => ({ ...x, taxFreeThreshold: v }))} />
            Claim the tax-free threshold from this employer
          </label>
          <p className="mt-2 text-[11px] text-white/40">Give your Tax File Number declaration to HR through the ATO form; Lodgely doesn't store TFNs.</p>
          <StepFooter onBack={back} pending={pending} onSkip={next} />
        </form>
      ) : null}

      {key === "policies" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("policies", [], { ...Object.fromEntries(Object.entries(agree).filter(([, v]) => v).map(([k]) => [k, "on"])), ...(registered ? { needsCode: "1" } : {}) });
          }}
        >
          <StepTitle title="Before you start" sub="Client files hold passports, health and financial records. Please confirm you'll handle them properly." />
          <div className="grid gap-2">
            {[
              { k: "privacy" as const, t: "Privacy", d: "I'll handle personal information under the Australian Privacy Principles and only access files I need for my work." },
              { k: "confidentiality" as const, t: "Confidentiality", d: "I won't share client or agency information outside the agency, and I'll keep my login to myself." },
              ...(registered ? [{ k: "code" as const, t: "Code of Conduct", d: "I'll follow the Code of Conduct for registered migration agents, including the Consumer Guide, written service agreements and keeping file notes." }] : []),
            ].map((x) => (
              <label key={x.k} className={cn("flex cursor-pointer gap-3 rounded-2xl border p-4 transition", agree[x.k] ? "border-white/30 bg-white/[0.06]" : "border-white/10 bg-white/[0.02]")}>
                <Checkbox checked={agree[x.k]} onCheckedChange={(v) => setAgree((a) => ({ ...a, [x.k]: v === true }))} className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-white">
                    <HandHeart className="size-3.5" style={{ color: accent }} /> {x.t}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-white/55">{x.d}</span>
                </span>
              </label>
            ))}
          </div>
          <StepFooter onBack={back} pending={pending} next="I agree" disabled={!agree.privacy || !agree.confidentiality || (registered && !agree.code)} />
        </form>
      ) : null}

      {key === "done" ? (
        <div className="flex flex-1 flex-col">
          <div className="py-4 text-center">
            <motion.div initial={{ scale: 0.6, opacity: 0, rotate: -10 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 180, damping: 12 }} className="mx-auto grid size-16 place-items-center rounded-2xl text-white" style={{ background: accent }}>
              <CheckCircle2 className="size-8" />
            </motion.div>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">You're all set, {f.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-white/55">Pick a place to start.</p>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {[
              { href: "/app/me", icon: UserRound, t: "My portal", d: "Leave, timesheets, payslips, CPD" },
              { href: "/app/inbox", icon: Inbox, t: "Inbox", d: mailbox ?? "Your mailbox" },
              caps.includes("education") && !caps.includes("immigration") ? { href: "/app/students", icon: GraduationCap, t: "Students", d: "Pipeline and course finder" } : { href: "/app", icon: LayoutDashboard, t: "Dashboard", d: "Today's work and deadlines" },
            ].map((x) => (
              <button key={x.href} type="button" onClick={() => location.assign(x.href)} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-left transition hover:border-white/25">
                <x.icon className="size-5" style={{ color: accent }} />
                <p className="mt-3 text-sm font-medium text-white">{x.t}</p>
                <p className="mt-0.5 truncate text-[11px] text-white/50">{x.d}</p>
              </button>
            ))}
          </div>
          <div className="mt-auto flex justify-end pt-8">
            <Button className="h-10 rounded-full bg-white px-6 text-black hover:bg-white/90" onClick={() => location.assign("/app")}>
              Go to Lodgely
            </Button>
          </div>
        </div>
      ) : null}
    </WizardShell>
  );
}
