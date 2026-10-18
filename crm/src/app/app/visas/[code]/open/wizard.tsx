"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, BadgeCheck, Briefcase, CalendarClock, Check, CircleAlert, CircleHelp, FileSignature, FolderOpen, Loader2, Mail, Plus, Search, Trash2, UserRound, Users, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ageOn, checkEligibility, type EligProfile } from "@/lib/eligibility";
import { openFile, type OpenFileInput, type OpenStep } from "@/lib/open-file-actions";
import { cn } from "@/lib/utils";
import { predictTimeline } from "@/lib/visa-timeline";

type ClientRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  nationality: string | null;
  onshore: boolean;
  currentVisa: string | null;
  visaExpiry: string | null;
  conditions: string[];
  englishTest: string | null;
  englishScore: string | null;
  occupation: string | null;
  anzsco: string | null;
  dependants: { id: string; fullName: string; relationship: string }[];
};
type Props = {
  visa: { code: string; name: string; category: string; streams: string[]; summary: string; permanent: boolean };
  clients: ClientRow[];
  staff: { id: string; name: string; registered: boolean; marn: string | null }[];
  employers: { id: string; name: string }[];
  checklist: { category: string; label: string; required: boolean }[];
  fees: { professional: number | null; government: number | null };
  templates: { key: string; title: string; group: string; summary: string }[];
  suggested: string[];
  live: { p50Months: number; p90Months: number; p50: string; p90: string } | null;
  occupations: { title: string; anzsco: string; lists: string[] }[];
  me: string;
  preselect: string | null;
};

const STEPS = [
  { key: "client", label: "Client", icon: UserRound },
  { key: "goals", label: "What they want", icon: Users },
  { key: "team", label: "Team & fees", icon: Briefcase },
  { key: "process", label: "Processing", icon: CalendarClock },
  { key: "review", label: "Review", icon: FolderOpen },
] as const;

const GOALS = ["Permanent residence", "Work in Australia", "Study", "Join or bring family", "Visit", "Stay longer (onshore)", "Business or investment", "Citizenship", "Appeal a decision"];
const RELATIONSHIPS = ["Partner", "Child", "Parent", "Sibling", "Other"];
const today = () => new Date().toISOString().slice(0, 10);
const plus = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const aud = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 2 })}`;
const fmt = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });

/** Opening a file from the visa library: client, goals, team and arrangement, processing plan, then one click to start everything. */
export function OpenFileWizard(p: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();
  const [done, setDone] = useState<{ matterId: string; steps: OpenStep[] } | null>(null);

  // ── Client ──
  const [mode, setMode] = useState<"existing" | "new">(p.preselect || p.clients.length ? "existing" : "new");
  const [q, setQ] = useState("");
  const [clientId, setClientId] = useState<string | null>(p.preselect && p.clients.some((c) => c.id === p.preselect) ? p.preselect : null);
  const [nc, setNc] = useState({ firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "", nationality: "", passportNumber: "", onshore: true, currentVisa: "", visaExpiry: "", occupation: "", englishTest: "", englishScore: "", source: "" });
  const picked = p.clients.find((c) => c.id === clientId) ?? null;
  const [fixEmail, setFixEmail] = useState("");

  // ── Goals ──
  const [stream, setStream] = useState(p.visa.streams[0] ?? "");
  const [goals, setGoals] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [family, setFamily] = useState<{ fullName: string; relationship: string; dateOfBirth: string }[]>([]);
  const [includeDeps, setIncludeDeps] = useState<string[]>([]);
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [employerId, setEmployerId] = useState("");

  // ── Team & fees ──
  const registered = p.staff.filter((s) => s.registered);
  const [assignedTo, setAssignedTo] = useState("");
  const [supervisorId, setSupervisorId] = useState(registered.find((s) => s.id === p.me)?.id ?? registered[0]?.id ?? "");
  const [feePro, setFeePro] = useState(p.fees.professional != null ? String(p.fees.professional) : "");
  const [feeGov, setFeeGov] = useState(p.fees.government != null ? String(p.fees.government) : "");
  const [plan, setPlan] = useState<"upfront" | "deposit" | "instalments">("deposit");
  const [depositPct, setDepositPct] = useState(50);
  const [instalments, setInstalments] = useState(3);
  const [sendAgreement, setSendAgreement] = useState(true);
  const [consent, setConsent] = useState<string[]>(p.suggested);

  // ── Processing ──
  const [items, setItems] = useState(p.checklist.map((c) => ({ ...c, on: true })));
  const [extraItem, setExtraItem] = useState("");
  const [requestDocs, setRequestDocs] = useState(true);
  const [docsDays, setDocsDays] = useState(14);
  const [portal, setPortal] = useState(true);
  const timeline = useMemo(() => predictTimeline({ visaCode: p.visa.code, stage: "engaged", createdAt: new Date(), agreementSignedAt: null, consumerGuideAt: null, lodgedAt: null, decisionAt: null, outcome: null, rfiDueAt: null }, p.live), [p.visa.code, p.live]);
  const lodgeDefault = timeline.find((m) => m.key === "lodged")?.date ?? plus(today(), 45);
  const [targetLodge, setTargetLodge] = useState(lodgeDefault);
  // A task plan from the visa's milestones before lodgement, plus the lodgement itself.
  const [tasks, setTasks] = useState(() => [
    { title: "Initial consultation notes and instructions", dueAt: plus(today(), 1), on: true },
    { title: "Confirm service agreement signed and Consumer Guide given", dueAt: plus(today(), 7), on: true },
    ...timeline.filter((m) => m.key.startsWith("pre:")).map((m) => ({ title: m.label, dueAt: m.date, on: true })),
    { title: "Review documents received against the checklist", dueAt: timeline.find((m) => m.key === "documents")?.date ?? plus(today(), 28), on: true },
    { title: "Prepare application and send for client review", dueAt: plus(lodgeDefault, -7), on: true },
    { title: "Lodge application and record the TRN", dueAt: lodgeDefault, on: true },
  ]);

  // ── Live eligibility from what's entered ──
  const occ = (title: string | null, anzsco: string | null) => {
    if (!title && !anzsco) return null;
    const t = title?.trim().toLowerCase();
    const hit = p.occupations.find((o) => (anzsco && o.anzsco === anzsco) || (t && o.title.toLowerCase() === t)) ?? (t ? p.occupations.find((o) => o.title.toLowerCase().startsWith(t)) : undefined);
    return { title: hit?.title ?? title ?? anzsco ?? "", anzsco: hit?.anzsco ?? anzsco, lists: hit?.lists ?? [] };
  };
  const profile: EligProfile | null =
    mode === "existing"
      ? picked && { age: ageOn(picked.dateOfBirth), onshore: picked.onshore, currentVisa: picked.currentVisa, conditions: picked.conditions, englishTest: picked.englishTest, englishScore: picked.englishScore, nationality: picked.nationality, occupation: occ(picked.occupation, picked.anzsco) }
      : nc.firstName
        ? { age: ageOn(nc.dateOfBirth || null), onshore: nc.onshore, currentVisa: nc.currentVisa || null, conditions: [], englishTest: nc.englishTest || null, englishScore: nc.englishScore || null, nationality: nc.nationality || null, occupation: occ(nc.occupation || null, null) }
        : null;
  const elig = profile ? checkEligibility(p.visa.code, profile) : null;

  const clientName = mode === "existing" ? (picked?.name ?? "") : `${nc.firstName} ${nc.lastName}`.trim();
  const email = mode === "existing" ? picked?.email || fixEmail : nc.email;
  const expiry = mode === "existing" ? (picked?.visaExpiry ?? null) : nc.visaExpiry || null;
  const pro = Number(feePro) || 0;
  const gov = Number(feeGov) || 0;
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (t ? p.clients.filter((c) => `${c.name} ${c.email ?? ""} ${c.phone ?? ""}`.toLowerCase().includes(t)) : p.clients).slice(0, 8);
  }, [q, p.clients]);

  const canNext = [mode === "existing" ? Boolean(picked) : Boolean(nc.firstName.trim() && nc.lastName.trim()), true, Boolean(supervisorId || !registered.length), items.some((i) => i.on) || true, true][step];
  const outward = { agreement: sendAgreement && Boolean(email) && pro + gov > 0, consent: email ? consent : [], documents: requestDocs && Boolean(email), portal: portal && Boolean(email) };

  const submit = () =>
    start(async () => {
      const input: OpenFileInput = {
        visaCode: p.visa.code,
        stream: stream || null,
        client: mode === "existing" ? { mode: "existing", id: picked!.id, email: fixEmail || null } : { mode: "new", ...nc },
        goals,
        instructions,
        family: family.filter((f) => f.fullName.trim()),
        includeDependantIds: includeDeps,
        priority,
        targetLodge,
        employerId: employerId || null,
        assignedTo: assignedTo || null,
        supervisorId: supervisorId || null,
        feeProfessional: feePro ? pro : null,
        feeGovernment: feeGov ? gov : null,
        payment: { plan, depositPct, instalments },
        checklist: items.filter((i) => i.on).map(({ category, label, required }) => ({ category, label, required })),
        tasks: tasks.filter((t) => t.on).map((t) => ({ title: t.title, dueAt: t.dueAt, assignee: null })),
        send: { agreement: outward.agreement, consent: outward.consent, documents: outward.documents, documentsDays: docsDays, portal: outward.portal },
      };
      const r = await openFile(input);
      if (!r.ok) return void toast.error(r.error);
      setDone({ matterId: r.matterId, steps: r.steps });
    });

  if (done) return <Done steps={done.steps} matterId={done.matterId} onGo={() => router.push(`/app/matters/${done.matterId}`)} name={clientName} visa={`${p.visa.code} ${p.visa.name}`} />;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid content-start gap-4">
        {/* Header + steps */}
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/app/visas/${encodeURIComponent(p.visa.code)}`} className="grid size-9 place-items-center rounded-full border text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Open a file</p>
            <h1 className="truncate text-lg font-semibold">
              <span className="font-mono">{p.visa.code}</span> · {p.visa.name}
            </h1>
          </div>
        </div>
        <ol className="flex gap-1 overflow-x-auto rounded-full border bg-card p-1">
          {STEPS.map((st, i) => (
            <li key={st.key} className="flex-1">
              <button type="button" disabled={i > step && !canNext} onClick={() => i <= step + 1 && setStep(i)} className={cn("relative flex w-full items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition", i === step ? "text-primary-foreground" : i < step ? "text-foreground" : "text-muted-foreground")}>
                {i === step ? <motion.span layoutId="open-step" className="absolute inset-0 rounded-full bg-primary" transition={{ type: "spring", stiffness: 500, damping: 38 }} /> : null}
                <span className="relative flex items-center gap-1.5">
                  {i < step ? <Check className="size-3.5 text-emerald-500" /> : <st.icon className="size-3.5" />}
                  <span className="hidden sm:inline">{st.label}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }} className="grid gap-4 rounded-2xl border bg-card p-4 sm:p-5">
            {step === 0 ? (
              <>
                <Seg value={mode} onChange={(v) => setMode(v as "existing" | "new")} options={[["existing", "Existing client"], ["new", "New client"]]} />
                {mode === "existing" ? (
                  <div className="grid gap-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email or phone" className="pl-9" />
                    </div>
                    <ul className="grid gap-1.5">
                      {filtered.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => setClientId(c.id)} className={cn("flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition", clientId === c.id ? "border-primary bg-primary/5" : "hover:border-foreground/20")}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">
                              {c.name
                                .split(" ")
                                .map((x) => x[0])
                                .slice(0, 2)
                                .join("")}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium">{c.name}</span>
                              <span className="block truncate text-xs text-muted-foreground">{[c.email, c.currentVisa ? `on ${c.currentVisa}` : null, c.onshore ? "Onshore" : "Offshore", c.occupation].filter(Boolean).join(" · ")}</span>
                            </span>
                            {clientId === c.id ? <Check className="size-4 text-primary" /> : null}
                          </button>
                        </li>
                      ))}
                      {!filtered.length ? <li className="rounded-xl border border-dashed p-4 text-center text-sm text-muted-foreground">No match. Switch to New client.</li> : null}
                    </ul>
                    {picked && !picked.email ? <Field label={`${picked.name.split(" ")[0]} has no email on file: add one to send forms and requests`}><Input type="email" value={fixEmail} onChange={(e) => setFixEmail(e.target.value)} placeholder="client@email.com" /></Field> : null}
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="First name *"><Input autoFocus value={nc.firstName} onChange={(e) => setNc({ ...nc, firstName: e.target.value })} /></Field>
                    <Field label="Last name *"><Input value={nc.lastName} onChange={(e) => setNc({ ...nc, lastName: e.target.value })} /></Field>
                    <Field label="Email"><Input type="email" value={nc.email} onChange={(e) => setNc({ ...nc, email: e.target.value })} /></Field>
                    <Field label="Phone"><Input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} /></Field>
                    <Field label="Date of birth"><Input type="date" value={nc.dateOfBirth} onChange={(e) => setNc({ ...nc, dateOfBirth: e.target.value })} /></Field>
                    <Field label="Nationality"><Input value={nc.nationality} onChange={(e) => setNc({ ...nc, nationality: e.target.value })} /></Field>
                    <Field label="Passport number"><Input value={nc.passportNumber} onChange={(e) => setNc({ ...nc, passportNumber: e.target.value })} /></Field>
                    <Field label="Where are they now?">
                      <Seg value={nc.onshore ? "on" : "off"} onChange={(v) => setNc({ ...nc, onshore: v === "on" })} options={[["on", "In Australia"], ["off", "Outside Australia"]]} />
                    </Field>
                    <Field label="Current visa (subclass)"><Input value={nc.currentVisa} onChange={(e) => setNc({ ...nc, currentVisa: e.target.value })} placeholder="e.g. 500" /></Field>
                    <Field label="Current visa expires"><Input type="date" value={nc.visaExpiry} onChange={(e) => setNc({ ...nc, visaExpiry: e.target.value })} /></Field>
                    <Field label="Occupation">
                      <Input list="occ-list" value={nc.occupation} onChange={(e) => setNc({ ...nc, occupation: e.target.value })} placeholder="e.g. Software Engineer" />
                      <datalist id="occ-list">
                        {p.occupations.slice(0, 1500).map((o) => (
                          <option key={o.anzsco} value={o.title} />
                        ))}
                      </datalist>
                    </Field>
                    <div className="grid grid-cols-[110px_1fr] gap-2">
                      <Field label="English test">
                        <select value={nc.englishTest} onChange={(e) => setNc({ ...nc, englishTest: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                          <option value="">None</option>
                          {["IELTS", "PTE Academic", "TOEFL iBT", "OET", "CAE"].map((t) => (
                            <option key={t}>{t}</option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Score"><Input value={nc.englishScore} onChange={(e) => setNc({ ...nc, englishScore: e.target.value })} placeholder="e.g. 7 each / 65 each" /></Field>
                    </div>
                    <Field label="How they found you">
                      <select value={nc.source} onChange={(e) => setNc({ ...nc, source: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                        <option value="">Not recorded</option>
                        {["referral", "website", "walk-in", "social", "education agent", "returning client"].map((t) => (
                          <option key={t} value={t}>
                            {t[0].toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </>
            ) : null}

            {step === 1 ? (
              <>
                {p.visa.streams.length ? (
                  <Field label="Stream">
                    <div className="flex flex-wrap gap-1.5">
                      {p.visa.streams.map((s) => (
                        <Chip key={s} on={stream === s} onClick={() => setStream(s)}>
                          {s}
                        </Chip>
                      ))}
                    </div>
                  </Field>
                ) : null}
                <Field label="What they want">
                  <div className="flex flex-wrap gap-1.5">
                    {GOALS.map((g) => (
                      <Chip key={g} on={goals.includes(g)} onClick={() => setGoals((x) => (x.includes(g) ? x.filter((y) => y !== g) : [...x, g]))}>
                        {g}
                      </Chip>
                    ))}
                  </div>
                </Field>
                <Field label="Instructions and circumstances">
                  <Textarea rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="What they've told you: timing, worries, past refusals, who's paying, anything the case officer should know." />
                </Field>
                <Field label="Family in the application">
                  <div className="grid gap-2">
                    {picked?.dependants.map((d) => (
                      <label key={d.id} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="accent-foreground" checked={includeDeps.includes(d.id)} onChange={() => setIncludeDeps((x) => (x.includes(d.id) ? x.filter((y) => y !== d.id) : [...x, d.id]))} /> {d.fullName} <span className="text-muted-foreground">({d.relationship})</span>
                      </label>
                    ))}
                    {family.map((f, i) => (
                      <div key={i} className="grid grid-cols-[1fr_120px_140px_auto] gap-2">
                        <Input value={f.fullName} onChange={(e) => setFamily((x) => x.map((y, j) => (j === i ? { ...y, fullName: e.target.value } : y)))} placeholder="Full name" />
                        <select value={f.relationship} onChange={(e) => setFamily((x) => x.map((y, j) => (j === i ? { ...y, relationship: e.target.value } : y)))} className="h-9 rounded-md border bg-background px-2 text-sm">
                          {RELATIONSHIPS.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <Input type="date" value={f.dateOfBirth} onChange={(e) => setFamily((x) => x.map((y, j) => (j === i ? { ...y, dateOfBirth: e.target.value } : y)))} />
                        <Button type="button" size="icon" variant="ghost" aria-label="Remove" onClick={() => setFamily((x) => x.filter((_, j) => j !== i))}>
                          <X />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" size="sm" variant="outline" className="w-fit" onClick={() => setFamily((x) => [...x, { fullName: "", relationship: "Partner", dateOfBirth: "" }])}>
                      <Plus /> Add family member
                    </Button>
                  </div>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Priority">
                    <Seg value={priority} onChange={(v) => setPriority(v as typeof priority)} options={[["low", "Low"], ["normal", "Normal"], ["high", "High"], ["urgent", "Urgent"]]} />
                  </Field>
                  {p.visa.category === "Employer" ? (
                    <Field label="Sponsoring employer">
                      <select value={employerId} onChange={(e) => setEmployerId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                        <option value="">Not yet known</option>
                        {p.employers.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  ) : null}
                </div>
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Responsible registered agent">
                    <select value={supervisorId} onChange={(e) => setSupervisorId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                      {registered.length ? null : <option value="">No registered agent with a current MARN</option>}
                      {registered.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.marn ? ` · MARN ${s.marn}` : ""}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Case officer">
                    <select value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                      <option value="">Automatic (your assignment rules)</option>
                      {p.staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Professional fee (ex GST)">
                    <Input inputMode="decimal" value={feePro} onChange={(e) => setFeePro(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
                  </Field>
                  <Field label="Visa application charge (estimate)">
                    <Input inputMode="decimal" value={feeGov} onChange={(e) => setFeeGov(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" />
                  </Field>
                </div>
                <Field label="Payment arrangement">
                  <div className="grid gap-2 sm:grid-cols-3">
                    {(
                      [
                        ["upfront", "In full", "On signing"],
                        ["deposit", "Deposit + balance", `${depositPct}% now, rest before lodging`],
                        ["instalments", "Instalments", `${instalments} payments`],
                      ] as const
                    ).map(([k, t, d]) => (
                      <button key={k} type="button" onClick={() => setPlan(k)} className={cn("rounded-xl border p-3 text-left transition", plan === k ? "border-primary bg-primary/5" : "hover:border-foreground/20")}>
                        <span className="block text-sm font-medium">{t}</span>
                        <span className="block text-xs text-muted-foreground">{d}</span>
                      </button>
                    ))}
                  </div>
                  {plan === "deposit" ? <input type="range" min={10} max={90} step={5} value={depositPct} onChange={(e) => setDepositPct(Number(e.target.value))} className="mt-2 w-full accent-foreground" /> : null}
                  {plan === "instalments" ? <input type="range" min={2} max={12} value={instalments} onChange={(e) => setInstalments(Number(e.target.value))} className="mt-2 w-full accent-foreground" /> : null}
                  {pro ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Professional fee {aud(pro)} + GST {aud(pro * 0.1)} = <b className="text-foreground">{aud(pro * 1.1)}</b>
                      {plan === "deposit" ? ` · deposit ${aud(pro * 1.1 * (depositPct / 100))}` : plan === "instalments" ? ` · ${instalments} × ${aud((pro * 1.1) / instalments)}` : ""}
                      {gov ? ` · plus the visa charge ${aud(gov)}, paid to the Department` : ""}
                    </p>
                  ) : null}
                </Field>
                <Toggle on={sendAgreement} set={setSendAgreement} disabled={!email || !(pro + gov)} icon={FileSignature} title="Send the service agreement to sign" detail={!email ? "Add the client's email to send it." : !(pro + gov) ? "Add a fee so the agreement has an estimate." : "With the fee estimate and payment arrangement; signed in the client portal."} />
                <Field label={`Consent forms to sign · ${consent.length} selected`}>
                  <div className="grid max-h-64 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                    {[...p.templates].sort((a, b) => Number(p.suggested.includes(b.key)) - Number(p.suggested.includes(a.key))).map((t) => (
                      <label key={t.key} className={cn("flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-[13px] transition", consent.includes(t.key) ? "border-primary/50 bg-primary/5" : "hover:border-foreground/20")}>
                        <input type="checkbox" className="mt-0.5 accent-foreground" checked={consent.includes(t.key)} onChange={() => setConsent((x) => (x.includes(t.key) ? x.filter((y) => y !== t.key) : [...x, t.key]))} />
                        <span className="min-w-0">
                          <span className="block font-medium leading-tight">{t.title}</span>
                          {p.suggested.includes(t.key) ? <span className="text-[11px] text-sky-600">Recommended for this file</span> : <span className="text-[11px] text-muted-foreground">{t.group}</span>}
                        </span>
                      </label>
                    ))}
                  </div>
                  {!email ? <p className="text-xs text-amber-600">Forms are sent once the client has an email.</p> : null}
                </Field>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <Field label={`Document checklist · ${items.filter((i) => i.on).length} of ${items.length}`}>
                  <div className="grid max-h-72 gap-3 overflow-y-auto pr-1">
                    {[...new Set(items.map((i) => i.category))].map((cat) => (
                      <div key={cat}>
                        <p className="mb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{cat}</p>
                        {items.map((it, i) =>
                          it.category === cat ? (
                            <label key={i} className="flex items-start gap-2 py-0.5 text-[13px]">
                              <input type="checkbox" className="mt-0.5 accent-foreground" checked={it.on} onChange={() => setItems((x) => x.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
                              <span className={cn(!it.on && "text-muted-foreground line-through")}>{it.label}</span>
                              {!it.required ? <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">if applicable</span> : null}
                            </label>
                          ) : null,
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input value={extraItem} onChange={(e) => setExtraItem(e.target.value)} placeholder="Add a document for this client" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), extraItem.trim() && (setItems((x) => [...x, { category: "Other", label: extraItem.trim(), required: true, on: true }]), setExtraItem("")))} />
                    <Button type="button" variant="outline" disabled={!extraItem.trim()} onClick={() => (setItems((x) => [...x, { category: "Other", label: extraItem.trim(), required: true, on: true }]), setExtraItem(""))}>
                      <Plus /> Add
                    </Button>
                  </div>
                </Field>
                <Toggle on={requestDocs} set={setRequestDocs} disabled={!email} icon={Mail} title="Ask the client for these documents now" detail={email ? `A private upload link by email, due in ${docsDays} days.` : "Add the client's email to send the request."}>
                  {requestDocs && email ? <input type="range" min={3} max={45} value={docsDays} onChange={(e) => setDocsDays(Number(e.target.value))} className="w-40 accent-foreground" /> : null}
                </Toggle>
                <Toggle on={portal} set={setPortal} disabled={!email} icon={UserRound} title="Turn on the client portal" detail="They track progress, upload, sign and pay in one place (mobile friendly)." />
                <Field label="Target lodgement">
                  <Input type="date" value={targetLodge} onChange={(e) => setTargetLodge(e.target.value)} className="w-48" />
                  {expiry && targetLodge > expiry ? (
                    <p className="flex items-center gap-1.5 text-xs text-amber-600">
                      <CircleAlert className="size-3.5" /> Their current visa expires {fmt(expiry)}, before this date. Lodge earlier to keep a bridging visa.
                    </p>
                  ) : expiry ? (
                    <p className="text-xs text-muted-foreground">Current visa expires {fmt(expiry)}.</p>
                  ) : null}
                </Field>
                <Field label={`Task plan · ${tasks.filter((t) => t.on).length} tasks for the case officer`}>
                  <ul className="grid gap-1">
                    {tasks.map((t, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <input type="checkbox" className="accent-foreground" checked={t.on} onChange={() => setTasks((x) => x.map((y, j) => (j === i ? { ...y, on: !y.on } : y)))} />
                        <Input value={t.title} onChange={(e) => setTasks((x) => x.map((y, j) => (j === i ? { ...y, title: e.target.value } : y)))} className="h-8 flex-1 text-[13px]" />
                        <Input type="date" value={t.dueAt} onChange={(e) => setTasks((x) => x.map((y, j) => (j === i ? { ...y, dueAt: e.target.value } : y)))} className="h-8 w-40 text-[13px]" />
                        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Remove task" onClick={() => setTasks((x) => x.filter((_, j) => j !== i))}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                  <Button type="button" size="sm" variant="outline" className="mt-1 w-fit" onClick={() => setTasks((x) => [...x, { title: "", dueAt: plus(today(), 7), on: true }])}>
                    <Plus /> Add task
                  </Button>
                </Field>
              </>
            ) : null}

            {step === 4 ? (
              <div className="grid gap-3 text-sm">
                <Review label="Client" value={`${clientName}${email ? ` · ${email}` : ""}${mode === "new" ? " (new)" : ""}`} />
                <Review label="Visa" value={`${p.visa.code} ${p.visa.name}${stream ? ` · ${stream}` : ""} · ${priority} priority`} />
                <Review label="Wants" value={goals.join(", ") || "Not recorded"} />
                <Review label="Family" value={[...(picked?.dependants.filter((d) => includeDeps.includes(d.id)).map((d) => d.fullName) ?? []), ...family.filter((f) => f.fullName).map((f) => f.fullName)].join(", ") || "Applying alone"} />
                <Review label="Team" value={`${registered.find((s) => s.id === supervisorId)?.name ?? "—"} (registered agent) · ${p.staff.find((s) => s.id === assignedTo)?.name ?? "auto-assigned"} (case officer)`} />
                <Review label="Fees" value={pro || gov ? `${pro ? `${aud(pro * 1.1)} incl. GST` : ""}${gov ? ` + ${aud(gov)} visa charge` : ""} · ${plan === "upfront" ? "in full" : plan === "deposit" ? `${depositPct}% deposit` : `${instalments} instalments`}` : "Not set"} />
                <Review label="Processing" value={`${items.filter((i) => i.on).length} documents · ${tasks.filter((t) => t.on).length} tasks · target lodgement ${fmt(targetLodge)}`} />
                <div className="rounded-xl border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">When you open the file, Lodgely will</p>
                  <ul className="grid gap-1.5 text-[13px]">
                    {[
                      [true, mode === "new" ? "Create the client record" : "Use the existing client record"],
                      [true, "Open the matter with its team, fees and payment arrangement"],
                      [true, `Add ${items.filter((i) => i.on).length} checklist items and ${tasks.filter((t) => t.on).length} dated tasks`],
                      [outward.agreement, "Send the service agreement to sign"],
                      [outward.consent.length > 0, `Send ${outward.consent.length} consent form${outward.consent.length === 1 ? "" : "s"} as one pack`],
                      [outward.documents, `Email the document request (due in ${docsDays} days)`],
                      [outward.portal, "Turn on the client portal"],
                    ].map(([on, t]) => (
                      <li key={String(t)} className={cn("flex items-center gap-2", !on && "text-muted-foreground line-through")}>
                        {on ? <Check className="size-3.5 text-emerald-500" /> : <X className="size-3.5" />} {t}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>

        <div className="flex items-center gap-2">
          <Button variant="ghost" className="rounded-full" disabled={step === 0 || pending} onClick={() => setStep((x) => x - 1)}>
            <ArrowLeft /> Back
          </Button>
          {step < STEPS.length - 1 ? (
            <Button className="ml-auto rounded-full" disabled={!canNext} onClick={() => setStep((x) => x + 1)}>
              Next <ArrowRight />
            </Button>
          ) : (
            <Button className="ml-auto rounded-full" disabled={pending} onClick={submit}>
              {pending ? <Loader2 className="animate-spin" /> : <FolderOpen />} {pending ? "Opening the file…" : "Open file"}
            </Button>
          )}
        </div>
      </div>

      {/* Live summary: eligibility and the predicted timeline */}
      <aside className="grid content-start gap-3 lg:sticky lg:top-16">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">File</p>
          <p className="text-sm font-semibold">{clientName || "Choose a client"}</p>
          <p className="text-xs text-muted-foreground">
            {p.visa.code} {p.visa.name}
            {stream ? ` · ${stream}` : ""}
          </p>
          {elig ? (
            <div className="mt-3 grid gap-1.5">
              <p className={cn("w-fit rounded-full px-2 py-0.5 text-[11px] font-medium", elig.verdict === "likely" ? "bg-emerald-500/12 text-emerald-700" : elig.verdict === "possible" ? "bg-amber-500/15 text-amber-700" : "bg-rose-500/12 text-rose-700")}>
                {elig.verdict === "likely" ? "Looks eligible" : elig.verdict === "possible" ? "Possibly eligible" : "Eligibility concern"}
              </p>
              {elig.checks
                .filter((c) => c.status !== "pass" || ["age", "english", "occupation", "location"].includes(c.id))
                .slice(0, 6)
                .map((c) => (
                  <p key={c.id} className="flex items-start gap-1.5 text-[12px]">
                    {c.status === "pass" ? <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> : c.status === "fail" ? <CircleAlert className="mt-0.5 size-3.5 shrink-0 text-rose-500" /> : <CircleHelp className="mt-0.5 size-3.5 shrink-0 text-amber-500" />}
                    <span>
                      <span className="font-medium">{c.label}</span> <span className="text-muted-foreground">{c.detail}</span>
                    </span>
                  </p>
                ))}
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Predicted timeline{p.live ? ` · Home Affairs ${p.live.p50}–${p.live.p90}` : ""}</p>
          <ol className="grid gap-1.5">
            {timeline.slice(0, 9).map((m) => (
              <li key={m.key} className="flex gap-2 text-[12px]">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--chart-2)]" />
                <span className="min-w-0 flex-1 truncate">{m.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{m.key === "lodged" ? fmt(targetLodge) : fmt(m.date)}</span>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-full border px-3 py-1 text-[13px] transition", on ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {children}
    </button>
  );
}
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: (readonly [string, string])[] }) {
  return (
    <div className="flex w-fit rounded-full border bg-muted/40 p-0.5">
      {options.map(([k, l]) => (
        <button key={k} type="button" onClick={() => onChange(k)} className={cn("rounded-full px-3 py-1 text-[13px] transition", value === k ? "bg-background font-medium shadow-sm" : "text-muted-foreground")}>
          {l}
        </button>
      ))}
    </div>
  );
}
function Toggle({ on, set, disabled, icon: Icon, title, detail, children }: { on: boolean; set: (v: boolean) => void; disabled?: boolean; icon: typeof Mail; title: string; detail: string; children?: React.ReactNode }) {
  const active = on && !disabled;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3 transition", active ? "border-primary/50 bg-primary/5" : "", disabled && "opacity-60")}>
      <span className={cn("grid size-9 place-items-center rounded-lg", active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      {children}
      <button type="button" role="switch" aria-checked={active} disabled={disabled} onClick={() => set(!on)} className={cn("relative h-6 w-10 rounded-full transition", active ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 size-5 rounded-full bg-background shadow transition-all", active ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}
function Review({ label, value }: { label: string; value: string }) {
  return (
    <p className="grid grid-cols-[100px_1fr] gap-3 border-b pb-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </p>
  );
}

/** What happened when the file was opened, step by step, then on to the matter. */
function Done({ steps, matterId, onGo, name, visa }: { steps: OpenStep[]; matterId: string; onGo: () => void; name: string; visa: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto grid w-full max-w-xl gap-4 rounded-3xl border bg-card p-6">
      <motion.span initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 200, damping: 12 }} className="mx-auto grid size-14 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-500">
        <FolderOpen className="size-7" />
      </motion.span>
      <div className="text-center">
        <p className="text-lg font-semibold">File opened for {name}</p>
        <p className="text-sm text-muted-foreground">{visa}</p>
      </div>
      <ul className="grid gap-2">
        {steps.map((s, i) => (
          <motion.li key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }} className="flex items-start gap-2.5 rounded-xl border p-2.5 text-sm">
            {s.ok ? <Check className="mt-0.5 size-4 shrink-0 text-emerald-500" /> : <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />}
            <span>
              <span className="font-medium">{s.label}</span>
              {s.detail ? <span className="block text-xs text-muted-foreground">{s.detail}</span> : null}
            </span>
          </motion.li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" className="rounded-full" asChild>
          <Link href="/app/visas">Back to visas</Link>
        </Button>
        <Button className="rounded-full" onClick={onGo} data-matter={matterId}>
          Go to the matter <ArrowRight />
        </Button>
      </div>
    </motion.div>
  );
}
