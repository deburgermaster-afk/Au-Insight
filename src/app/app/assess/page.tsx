"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { MinusIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DecisionCard } from "@/components/decision-card";
import { assessAll, caseFactsSchema, type CaseFacts } from "@/lib/engine";
import { createClient } from "@/lib/supabase/client";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Option<T> = { value: T; label: string };

function Segmented<T extends string | boolean>({ value, options, onChange }: { value: T | undefined; options: Option<T>[]; onChange: (v: T | undefined) => void }) {
  const id = useId();
  return (
    <div className="flex flex-wrap gap-1 rounded-2xl bg-muted/60 p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={String(o.value)}
            type="button"
            onClick={() => onChange(active ? undefined : o.value)}
            className="relative flex-1 rounded-xl px-3 py-2 text-sm whitespace-nowrap"
          >
            {active && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-background shadow-sm" transition={spring.snappy} />}
            <span className={cn("relative transition-colors", active ? "text-foreground" : "text-muted-foreground")}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const noopSubscribe = () => () => {};

const yesNo: Option<boolean>[] = [
  { value: true, label: "Yes" },
  { value: false, label: "No" },
];

function Stepper({ value, onChange, max = 10 }: { value: number | undefined; onChange: (v: number | undefined) => void; max?: number }) {
  const v = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(0, v - 1))} className="grid size-9 place-items-center rounded-full bg-muted">
        <MinusIcon className="size-4" />
      </button>
      <motion.span key={value ?? "x"} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="w-14 text-center tabular-nums">
        {value === undefined ? "—" : `${v} yr${v === 1 ? "" : "s"}`}
      </motion.span>
      <button type="button" onClick={() => onChange(Math.min(max, v + 1))} className="grid size-9 place-items-center rounded-full bg-muted">
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-3xl border bg-card p-5">
      <h2 className="text-xs tracking-wide text-muted-foreground uppercase">{title}</h2>
      {children}
    </section>
  );
}

export default function AssessPage() {
  const [caseId, setCaseId] = useState<string | null>(null);
  const [facts, setFacts] = useState<CaseFacts>({});
  const [saving, setSaving] = useState(false);
  // Assessments depend on today's date, so they're computed in the browser only (never prerendered).
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const results = useMemo(() => (inBrowser ? assessAll(facts) : []), [facts, inBrowser]);

  useEffect(() => {
    (async () => {
      const { data } = await createClient().from("cases").select("id, facts").order("created_at").limit(1).maybeSingle();
      if (!data) return;
      setCaseId(data.id);
      const parsed = caseFactsSchema.safeParse(data.facts);
      if (parsed.success) setFacts(parsed.data);
    })();
  }, []);

  const set = <K extends keyof CaseFacts>(key: K) => (value: CaseFacts[K] | undefined) => setFacts((f) => ({ ...f, [key]: value }));

  async function save() {
    if (!caseId) return;
    setSaving(true);
    const { error } = await createClient().from("cases").update({ facts, updated_at: new Date().toISOString() }).eq("id", caseId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Case file saved. The assistant will use it.");
  }

  const lists = facts.occupationLists ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {/* Mobile: the decision stays visible while answering. */}
          <div className="sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto bg-background/80 px-4 py-2 backdrop-blur-xl lg:hidden">
            {results.map((r) => (
              <motion.a
                key={r.subclass}
                href="#decision"
                layout
                transition={spring.snappy}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap",
                  r.outcome === "eligible" ? "bg-brand text-brand-foreground" : r.outcome === "not_eligible" ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
                )}
              >
                {r.subclass} · {r.outcome === "eligible" ? "Eligible" : r.outcome === "not_eligible" ? "Not eligible" : `${r.nextQuestions.length} to answer`}
              </motion.a>
            ))}
          </div>
          <div>
            <h1 className="text-2xl font-medium tracking-tight">Your case file</h1>
            <p className="text-sm text-muted-foreground">Leave anything you don&apos;t know blank — the engine tells you exactly what&apos;s missing.</p>
          </div>

          <Section title="About you">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Date of birth">
                <input type="date" value={facts.dateOfBirth ?? ""} onChange={(e) => set("dateOfBirth")(e.target.value || undefined)} className="h-11 w-full rounded-xl bg-muted/60 px-3 text-sm" />
              </Field>
              <Field label="Assess as at" hint="Usually your invitation date">
                <input type="date" value={facts.assessmentDate ?? ""} onChange={(e) => set("assessmentDate")(e.target.value || undefined)} className="h-11 w-full rounded-xl bg-muted/60 px-3 text-sm" />
              </Field>
            </div>
            <Field label="English level">
              <Segmented
                value={facts.englishLevel}
                onChange={set("englishLevel")}
                options={[
                  { value: "vocational", label: "Below competent" },
                  { value: "competent", label: "Competent" },
                  { value: "proficient", label: "Proficient" },
                  { value: "superior", label: "Superior" },
                ]}
              />
            </Field>
            <Field label="Partner">
              <Segmented
                value={facts.partnerStatus}
                onChange={set("partnerStatus")}
                options={[
                  { value: "single", label: "Single" },
                  { value: "partner_citizen_or_pr", label: "Partner is AU citizen/PR" },
                  { value: "partner_skilled", label: "Skilled partner" },
                  { value: "partner_competent_english", label: "Partner: competent English" },
                  { value: "partner_other", label: "Other" },
                ]}
              />
            </Field>
          </Section>

          <Section title="Occupation & skills">
            <Field label="Occupation is on" hint="Check your ANZSCO code on the skilled occupation list">
              <div className="flex gap-2">
                {(["MLTSSL", "STSOL", "ROL"] as const).map((l) => {
                  const on = lists.includes(l);
                  return (
                    <motion.button
                      key={l}
                      type="button"
                      whileTap={{ scale: 0.95 }}
                      onClick={() => set("occupationLists")(on ? lists.filter((x) => x !== l) : [...lists, l])}
                      className={cn("rounded-full border px-4 py-2 text-sm transition-colors", on ? "border-foreground bg-foreground text-background" : "text-muted-foreground")}
                    >
                      {l}
                    </motion.button>
                  );
                })}
              </div>
            </Field>
            <Field label="Positive skills assessment">
              <Segmented value={facts.positiveSkillsAssessment} onChange={set("positiveSkillsAssessment")} options={yesNo} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Skilled work overseas" hint="In the last 10 years">
                <Stepper value={facts.overseasSkilledYears} onChange={set("overseasSkilledYears")} />
              </Field>
              <Field label="Skilled work in Australia" hint="In the last 10 years">
                <Stepper value={facts.australianSkilledYears} onChange={set("australianSkilledYears")} />
              </Field>
            </div>
          </Section>

          <Section title="Education">
            <Field label="Highest qualification">
              <Segmented
                value={facts.highestQualification}
                onChange={set("highestQualification")}
                options={[
                  { value: "doctorate", label: "Doctorate" },
                  { value: "bachelor_or_masters", label: "Bachelor/Masters" },
                  { value: "diploma_or_trade", label: "Diploma/Trade" },
                  { value: "recognised_by_assessing_authority", label: "Other recognised" },
                  { value: "none", label: "None" },
                ]}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Australian study requirement">
                <Segmented value={facts.australianStudyRequirement} onChange={set("australianStudyRequirement")} options={yesNo} />
              </Field>
              <Field label="Specialist education (STEM research)">
                <Segmented value={facts.specialistEducation} onChange={set("specialistEducation")} options={yesNo} />
              </Field>
              <Field label="Professional Year">
                <Segmented value={facts.professionalYear} onChange={set("professionalYear")} options={yesNo} />
              </Field>
              <Field label="Regional study">
                <Segmented value={facts.regionalStudy} onChange={set("regionalStudy")} options={yesNo} />
              </Field>
              <Field label="NAATI community language">
                <Segmented value={facts.credentialledCommunityLanguage} onChange={set("credentialledCommunityLanguage")} options={yesNo} />
              </Field>
            </div>
          </Section>

          <Section title="Invitation & nomination">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Invited to apply">
                <Segmented value={facts.invitationReceived} onChange={set("invitationReceived")} options={yesNo} />
              </Field>
              <Field label="State nomination (190)">
                <Segmented value={facts.stateNomination} onChange={set("stateNomination")} options={yesNo} />
              </Field>
              <Field label="Regional nomination/sponsorship (491)">
                <Segmented value={facts.regionalNominationOrSponsorship} onChange={set("regionalNominationOrSponsorship")} options={yesNo} />
              </Field>
            </div>
          </Section>

          <Section title="Health, character & debts">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="No known health issues">
                <Segmented value={facts.meetsHealth} onChange={set("meetsHealth")} options={yesNo} />
              </Field>
              <Field label="No known character issues">
                <Segmented value={facts.meetsCharacter} onChange={set("meetsCharacter")} options={yesNo} />
              </Field>
              <Field label="Owe the Government money">
                <Segmented value={facts.hasCommonwealthDebt} onChange={set("hasCommonwealthDebt")} options={yesNo} />
              </Field>
            </div>
          </Section>

          <Button size="lg" onClick={save} disabled={saving || !caseId} className="h-12 w-full rounded-full">
            {saving ? "Saving…" : "Save case file"}
          </Button>
        </div>

        <aside id="decision" className="scroll-mt-4 space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:self-start lg:overflow-y-auto">
          <h2 className="text-sm text-muted-foreground">Live decision</h2>
          {results.map((r, i) => (
            <motion.div key={r.subclass} layout transition={spring.soft} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0, transition: { ...spring.soft, delay: i * 0.05 } }}>
              <DecisionCard result={r} defaultOpen={i === 0} />
            </motion.div>
          ))}
        </aside>
      </div>
    </div>
  );
}
