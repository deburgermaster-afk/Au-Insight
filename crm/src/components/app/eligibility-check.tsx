"use client";

import { AlertTriangle, Check, CircleHelp, Loader2, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { type Answers, checkEligibility, type EligProfile, isPointsTested, POINT_FACTORS, type PointsInput, questionsFor } from "@/lib/eligibility";
import { explainEligibility } from "@/lib/eligibility-actions";
import { newsFor } from "@/lib/news";
import { cn } from "@/lib/utils";

const ICON = {
  pass: { icon: Check, cls: "bg-emerald-500/12 text-emerald-600" },
  fail: { icon: X, cls: "bg-rose-500/12 text-rose-600" },
  check: { icon: CircleHelp, cls: "bg-amber-500/15 text-amber-700" },
} as const;
const VERDICT = {
  likely: { label: "Looks eligible", cls: "bg-emerald-500/12 text-emerald-700" },
  possible: { label: "Possibly eligible: confirm the open items", cls: "bg-amber-500/15 text-amber-700" },
  unlikely: { label: "Not eligible on current facts", cls: "bg-rose-500/12 text-rose-700" },
} as const;

/** Visa eligibility screening for one client: pick a visa, answer what the record can't tell, see each criterion. */
export function EligibilityCheck({ clientId, profile, visas, initialCode, aiOn }: { clientId: string; profile: EligProfile; visas: { code: string; name: string }[]; initialCode: string; aiOn: boolean }) {
  const [code, setCode] = useState(initialCode);
  const [answers, setAnswers] = useState<Record<string, Answers>>({});
  const [pts, setPts] = useState<PointsInput>({});
  const [ai, setAi] = useState<{ code: string; text: string } | null>(null);
  const [pending, start] = useTransition();
  const a = answers[code] ?? {};
  const result = useMemo(() => checkEligibility(code, profile, answers[code] ?? {}, pts), [code, profile, answers, pts]);
  const qs = questionsFor(code);
  const news = newsFor(code);

  // Screen every visa with rules at once, to suggest others worth a look.
  const others = useMemo(
    () =>
      visas
        .filter((v) => v.code !== code)
        .map((v) => ({ ...v, r: checkEligibility(v.code, profile, {}, {}) }))
        .filter((x) => x.r.checks.length > 0 && x.r.verdict !== "unlikely" && x.r.checks.some((c) => c.status === "pass"))
        .slice(0, 6),
    [visas, code, profile],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={code} onChange={(e) => setCode(e.target.value)} className="h-9 rounded-lg border bg-background px-2 text-sm">
          {visas.map((v) => (
            <option key={v.code} value={v.code}>
              {v.code} · {v.name}
            </option>
          ))}
        </select>
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", VERDICT[result.verdict].cls)}>{VERDICT[result.verdict].label}</span>
        {result.points ? (
          <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium tabular-nums", result.points.pass ? "bg-emerald-500/12 text-emerald-700" : "bg-muted text-foreground/80")}>
            {result.points.total} points{result.points.complete ? "" : "+"}
          </span>
        ) : null}
        <Link href={`/app/visas/${encodeURIComponent(code)}`} className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:underline">
          Visa details
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <ul className="grid content-start gap-1.5">
          {result.checks.length ? (
            result.checks.map((c) => {
              const I = ICON[c.status];
              const q = qs.find(([id]) => id === c.id);
              return (
                <li key={c.id} className="flex items-start gap-2.5 rounded-lg border bg-card px-3 py-2">
                  <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full", I.cls)}>
                    <I.icon className="size-3" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-medium">{c.label}</span>
                    <span className="block text-[12px] text-muted-foreground">{c.detail}</span>
                  </span>
                  {q ? (
                    <span className="flex shrink-0 gap-1">
                      {([true, false] as const).map((v) => (
                        <button
                          key={String(v)}
                          type="button"
                          onClick={() => setAnswers((x) => ({ ...x, [code]: { ...a, [c.id]: a[c.id] === v ? undefined : v } }))}
                          className={cn("rounded-md border px-2 py-0.5 text-[11px]", a[c.id] === v ? (v ? "border-emerald-500 bg-emerald-500/10 text-emerald-700" : "border-rose-500 bg-rose-500/10 text-rose-700") : "text-muted-foreground")}
                        >
                          {v ? "Yes" : "No"}
                        </button>
                      ))}
                    </span>
                  ) : null}
                </li>
              );
            })
          ) : (
            <li className="rounded-lg border border-dashed p-4 text-center text-[13px] text-muted-foreground">No screening rules for this visa yet. Use the requirements on its visa page.</li>
          )}
        </ul>

        <div className="grid content-start gap-3">
          {isPointsTested(code) && result.points ? (
            <div className="grid gap-2 rounded-xl border bg-card p-3">
              <p className="text-[13px] font-semibold">Points estimate</p>
              {result.points.parts.slice(0, 2).map((p) => (
                <p key={p.label} className="flex text-[12px]">
                  <span className="text-muted-foreground">{p.label} (from record)</span>
                  <span className="ml-auto tabular-nums">{p.pts ?? "?"}</span>
                </p>
              ))}
              {POINT_FACTORS.map((f) => (
                <label key={f.key} className="grid gap-0.5 text-[12px]">
                  <span className="text-muted-foreground">{f.label}</span>
                  <select value={pts[f.key] ?? ""} onChange={(e) =>
                      setPts((x) => {
                        const rest = { ...x };
                        delete rest[f.key];
                        return e.target.value === "" ? rest : { ...rest, [f.key]: Number(e.target.value) };
                      })
                    } className="h-8 rounded-md border bg-background px-1.5 text-[12px]">
                    <option value="">Not known</option>
                    {f.choices.map(([l, v]) => (
                      <option key={l} value={v}>
                        {l} · {v}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              {result.points.parts.slice(2 + POINT_FACTORS.length).map((p) => (
                <p key={p.label} className="flex text-[12px]">
                  <span className="text-muted-foreground">{p.label}</span>
                  <span className="ml-auto tabular-nums">+{p.pts}</span>
                </p>
              ))}
              <p className="flex border-t pt-2 text-[13px] font-semibold">
                Total <span className="ml-auto tabular-nums">{result.points.total}</span>
              </p>
              <Link href="/app/updates?tab=rounds" className="text-[11px] text-muted-foreground underline">
                Compare with the latest invitation cut-offs
              </Link>
            </div>
          ) : null}
          {news.length ? (
            <div className="grid gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <p className="flex items-center gap-1.5 text-[13px] font-semibold">
                <AlertTriangle className="size-3.5 text-amber-600" /> Recent changes
              </p>
              {news.map((n) => (
                <Link key={n.id} href="/app/updates" className="text-[12px] hover:underline">
                  {n.title}
                </Link>
              ))}
            </div>
          ) : null}
          {others.length ? (
            <div className="grid gap-1.5 rounded-xl border bg-card p-3">
              <p className="text-[13px] font-semibold">Also worth a look</p>
              {others.map((o) => (
                <button key={o.code} type="button" onClick={() => setCode(o.code)} className="flex items-center gap-2 text-left text-[12px] hover:underline">
                  <span className="font-mono text-[11px] text-muted-foreground">{o.code}</span> {o.name}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {aiOn ? (
        <div className="grid gap-2">
          <Button
            size="sm"
            variant="outline"
            className="w-fit"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await explainEligibility(clientId, result);
                if (!r.ok) toast.error(r.error);
                else setAi({ code, text: r.text });
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <Sparkles />} Explain with AI
          </Button>
          {ai && ai.code === code ? <div className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-3 text-[13px] leading-relaxed">{ai.text}</div> : null}
        </div>
      ) : null}
      <p className="text-[11px] text-muted-foreground">A screening aid built from the client record and your answers, not a full assessment. Criteria are simplified; check the legislation and Home Affairs guidance before advising.</p>
    </div>
  );
}
