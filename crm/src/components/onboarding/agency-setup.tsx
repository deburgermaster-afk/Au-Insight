"use client";

import { Building2, CheckCircle2, CreditCard, Flag, Mail, Palette, PartyPopper, Plus, Rocket, Sparkles, Trash2, Users, Wand2 } from "lucide-react";
import { motion } from "motion/react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { finishSetup, inviteTeam, saveSetupStep } from "@/lib/onboarding-actions";
import { positions } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Field, inputCls, StepFooter, StepTitle, WizardShell, type WizardStep } from "./shell";

const steps: WizardStep[] = [
  { key: "welcome", title: "Welcome", hint: "What we'll set up", icon: Sparkles },
  { key: "practice", title: "Your practice", hint: "Registration and contact", icon: Building2 },
  { key: "services", title: "Services", hint: "What you help clients with", icon: Flag },
  { key: "brand", title: "Brand & mail", hint: "Colour and mailboxes", icon: Palette },
  { key: "payments", title: "Payments", hint: "Client trust account", icon: CreditCard },
  { key: "team", title: "Your team", hint: "Invite staff", icon: Users },
  { key: "launch", title: "Launch", hint: "Demo data or a clean start", icon: Rocket },
];

const services = [
  { key: "skilled", label: "Skilled & points-tested", visas: "189 · 190 · 491" },
  { key: "employer", label: "Employer sponsored", visas: "482 · 186 · 494" },
  { key: "family", label: "Partner & family", visas: "820/801 · 309/100 · parent" },
  { key: "student", label: "Student & graduate", visas: "500 · 485 · 590" },
  { key: "education", label: "Education & course placement", visas: "Offers · CoEs · commissions" },
  { key: "visitor", label: "Visitor & bridging", visas: "600 · 408 · BVA–E" },
  { key: "protection", label: "Protection & reviews", visas: "866 · ART · ministerial" },
  { key: "business", label: "Business & investment", visas: "188 · 888 · NIV" },
];
const sizes = ["Just me", "2–5", "6–15", "16–50", "50+"];
const swatches = ["#6d5efc", "#f97316", "#ec4899", "#14b8a6", "#0ea5e9", "#22c55e", "#eab308", "#e11d48"];
const states = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

type Profile = {
  legalName: string | null;
  abn: string | null;
  marn: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  state: string | null;
  brandColor: string | null;
  services: string[] | null;
  teamSize: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankBsb: string | null;
  bankAccount: string | null;
  gstRegistered: boolean;
};

export function AgencySetup({ org, firstName, profile, mailboxes, marnExpiry }: { org: string; firstName: string; profile: Profile | null; mailboxes: { address: string; kind: string }[]; marnExpiry: string | null }) {
  const [i, setI] = useState(0);
  const [pending, start] = useTransition();
  const [p, setP] = useState({
    legalName: profile?.legalName ?? `${org} Pty Ltd`,
    abn: profile?.abn ?? "",
    marn: profile?.marn ?? "",
    marnExpiry: marnExpiry ?? "",
    phone: profile?.phone ?? "",
    email: profile?.email ?? "",
    website: profile?.website ?? "",
    address: profile?.address ?? "",
    state: profile?.state ?? "NSW",
    brandColor: profile?.brandColor ?? "#6d5efc",
    services: profile?.services ?? ["skilled", "employer", "student"],
    teamSize: profile?.teamSize ?? "2–5",
    bankName: profile?.bankName ?? "",
    bankAccountName: profile?.bankAccountName ?? "",
    bankBsb: profile?.bankBsb ?? "",
    bankAccount: profile?.bankAccount ?? "",
    gstRegistered: profile?.gstRegistered ?? true,
  });
  const [team, setTeam] = useState([{ email: "", position: "migration_agent" }]);
  const [invited, setInvited] = useState(0);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setP((x) => ({ ...x, [k]: e.target.value }));
  const back = () => setI((x) => Math.max(0, x - 1));
  const next = () => setI((x) => Math.min(steps.length - 1, x + 1));

  const save = (step: string) =>
    start(async () => {
      const f = new FormData();
      const fields: Record<string, string[]> = {
        practice: ["legalName", "abn", "marn", "marnExpiry", "phone", "email", "website", "address", "state"],
        brand: ["brandColor"],
        payments: ["bankName", "bankAccountName", "bankBsb", "bankAccount"],
        services: ["teamSize"],
      };
      for (const k of fields[step] ?? []) f.set(k, String(p[k as keyof typeof p] ?? ""));
      if (step === "services") p.services.forEach((x) => f.append("services", x));
      if (step === "payments" && p.gstRegistered) f.set("gstRegistered", "on");
      const r = await saveSetupStep(step, f);
      if (!r.ok) return void toast.error(r.error);
      next();
    });

  const preview = (
    <div className="grid gap-4">
      <p className="text-[11px] font-medium tracking-[0.18em] text-white/45 uppercase">Live preview</p>
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <div className="h-16" style={{ background: `linear-gradient(135deg, ${p.brandColor}, ${p.brandColor}55)` }} />
        <div className="-mt-6 px-4 pb-4">
          <span className="grid size-12 place-items-center rounded-xl border-2 border-black text-sm font-bold text-white" style={{ background: p.brandColor }}>
            {org
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </span>
          <p className="mt-2 font-semibold text-white">{p.legalName || org}</p>
          <p className="text-[11px] text-white/50">{[p.marn ? `MARN ${p.marn}` : null, p.abn ? `ABN ${p.abn}` : null, p.state].filter(Boolean).join(" · ") || "Registration details"}</p>
          <div className="mt-3 flex flex-wrap gap-1">
            {p.services.slice(0, 5).map((k) => (
              <span key={k} className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-white/70">
                {services.find((x) => x.key === k)?.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
        <p className="flex items-center gap-1.5 text-[11px] text-white/50">
          <Mail className="size-3" /> Mailboxes ready
        </p>
        {mailboxes.map((m) => (
          <p key={m.address} className="mt-1 truncate font-mono text-[11px] text-white/80">
            {m.address} <span className="text-white/35">· {m.kind}</span>
          </p>
        ))}
      </div>
      <p className="text-[11px] leading-relaxed text-white/40">Clients see your colour and name in emails, invoices and the client portal.</p>
    </div>
  );

  if (done)
    return (
      <WizardShell steps={steps} index={steps.length - 1} org={org} accent={p.brandColor}>
        <div className="grid flex-1 place-items-center py-10 text-center">
          <div>
            <motion.div initial={{ scale: 0.6, rotate: -12, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ type: "spring", stiffness: 180, damping: 12 }} className="mx-auto grid size-20 place-items-center rounded-3xl text-white shadow-2xl" style={{ background: p.brandColor }}>
              <PartyPopper className="size-9" />
            </motion.div>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-white">{org} is live</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/55">
              {invited ? `${invited} invite${invited > 1 ? "s" : ""} sent. ` : ""}Your mailbox, client portal and compliance checks are ready.
            </p>
            <ul className="mx-auto mt-6 grid max-w-sm gap-2 text-left text-sm">
              {["Practice and MARN saved", "Services and branding set", "Mailboxes created", invited ? "Team invited" : "Invite your team any time from Team"].map((t) => (
                <li key={t} className="flex items-center gap-2 text-white/75">
                  <CheckCircle2 className="size-4 text-emerald-400" /> {t}
                </li>
              ))}
            </ul>
            <Button className="mt-8 h-11 rounded-full bg-white px-8 text-black hover:bg-white/90" onClick={() => location.assign("/app")}>
              Open my dashboard
            </Button>
          </div>
        </div>
      </WizardShell>
    );

  const key = steps[i].key;
  return (
    <WizardShell steps={steps} index={i} org={org} accent={p.brandColor} aside={key === "welcome" || key === "launch" ? undefined : preview}>
      {key === "welcome" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            next();
          }}
        >
          <StepTitle title={`Welcome, ${firstName}. Let's set up ${org}.`} sub="Two minutes now saves hours later. Everything here can be changed in Settings." />
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { icon: Building2, t: "Registered practice", d: "MARN, ABN and contact details on every invoice and agreement." },
              { icon: Wand2, t: "Tailored workspace", d: "Checklists, visas and reports for the services you offer." },
              { icon: Users, t: "Team access", d: "Invite agents, education counsellors and admin with the right access." },
            ].map((c, n) => (
              <motion.div key={c.t} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * n }} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <c.icon className="size-5 text-orange-300" />
                <p className="mt-3 text-sm font-medium text-white">{c.t}</p>
                <p className="mt-1 text-xs text-white/50">{c.d}</p>
              </motion.div>
            ))}
          </div>
          <StepFooter next="Let's go" />
        </form>
      ) : null}

      {key === "practice" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("practice");
          }}
        >
          <StepTitle title="Your practice" sub="Shown on invoices, service agreements and the client portal." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Legal name" className="sm:col-span-2">
              <Input value={p.legalName} onChange={set("legalName")} className={inputCls} required />
            </Field>
            <Field label="ABN" hint="11 digits">
              <Input value={p.abn} onChange={set("abn")} className={inputCls} inputMode="numeric" placeholder="51 824 753 556" />
            </Field>
            <Field label="State">
              <select value={p.state} onChange={set("state")} className={cn(inputCls, "rounded-md border px-3 text-sm")}>
                {states.map((s) => (
                  <option key={s} className="bg-zinc-900">
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Your MARN" hint="Principal's registration. Unlocks lodgement features.">
              <Input value={p.marn} onChange={set("marn")} className={inputCls} inputMode="numeric" placeholder="1795213" />
            </Field>
            <Field label="MARN expiry" hint="We'll remind you before renewal">
              <Input type="date" value={p.marnExpiry} onChange={set("marnExpiry")} className={inputCls} />
            </Field>
            <Field label="Phone">
              <Input value={p.phone} onChange={set("phone")} className={inputCls} type="tel" placeholder="(02) 9000 1234" />
            </Field>
            <Field label="Email">
              <Input value={p.email} onChange={set("email")} className={inputCls} type="email" />
            </Field>
            <Field label="Office address" className="sm:col-span-2">
              <Input value={p.address} onChange={set("address")} className={inputCls} placeholder="Level 12, 1 Martin Place, Sydney NSW 2000" />
            </Field>
          </div>
          <StepFooter onBack={back} pending={pending} />
        </form>
      ) : null}

      {key === "services" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (!p.services.length) return void toast.error("Pick at least one service.");
            save("services");
          }}
        >
          <StepTitle title="What do you help clients with?" sub="We'll tune visa checklists, the Students area and reports to match." />
          <div className="grid gap-2 sm:grid-cols-2">
            {services.map((s) => {
              const on = p.services.includes(s.key);
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setP((x) => ({ ...x, services: on ? x.services.filter((k) => k !== s.key) : [...x.services, s.key] }))}
                  className={cn("flex items-center gap-3 rounded-2xl border p-3 text-left transition", on ? "border-white/40 bg-white/[0.08]" : "border-white/10 bg-white/[0.02] hover:border-white/20")}
                  style={on ? { boxShadow: `inset 0 0 0 1px ${p.brandColor}` } : undefined}
                >
                  <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-transparent text-white" : "border-white/25")} style={on ? { background: p.brandColor } : undefined}>
                    {on ? <CheckCircle2 className="size-3.5" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm text-white">{s.label}</span>
                    <span className="block font-mono text-[11px] text-white/45">{s.visas}</span>
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-6 text-[13px] text-white/75">Team size</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((s) => (
              <button key={s} type="button" onClick={() => setP((x) => ({ ...x, teamSize: s }))} className={cn("rounded-full border px-3.5 py-1.5 text-sm transition", p.teamSize === s ? "border-white bg-white text-black" : "border-white/15 text-white/70 hover:border-white/30")}>
                {s}
              </button>
            ))}
          </div>
          <StepFooter onBack={back} pending={pending} />
        </form>
      ) : null}

      {key === "brand" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("brand");
          }}
        >
          <StepTitle title="Make it yours" sub="Pick a brand colour. Your team and shared mailboxes are already set up." />
          <div className="flex flex-wrap items-center gap-3">
            {swatches.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setP((x) => ({ ...x, brandColor: c }))} className={cn("size-10 rounded-full ring-offset-2 ring-offset-black transition", p.brandColor === c && "ring-2 ring-white")} style={{ background: c }} />
            ))}
            <label className="flex items-center gap-2 rounded-full border border-white/15 py-1 pr-3 pl-1 text-xs text-white/70">
              <input type="color" value={p.brandColor} onChange={set("brandColor")} className="size-8 cursor-pointer rounded-full border-0 bg-transparent" />
              Custom
            </label>
          </div>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {mailboxes.map((m) => (
              <div key={m.address} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <Mail className="size-4" style={{ color: p.brandColor }} />
                <p className="mt-2 truncate font-mono text-[13px] text-white">{m.address}</p>
                <p className="text-[11px] text-white/45">{m.kind === "shared" ? "Shared inbox for enquiries and client replies" : "Your personal mailbox"}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-white/40">Using your own domain? Add it in Settings once it's verified.</p>
          <StepFooter onBack={back} pending={pending} />
        </form>
      ) : null}

      {key === "payments" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            save("payments");
          }}
        >
          <StepTitle title="How clients pay you" sub="Your client trust account appears on invoices and in the portal, with the invoice number as the reference." />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bank">
              <Input value={p.bankName} onChange={set("bankName")} className={inputCls} placeholder="Commonwealth Bank" />
            </Field>
            <Field label="Account name">
              <Input value={p.bankAccountName} onChange={set("bankAccountName")} className={inputCls} placeholder={`${org} Client Trust Account`} />
            </Field>
            <Field label="BSB">
              <Input value={p.bankBsb} onChange={set("bankBsb")} className={inputCls} inputMode="numeric" placeholder="062-000" />
            </Field>
            <Field label="Account number">
              <Input value={p.bankAccount} onChange={set("bankAccount")} className={inputCls} inputMode="numeric" />
            </Field>
          </div>
          <label className="mt-5 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-white/80">
            <Switch checked={p.gstRegistered} onCheckedChange={(v) => setP((x) => ({ ...x, gstRegistered: v }))} /> Registered for GST (adds 10% to professional fees)
          </label>
          <StepFooter onBack={back} pending={pending} onSkip={next} />
        </form>
      ) : null}

      {key === "team" ? (
        <form
          className="flex flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            const rows = team.filter((r) => r.email.trim());
            if (!rows.length) return next();
            start(async () => {
              const r = await inviteTeam(rows);
              if (!r.ok) return void toast.error(r.error);
              setInvited(Number(r.id ?? 0));
              toast.success(`${r.id} invite${r.id === "1" ? "" : "s"} sent`);
              next();
            });
          }}
        >
          <StepTitle title="Bring in your team" sub="Each person gets an email, their own login and mailbox, and access that fits their position." />
          <div className="grid gap-2">
            {team.map((row, n) => (
              <div key={n} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_14rem_auto]">
                <Input value={row.email} onChange={(e) => setTeam((t) => t.map((x, k) => (k === n ? { ...x, email: e.target.value } : x)))} type="email" placeholder="name@agency.com.au" className={cn(inputCls, "col-span-2 sm:col-span-1")} />
                <select value={row.position} onChange={(e) => setTeam((t) => t.map((x, k) => (k === n ? { ...x, position: e.target.value } : x)))} className={cn(inputCls, "rounded-md border px-3 text-sm")}>
                  {positions
                    .filter((x) => x.key !== "principal")
                    .map((x) => (
                      <option key={x.key} value={x.key} className="bg-zinc-900">
                        {x.label}
                      </option>
                    ))}
                </select>
                <Button type="button" size="icon" variant="ghost" className="text-white/50" onClick={() => setTeam((t) => (t.length > 1 ? t.filter((_, k) => k !== n) : [{ email: "", position: "migration_agent" }]))} aria-label="Remove">
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          <Button type="button" variant="ghost" className="mt-2 w-fit rounded-full text-white/70" onClick={() => setTeam((t) => [...t, { email: "", position: "consultant" }])}>
            <Plus /> Add another
          </Button>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {positions
              .filter((x) => ["migration_agent", "education_agent", "reception"].includes(x.key))
              .map((x) => (
                <div key={x.key} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <p className="text-xs font-medium text-white">{x.label}</p>
                  <p className="mt-0.5 text-[11px] text-white/45">{x.about}</p>
                </div>
              ))}
          </div>
          <StepFooter onBack={back} pending={pending} next={team.some((r) => r.email.trim()) ? "Send invites" : "Continue"} onSkip={next} />
        </form>
      ) : null}

      {key === "launch" ? (
        <LaunchStep
          accent={p.brandColor}
          pending={pending}
          onBack={back}
          onFinish={(demo) =>
            start(async () => {
              const r = await finishSetup(demo);
              if (!r.ok) return void toast.error(r.error);
              setDone(true);
            })
          }
        />
      ) : null}
    </WizardShell>
  );
}

function LaunchStep({ accent, pending, onBack, onFinish }: { accent: string; pending: boolean; onBack: () => void; onFinish: (demo: boolean) => void }) {
  const [demo, setDemo] = useState(true);
  return (
    <form
      className="flex flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onFinish(demo);
      }}
    >
      <StepTitle title="How would you like to start?" sub="You can delete demo records any time." />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          { v: true, icon: Sparkles, t: "Explore with demo data", d: "18 sample clients, matters at every stage, invoices, mail and students, so every screen has something to show." },
          { v: false, icon: Rocket, t: "Start with a clean slate", d: "An empty workspace, ready for your first client. Import or add clients as you go." },
        ].map((c) => (
          <button key={String(c.v)} type="button" onClick={() => setDemo(c.v)} className={cn("rounded-2xl border p-5 text-left transition", demo === c.v ? "border-white/40 bg-white/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/20")} style={demo === c.v ? { boxShadow: `inset 0 0 0 1px ${accent}` } : undefined}>
            <c.icon className="size-6" style={{ color: accent }} />
            <p className="mt-4 font-medium text-white">{c.t}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/50">{c.d}</p>
          </button>
        ))}
      </div>
      <StepFooter onBack={onBack} pending={pending} next="Launch workspace" />
    </form>
  );
}
