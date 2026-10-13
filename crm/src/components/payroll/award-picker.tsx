"use client";

import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { Row, TextField } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { lookupAwardRates } from "@/lib/payroll-integration-actions";
import type { AwardRate } from "@/lib/payroll-integrations";
import { cn } from "@/lib/utils";

/** Awards most migration and education agencies use. */
export const COMMON_AWARDS = [
  { code: "MA000002", name: "Clerks—Private Sector Award 2020" },
  { code: "MA000116", name: "Legal Services Award 2020" },
  { code: "MA000077", name: "Educational Services (Post-Secondary Education) Award 2020" },
];

type Defaults = { awardCode: string; awardName: string; classification: string; classificationRate: string };

/** Picks an award classification and its official minimum hourly rate from the Fair Work Commission. */
export function AwardPicker({ connected, defaults }: { connected: boolean; defaults: Defaults }) {
  const [code, setCode] = useState(defaults.awardCode || "MA000002");
  const [name, setName] = useState(defaults.awardName);
  const [cls, setCls] = useState(defaults.classification);
  const [rate, setRate] = useState(defaults.classificationRate);
  const [rates, setRates] = useState<AwardRate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const look = () =>
    start(async () => {
      setError(null);
      const r = await lookupAwardRates(code);
      if (!r.ok) return setError(r.error);
      setRates(r.rates);
      setName(r.name ?? COMMON_AWARDS.find((a) => a.code === code)?.name ?? code);
      if (!r.rates.length) setError("No current adult rates came back for that award.");
    });
  return (
    <div className="grid gap-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid flex-1 gap-1.5">
          <Label htmlFor="awardCode">Award</Label>
          <input id="awardCode" name="awardCode" list="awards" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="h-9 rounded-md border bg-transparent px-3 text-sm" placeholder="MA000002" />
          <datalist id="awards">
            {COMMON_AWARDS.map((a) => (
              <option key={a.code} value={a.code}>
                {a.name}
              </option>
            ))}
          </datalist>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={look} disabled={!connected || pending} title={connected ? "Get official rates from Fair Work" : "Connect Fair Work pay rates in Settings → Payroll"}>
          {pending ? <Loader2 className="animate-spin" /> : <Search />} Official rates
        </Button>
      </div>
      <input type="hidden" name="awardName" value={name} />
      {!connected ? <p className="text-[11px] text-muted-foreground">Connect Fair Work pay rates (free key) in Settings → Payroll → Integrations to pick from the official, current award rates. Until then, enter the classification and its minimum rate.</p> : null}
      {error ? <p className="text-[12px] text-rose-500">{error}</p> : null}
      {rates?.length ? (
        <ul className="grid max-h-56 gap-1 overflow-y-auto">
          {rates.map((r) => (
            <li key={`${r.parent}|${r.classification}`}>
              <button
                type="button"
                onClick={() => {
                  setCls([r.parent, r.classification].filter(Boolean).join(" · "));
                  setRate(r.hourly ? r.hourly.toFixed(2) : "");
                }}
                className={cn("flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12px] hover:bg-muted", cls.endsWith(r.classification) && "bg-muted")}
              >
                <span className="min-w-0 truncate">
                  {r.parent ? <span className="text-muted-foreground">{r.parent} · </span> : null}
                  {r.classification}
                </span>
                <span className="shrink-0 tabular-nums">
                  {r.hourly ? `$${r.hourly.toFixed(2)}/h` : ""}
                  {r.weekly ? <span className="text-muted-foreground"> · ${r.weekly.toFixed(2)}/wk</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Row>
        <TextField label="Classification" name="classification" value={cls} onChange={(e) => setCls(e.target.value)} placeholder="Level 2" />
        <TextField label="Award minimum ($/hour)" name="classificationRate" value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" hint="Pay runs warn if the rate is below this" />
      </Row>
    </div>
  );
}
