"use client";

import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowConfig } from "@/db/crm-schema";
import type { ActionResult } from "@/lib/actions";
import { visas } from "@/lib/visas";
import { checklistFor, DEFAULT_LISTS, listOf } from "@/lib/workflow";
import { saveWorkflow } from "@/lib/workflow-actions";
import { useConfigure } from "./configure";

const sel = "h-9 w-full rounded-md border bg-transparent px-2 text-sm";

function useSave() {
  const [pending, start] = useTransition();
  const popup = useConfigure();
  const router = useRouter();
  const save = (fn: () => Promise<ActionResult>, ok = "Saved", close = true) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(ok);
      if (close) popup?.close();
      router.refresh();
    });
  return { pending, save };
}

type Row = { category: string; label: string; required: boolean; k: number };

/** The checklist each new case of a visa starts with: change wording, add, remove, reorder. */
export function ChecklistEditor({ workflow, initialVisa }: { workflow: WorkflowConfig; initialVisa?: string }) {
  const [code, setCode] = useState(initialVisa ?? visas[0].code);
  const load = (c: string) => checklistFor(workflow, c).items.map((i, k) => ({ ...i, k }));
  const [rows, setRows] = useState<Row[]>(load(code));
  const own = Boolean(workflow.checklists?.[code]?.length);
  const { pending, save } = useSave();
  const set = (k: number, patch: Partial<Row>) => setRows((x) => x.map((r) => (r.k === k ? { ...r, ...patch } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((x) => {
      const y = [...x];
      const j = i + d;
      if (j < 0 || j >= y.length) return x;
      [y[i], y[j]] = [y[j], y[i]];
      return y;
    });
  const cats = listOf(workflow, "documentCategories");
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={code} onChange={(e) => (setCode(e.target.value), setRows(load(e.target.value)))} className={`${sel} max-w-sm`}>
          {visas.map((v) => (
            <option key={v.code} value={v.code}>
              {v.code} · {v.name}
              {workflow.checklists?.[v.code]?.length ? " (customised)" : ""}
            </option>
          ))}
        </select>
        <span className="text-[12px] text-muted-foreground">{own ? "Your version" : "Lodgely's version. Edit to make it yours."}</span>
      </div>
      <ul className="grid max-h-[50dvh] gap-1.5 overflow-y-auto pr-1">
        {rows.map((r, i) => (
          <li key={r.k} className="grid grid-cols-[140px_1fr_auto_auto_auto_auto] items-center gap-1.5">
            <select value={r.category} onChange={(e) => set(r.k, { category: e.target.value })} className="h-8 rounded-md border bg-transparent px-1.5 text-[12px]">
              {[...new Set([r.category, ...cats])].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <Input value={r.label} onChange={(e) => set(r.k, { label: e.target.value })} className="h-8 text-[13px]" />
            <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Required">
              <Checkbox checked={r.required} onCheckedChange={(c) => set(r.k, { required: c === true })} /> Req.
            </label>
            <Button size="icon-xs" variant="ghost" onClick={() => move(i, -1)} aria-label="Up">
              <ArrowUp />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => move(i, 1)} aria-label="Down">
              <ArrowDown />
            </Button>
            <Button size="icon-xs" variant="ghost" onClick={() => setRows((x) => x.filter((y) => y.k !== r.k))} aria-label="Remove">
              <X />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setRows((x) => [...x, { category: "Other", label: "", required: true, k: Date.now() }])}>
          <Plus /> Add document
        </Button>
        {own ? (
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => save(() => saveWorkflow({ kind: "checklist", visaCode: code, items: null }), "Back to Lodgely's checklist", false)}>
            <RotateCcw /> Reset to Lodgely&apos;s
          </Button>
        ) : null}
        <Button
          className="ml-auto rounded-full"
          disabled={pending}
          onClick={() => save(() => saveWorkflow({ kind: "checklist", visaCode: code, items: rows.filter((r) => r.label.trim()).map((r) => ({ category: r.category, label: r.label.trim(), required: r.required })) }), `Checklist for ${code} saved`, false)}
        >
          {pending ? <Loader2 className="animate-spin" /> : null} Save checklist
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Applies to new cases and when a case changes visa. Existing checklists aren&apos;t changed.</p>
    </div>
  );
}

/** Default professional fee and government charge per visa, filled in when a case opens. */
export function FeesEditor({ workflow }: { workflow: WorkflowConfig }) {
  const [fees, setFees] = useState<Record<string, { professional: string; government: string }>>(Object.fromEntries(visas.map((v) => [v.code, { professional: workflow.fees?.[v.code]?.professional?.toString() ?? "", government: workflow.fees?.[v.code]?.government?.toString() ?? "" }])));
  const [q, setQ] = useState("");
  const { pending, save } = useSave();
  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[$,]/g, "")));
  return (
    <div className="grid gap-3">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a visa" className="h-8 max-w-xs" />
      <div className="max-h-[55dvh] overflow-y-auto rounded-xl border">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 bg-muted text-left text-[11px] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Visa</th>
              <th className="px-2 py-2">Professional fee</th>
              <th className="px-2 py-2">Government charge</th>
            </tr>
          </thead>
          <tbody>
            {visas
              .filter((v) => !q || `${v.code} ${v.name}`.toLowerCase().includes(q.toLowerCase()))
              .map((v) => (
                <tr key={v.code} className="border-t">
                  <td className="px-3 py-1.5">
                    <span className="font-medium">{v.code}</span> <span className="text-muted-foreground">{v.name}</span>
                  </td>
                  {(["professional", "government"] as const).map((k) => (
                    <td key={k} className="px-2 py-1.5">
                      <Input value={fees[v.code][k]} onChange={(e) => setFees((f) => ({ ...f, [v.code]: { ...f[v.code], [k]: e.target.value } }))} inputMode="decimal" placeholder="—" className="h-8 w-32" />
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <Button
        className="justify-self-end rounded-full"
        disabled={pending}
        onClick={() => {
          const out: Record<string, { professional: number | null; government: number | null }> = {};
          for (const [k, v] of Object.entries(fees)) {
            const p = num(v.professional);
            const g = num(v.government);
            if ((p != null && !Number.isFinite(p)) || (g != null && !Number.isFinite(g))) return void toast.error(`Check the fees for ${k}.`);
            out[k] = { professional: p, government: g };
          }
          save(() => saveWorkflow({ kind: "fees", fees: out }), "Fee schedule saved");
        }}
      >
        {pending ? <Loader2 className="animate-spin" /> : null} Save fees
      </Button>
    </div>
  );
}

/** Who new cases go to when nobody's chosen: rules by visa, then round robin, least busy, or whoever opens it. */
export function AssignmentEditor({ workflow, staff }: { workflow: WorkflowConfig; staff: { value: string; label: string }[] }) {
  const a = workflow.assignment;
  const [on, setOn] = useState(Boolean(a));
  const [rules, setRules] = useState((a?.rules ?? []).map((r, k) => ({ ...r, k })));
  const [fallback, setFallback] = useState<"creator" | "round_robin" | "least_busy">(a?.fallback ?? "least_busy");
  const [pool, setPool] = useState<string[]>(a?.pool ?? staff.map((x) => x.value));
  const { pending, save } = useSave();
  return (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-[13px]">
        <Checkbox checked={on} onCheckedChange={(c) => setOn(c === true)} /> Assign new cases automatically when no case officer is chosen
      </label>
      {on ? (
        <>
          <div className="grid gap-1.5">
            <Label>Rules (first match wins)</Label>
            {rules.map((r) => (
              <div key={r.k} className="grid grid-cols-[150px_1fr_auto] items-center gap-2">
                <Input value={r.match} onChange={(e) => setRules((x) => x.map((y) => (y.k === r.k ? { ...y, match: e.target.value } : y)))} placeholder="190 or 82*" className="h-8" />
                <select value={r.userId} onChange={(e) => setRules((x) => x.map((y) => (y.k === r.k ? { ...y, userId: e.target.value } : y)))} className="h-8 rounded-md border bg-transparent px-2 text-[13px]">
                  {staff.map((x) => (
                    <option key={x.value} value={x.value}>
                      {x.label}
                    </option>
                  ))}
                </select>
                <Button size="icon-xs" variant="ghost" onClick={() => setRules((x) => x.filter((y) => y.k !== r.k))}>
                  <X />
                </Button>
              </div>
            ))}
            <Button size="sm" variant="outline" className="justify-self-start" onClick={() => setRules((x) => [...x, { match: "", userId: staff[0]?.value ?? "", k: Date.now() }])}>
              <Plus /> Add rule
            </Button>
            <p className="text-[11px] text-muted-foreground">Match a subclass (190), a family with * (82* for 820/801), or a code like 500.</p>
          </div>
          <div className="grid gap-1.5">
            <Label>Otherwise</Label>
            <select value={fallback} onChange={(e) => setFallback(e.target.value as typeof fallback)} className={`${sel} max-w-sm`}>
              <option value="least_busy">The person with the fewest open cases</option>
              <option value="round_robin">Take turns (round robin)</option>
              <option value="creator">Whoever opens the case</option>
            </select>
          </div>
          {fallback !== "creator" ? (
            <div className="grid gap-1.5">
              <Label>Who&apos;s in the rotation</Label>
              <div className="grid gap-1 sm:grid-cols-2">
                {staff.map((x) => (
                  <label key={x.value} className="flex items-center gap-2 text-[13px]">
                    <Checkbox checked={pool.includes(x.value)} onCheckedChange={(c) => setPool((p) => (c === true ? [...p, x.value] : p.filter((y) => y !== x.value)))} /> {x.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <Button
        className="justify-self-end rounded-full"
        disabled={pending}
        onClick={() => save(() => saveWorkflow({ kind: "assignment", assignment: on ? { rules: rules.filter((r) => r.match.trim()).map((r) => ({ match: r.match.trim(), userId: r.userId })), fallback, pool } : null }), "Assignment saved")}
      >
        {pending ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </div>
  );
}

const LIST_LABELS: Record<keyof typeof DEFAULT_LISTS, string> = { sources: "Where clients come from", tags: "Client tags", documentCategories: "Document categories", outcomes: "Case outcomes" };

/** The agency's own pick lists and case reference prefix. */
export function ListsEditor({ workflow }: { workflow: WorkflowConfig }) {
  const [lists, setLists] = useState(Object.fromEntries((Object.keys(DEFAULT_LISTS) as (keyof typeof DEFAULT_LISTS)[]).map((k) => [k, listOf(workflow, k).join("\n")])) as Record<keyof typeof DEFAULT_LISTS, string>);
  const [prefix, setPrefix] = useState(workflow.referencePrefix ?? "");
  const { pending, save } = useSave();
  const split = (s: string) => [...new Set(s.split("\n").map((x) => x.trim()).filter(Boolean))];
  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(DEFAULT_LISTS) as (keyof typeof DEFAULT_LISTS)[]).map((k) => (
          <div key={k} className="grid gap-1.5">
            <Label>{LIST_LABELS[k]}</Label>
            <Textarea value={lists[k]} onChange={(e) => setLists((l) => ({ ...l, [k]: e.target.value }))} rows={7} className="text-[13px]" />
            <p className="text-[11px] text-muted-foreground">One per line</p>
          </div>
        ))}
      </div>
      <div className="grid max-w-xs gap-1.5">
        <Label>Case reference prefix</Label>
        <Input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="LDG" maxLength={8} />
        <p className="text-[11px] text-muted-foreground">New cases are numbered {prefix || "LDG"}-{new Date().getFullYear()}-0001</p>
      </div>
      <Button
        className="justify-self-end rounded-full"
        disabled={pending}
        onClick={() => save(() => saveWorkflow({ kind: "lists", lists: { sources: split(lists.sources), tags: split(lists.tags), documentCategories: split(lists.documentCategories), outcomes: split(lists.outcomes) }, referencePrefix: prefix }), "Lists saved")}
      >
        {pending ? <Loader2 className="animate-spin" /> : null} Save
      </Button>
    </div>
  );
}
