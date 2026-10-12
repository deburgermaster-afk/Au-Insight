"use client";

import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import { HeaderActions } from "@/components/app/header-actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Choice = { label: string; pts: number; note?: string };
type Factor = { key: string; title: string; hint?: string; choices: Choice[]; multi?: false } | { key: string; title: string; hint?: string; flag: true; pts: number };

/** Skilled migration points test (subclasses 189, 190, 491). Pass mark 65. */
const factors: Factor[] = [
  {
    key: "age",
    title: "Age when invited",
    choices: [
      { label: "18–24", pts: 25 },
      { label: "25–32", pts: 30 },
      { label: "33–39", pts: 25 },
      { label: "40–44", pts: 15 },
      { label: "45 or over", pts: 0, note: "Not eligible" },
    ],
  },
  {
    key: "english",
    title: "English",
    hint: "IELTS 6/7/8 each band, or PTE 50/65/79 equivalents",
    choices: [
      { label: "Competent", pts: 0 },
      { label: "Proficient", pts: 10 },
      { label: "Superior", pts: 20 },
    ],
  },
  {
    key: "overseas",
    title: "Skilled work outside Australia",
    hint: "In the last 10 years, in the nominated or a closely related occupation",
    choices: [
      { label: "Under 3 years", pts: 0 },
      { label: "3–4 years", pts: 5 },
      { label: "5–7 years", pts: 10 },
      { label: "8+ years", pts: 15 },
    ],
  },
  {
    key: "australian",
    title: "Skilled work in Australia",
    hint: "In the last 10 years. Combined work points are capped at 20",
    choices: [
      { label: "Under 1 year", pts: 0 },
      { label: "1–2 years", pts: 5 },
      { label: "3–4 years", pts: 10 },
      { label: "5–7 years", pts: 15 },
      { label: "8+ years", pts: 20 },
    ],
  },
  {
    key: "education",
    title: "Qualification",
    choices: [
      { label: "None that counts", pts: 0 },
      { label: "Diploma or trade", pts: 10 },
      { label: "Recognised by assessing authority", pts: 10 },
      { label: "Bachelor or Masters", pts: 15 },
      { label: "Doctorate", pts: 20 },
    ],
  },
  {
    key: "partner",
    title: "Partner",
    choices: [
      { label: "Partner, no skills or English", pts: 0 },
      { label: "Partner has competent English", pts: 5 },
      { label: "Single, or partner is citizen/PR", pts: 10 },
      { label: "Skilled partner", pts: 10, note: "Under 45, competent English, positive skills assessment" },
    ],
  },
  { key: "specialist", title: "Specialist education", hint: "Australian Masters by research or PhD in STEM/ICT", flag: true, pts: 10 },
  { key: "study", title: "Australian study requirement", hint: "At least 2 academic years at an Australian institution", flag: true, pts: 5 },
  { key: "regional", title: "Study in regional Australia", flag: true, pts: 5 },
  { key: "py", title: "Professional Year", hint: "Accounting, ICT or engineering, completed in the last 4 years", flag: true, pts: 5 },
  { key: "ccl", title: "Credentialled community language", hint: "NAATI CCL", flag: true, pts: 5 },
];

const initial: Record<string, number> = { age: 1, english: 1, overseas: 0, australian: 0, education: 3, partner: 2 };

export function PointsCalculator() {
  const [pick, setPick] = useState<Record<string, number>>(initial);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  let base = 0;
  let work = 0;
  for (const f of factors) {
    if ("flag" in f) base += flags[f.key] ? f.pts : 0;
    else {
      const p = f.choices[pick[f.key] ?? 0].pts;
      if (f.key === "overseas" || f.key === "australian") work += p;
      else base += p;
    }
  }
  base += Math.min(work, 20);
  const tooOld = pick.age === 4;
  const visas = [
    { code: "189", name: "Skilled Independent", total: base, extra: 0 },
    { code: "190", name: "Skilled Nominated", total: base + 5, extra: 5 },
    { code: "491", name: "Skilled Work Regional", total: base + 15, extra: 15 },
  ];
  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_340px]">
      <HeaderActions>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setPick(initial);
            setFlags({});
          }}
        >
          <RotateCcw />
          Reset
        </Button>
      </HeaderActions>
      <div className="grid gap-3 md:grid-cols-2">
        {factors.map((f) =>
          "flag" in f ? (
            <button
              key={f.key}
              type="button"
              onClick={() => setFlags((x) => ({ ...x, [f.key]: !x[f.key] }))}
              className={cn("flex items-start gap-3 rounded-2xl border bg-card p-4 text-left transition hover:border-foreground/20", flags[f.key] && "border-primary/50 bg-primary/5")}
            >
              <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border", flags[f.key] && "border-primary bg-primary text-primary-foreground")}>{flags[f.key] ? <Check className="size-3.5" /> : null}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{f.title}</span>
                {f.hint ? <span className="block text-xs text-muted-foreground">{f.hint}</span> : null}
              </span>
              <span className="text-sm font-semibold tabular-nums">+{f.pts}</span>
            </button>
          ) : (
            <div key={f.key} className={cn("rounded-2xl border bg-card p-4", (f.key === "age" || f.key === "english" || f.key === "education" || f.key === "partner") && "md:col-span-2")}>
              <div className="mb-3">
                <p className="text-sm font-medium">{f.title}</p>
                {f.hint ? <p className="text-xs text-muted-foreground">{f.hint}</p> : null}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {f.choices.map((c, i) => (
                  <button
                    key={c.label}
                    type="button"
                    title={c.note}
                    onClick={() => setPick((x) => ({ ...x, [f.key]: i }))}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs transition hover:border-foreground/25",
                      (pick[f.key] ?? 0) === i ? "border-primary bg-primary text-primary-foreground" : "bg-muted/30",
                    )}
                  >
                    {c.label}
                    <span className="tabular-nums opacity-70">{c.pts}</span>
                  </button>
                ))}
              </div>
            </div>
          ),
        )}
      </div>
      <aside className="grid content-start gap-3 lg:sticky lg:top-16">
        <div className="ring-gradient rounded-2xl border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Points (189)</p>
          <p className="mt-1 text-5xl font-semibold tabular-nums">{tooOld ? "—" : base}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[linear-gradient(90deg,oklch(0.75_0.15_55),oklch(0.6_0.18_300))]" style={{ width: `${Math.min(100, (base / 130) * 100)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {tooOld ? "Applicants 45 or over can't be invited for points-tested visas." : base >= 65 ? "Meets the 65-point pass mark." : `${65 - base} short of the 65-point pass mark.`}
          </p>
          {work > 20 ? <p className="mt-1 text-xs text-amber-500">Work experience capped at 20 (you selected {work}).</p> : null}
        </div>
        {visas.map((v) => (
          <div key={v.code} className="flex items-center gap-3 rounded-2xl border bg-card p-4">
            <span className="grid size-11 place-items-center rounded-xl bg-muted font-semibold tabular-nums">{v.code}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{v.name}</p>
              <p className="text-xs text-muted-foreground">{v.extra ? `Includes +${v.extra} for ${v.code === "190" ? "state nomination" : "regional nomination"}` : "No nomination"}</p>
            </div>
            <span className={cn("text-xl font-semibold tabular-nums", !tooOld && v.total >= 65 ? "text-emerald-500" : "text-muted-foreground")}>{tooOld ? "—" : v.total}</span>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">Meeting 65 makes an EOI valid; invitations usually need more. Check recent cut-offs for the occupation under Occupations.</p>
      </aside>
    </div>
  );
}
