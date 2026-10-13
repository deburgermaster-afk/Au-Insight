"use client";

import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { checkImport, importClients } from "@/lib/client-import-actions";
import { type FieldKey, guessMapping, IMPORT_FIELDS, type ImportRow, parseCsv, toClient } from "@/lib/client-import";
import { cn } from "@/lib/utils";

type Match = { id: string; name: string; reason: string } | null;
const TEMPLATE = "First name,Last name,Email,Phone,Date of birth,Nationality,Passport number,Passport expiry,Current visa,Visa expiry,Occupation,Stage,Source,Notes\nPriya,Nair,priya@example.com,0412 345 678,14/02/1994,India,N1234567,03/05/2030,500,30/06/2027,Registered Nurse,Active,Referral,\n";
const save = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = name;
  a.click();
};
const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

export function ImportWizard() {
  const [step, setStep] = useState<"upload" | "map" | "review" | "done">("upload");
  const [fileName, setFileName] = useState("");
  const [grid, setGrid] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(FieldKey | null)[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [onDup, setOnDup] = useState<"skip" | "update" | "create">("skip");
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ created: number; updated: number; skipped: number; problems: { line: number; name: string; error: string }[] } | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  const headers = grid[0] ?? [];
  const body = grid.slice(1);
  const rows: ImportRow[] = useMemo(() => body.map((cells, i) => toClient(cells, mapping, i + 2)), [body, mapping]);
  const nameMapped = mapping.includes("fullName") || (mapping.includes("firstName") && mapping.includes("lastName")) || mapping.includes("lastName") || mapping.includes("firstName");

  // Repeats inside the file itself (same email / passport / name+DOB as an earlier row).
  const repeats = useMemo(() => {
    const seen = new Map<string, number>();
    return rows.map((r, i) => {
      const keys = [r.values.email && `e:${r.values.email}`, r.values.passportNumber && `p:${r.values.passportNumber}`, r.values.dateOfBirth && `n:${r.values.firstName.toLowerCase()}|${r.values.lastName.toLowerCase()}|${r.values.dateOfBirth}`].filter(Boolean) as string[];
      const hit = keys.map((k) => seen.get(k)).find((x) => x !== undefined);
      for (const k of keys) if (!seen.has(k)) seen.set(k, i);
      return hit === undefined ? null : rows[hit].line;
    });
  }, [rows]);

  const load = async (f: File) => {
    const text = await f.text();
    const g = parseCsv(text);
    if (g.length < 2) return void toast.error("That file has no rows to import. Save it from Excel as CSV and try again.");
    if (g.length > 5001) return void toast.error("Up to 5,000 clients per file. Split it into smaller files.");
    setFileName(f.name);
    setGrid(g);
    setMapping(guessMapping(g[0]));
    setStep("map");
  };

  const review = () =>
    start(async () => {
      const r = await checkImport(rows.map((x) => x.values));
      if (!r.ok) return void toast.error(r.error);
      setMatches(r.matches);
      setStep("review");
    });

  const good = rows.filter((r) => !r.errors.length);
  const dupCount = rows.filter((r, i) => !r.errors.length && (matches[i] || repeats[i])).length;

  const run = () =>
    start(async () => {
      const send = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => !r.errors.length && !(repeats[i] && onDup === "skip"));
      const problems = rows.filter((r) => r.errors.length).map((r) => ({ line: r.line, name: `${r.values.firstName} ${r.values.lastName}`.trim(), error: r.errors.join("; ") }));
      let created = 0;
      let updated = 0;
      let skipped = rows.filter((r, i) => !r.errors.length && repeats[i] && onDup === "skip").length;
      setProgress(0);
      for (let k = 0; k < send.length; k += 200) {
        const batch = send.slice(k, k + 200);
        const res = await importClients(batch.map(({ r }) => r.values), onDup);
        if (!res.ok) {
          toast.error(("error" in res && res.error) || "Import stopped.");
          break;
        }
        created += res.created ?? 0;
        updated += res.updated ?? 0;
        skipped += res.skipped ?? 0;
        for (const f of res.failed ?? []) problems.push({ line: batch[f.index].r.line, name: `${batch[f.index].r.values.firstName} ${batch[f.index].r.values.lastName}`, error: f.error });
        setProgress(Math.round(((k + batch.length) / Math.max(1, send.length)) * 100));
      }
      setResult({ created, updated, skipped, problems });
      setProgress(null);
      setStep("done");
    });

  const steps = ["Upload", "Match columns", "Review", "Done"];
  const at = ["upload", "map", "review", "done"].indexOf(step);

  return (
    <div className="grid max-w-5xl gap-5">
      <ol className="flex flex-wrap items-center gap-2 text-[12px]">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span className={cn("grid size-6 place-items-center rounded-full border text-[11px]", i < at ? "border-emerald-500 bg-emerald-500 text-white" : i === at ? "border-foreground font-semibold" : "text-muted-foreground")}>{i < at ? "✓" : i + 1}</span>
            <span className={i === at ? "font-medium" : "text-muted-foreground"}>{s}</span>
            {i < steps.length - 1 ? <span className="h-px w-6 bg-border" /> : null}
          </li>
        ))}
      </ol>

      {step === "upload" ? (
        <div className="grid gap-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) void load(f);
            }}
            className="grid place-items-center gap-3 rounded-2xl border-2 border-dashed bg-card px-6 py-14 text-center transition hover:bg-muted/30"
          >
            <span className="grid size-12 place-items-center rounded-2xl bg-muted">
              <Upload className="size-5" />
            </span>
            <span className="text-sm font-medium">Drop a CSV file here, or click to choose</span>
            <span className="text-[12px] text-muted-foreground">From Excel or Google Sheets: File → Save as / Download → CSV. Up to 5,000 clients.</span>
          </button>
          <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <Button size="sm" variant="outline" className="rounded-full" onClick={() => save("lodgely-clients-template.csv", TEMPLATE)}>
              <Download /> Template
            </Button>
            Column names don&apos;t have to match: you&apos;ll match them in the next step. Dates can be 14/02/1994, 1994-02-14 or 14 Feb 1994.
          </div>
        </div>
      ) : null}

      {step === "map" ? (
        <div className="grid gap-4">
          <p className="flex items-center gap-2 text-sm">
            <FileSpreadsheet className="size-4 text-muted-foreground" /> <b className="font-medium">{fileName}</b> · {body.length} rows, {headers.length} columns
          </p>
          <div className="overflow-hidden rounded-2xl border bg-card">
            <table className="w-full text-[13px]">
              <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">Column in your file</th>
                  <th className="px-2 py-2 font-medium">Examples</th>
                  <th className="w-56 px-4 py-2 font-medium">Lodgely field</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {headers.map((h, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2 font-medium">{h || `Column ${i + 1}`}</td>
                    <td className="max-w-0 truncate px-2 py-2 text-muted-foreground">{body.slice(0, 3).map((r) => r[i]).filter(Boolean).join(" · ")}</td>
                    <td className="px-4 py-2">
                      <select
                        value={mapping[i] ?? ""}
                        onChange={(e) => {
                          const v = (e.target.value || null) as FieldKey | null;
                          setMapping(mapping.map((m, j) => (j === i ? v : m === v && v ? null : m)));
                        }}
                        className={cn("h-8 w-full rounded-lg border bg-background px-2 text-[13px]", !mapping[i] && "text-muted-foreground")}
                      >
                        <option value="">Don&apos;t import</option>
                        {IMPORT_FIELDS.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!nameMapped ? <p className="text-[13px] text-amber-500">Match at least a name column (Full name, or First and Last name).</p> : null}
          <div className="flex justify-between gap-2">
            <Button variant="ghost" className="rounded-full" onClick={() => setStep("upload")}>
              <ArrowLeft /> Another file
            </Button>
            <Button className="rounded-full" disabled={!nameMapped || pending} onClick={review}>
              {pending ? <Loader2 className="animate-spin" /> : null} Review <ArrowRight />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { n: good.length - dupCount, label: "New clients", tone: "text-emerald-500" },
              { n: dupCount, label: "Already in Lodgely or repeated", tone: "text-sky-500" },
              { n: rows.filter((r) => !r.errors.length && r.warnings.length).length, label: "With warnings", tone: "text-amber-500" },
              { n: rows.filter((r) => r.errors.length).length, label: "Can't import", tone: "text-rose-500" },
            ].map((x) => (
              <div key={x.label} className="rounded-2xl border bg-card p-4">
                <p className={cn("text-2xl font-semibold tabular-nums", x.tone)}>{x.n}</p>
                <p className="text-[12px] text-muted-foreground">{x.label}</p>
              </div>
            ))}
          </div>
          {dupCount ? (
            <div className="grid gap-2 rounded-2xl border bg-card p-4 text-[13px]">
              <p className="font-medium">When a row matches a client you already have (same email, passport, or name and date of birth)</p>
              {(
                [
                  ["skip", "Skip it", "Leave the existing client as it is."],
                  ["update", "Fill in the gaps", "Add details the existing client is missing. Nothing already there is overwritten."],
                  ["create", "Create anyway", "Make a separate client (you can merge later under Duplicates)."],
                ] as const
              ).map(([v, t, d]) => (
                <label key={v} className="flex items-start gap-2.5">
                  <input type="radio" name="dup" className="mt-1 accent-foreground" checked={onDup === v} onChange={() => setOnDup(v)} />
                  <span>
                    <span className="font-medium">{t}</span> <span className="text-muted-foreground">{d}</span>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-2xl border bg-card">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-14 px-4 py-2 font-medium">Row</th>
                  <th className="px-2 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Date of birth</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.slice(0, 100).map((r, i) => (
                  <tr key={r.line}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{r.line}</td>
                    <td className="px-2 py-2">
                      {r.values.firstName} {r.values.lastName}
                    </td>
                    <td className="max-w-0 truncate px-2 py-2 text-muted-foreground">{r.values.email ?? "—"}</td>
                    <td className="px-2 py-2 text-muted-foreground">{r.values.dateOfBirth ?? "—"}</td>
                    <td className="px-4 py-2 text-[12px]">
                      {r.errors.length ? (
                        <span className="inline-flex items-center gap-1 text-rose-500">
                          <XCircle className="size-3.5" /> {r.errors.join("; ")}
                        </span>
                      ) : matches[i] ? (
                        <span className="text-sky-500">
                          {matches[i]!.reason} as{" "}
                          <Link href={`/app/clients/${matches[i]!.id}`} target="_blank" className="underline">
                            {matches[i]!.name}
                          </Link>
                        </span>
                      ) : repeats[i] ? (
                        <span className="text-sky-500">Repeats row {repeats[i]}</span>
                      ) : r.warnings.length ? (
                        <span className="inline-flex items-center gap-1 text-amber-500" title={r.warnings.join("\n")}>
                          <AlertTriangle className="size-3.5" /> {r.warnings[0]}
                          {r.warnings.length > 1 ? ` +${r.warnings.length - 1}` : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-emerald-500">
                          <CheckCircle2 className="size-3.5" /> Ready
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 100 ? <p className="border-t px-4 py-2 text-[12px] text-muted-foreground">Showing the first 100 of {rows.length} rows.</p> : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" className="rounded-full" disabled={pending} onClick={() => setStep("map")}>
              <ArrowLeft /> Columns
            </Button>
            <div className="flex items-center gap-3">
              {progress != null ? (
                <span className="flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span className="h-1.5 w-32 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
                  </span>
                  {progress}%
                </span>
              ) : null}
              <Button className="rounded-full" disabled={pending || !good.length} onClick={run}>
                {pending ? <Loader2 className="animate-spin" /> : <Upload />} Import {good.length} client{good.length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === "done" && result ? (
        <div className="grid gap-4">
          <div className="flex items-start gap-3 rounded-2xl border border-emerald-500/30 bg-card p-5">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-emerald-500" />
            <div>
              <p className="text-base font-semibold">Import finished</p>
              <p className="text-[13px] text-muted-foreground">
                {result.created} created · {result.updated} updated · {result.skipped} skipped{result.problems.length ? ` · ${result.problems.length} couldn't be imported` : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="rounded-full">
              <Link href="/app/clients">See clients</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/app/clients/duplicates">Check for duplicates</Link>
            </Button>
            {result.problems.length ? (
              <Button variant="outline" className="rounded-full" onClick={() => save("import-problems.csv", ["Row,Name,Problem", ...result.problems.map((p) => [p.line, p.name, p.error].map(csvCell).join(","))].join("\n"))}>
                <Download /> Rows that weren&apos;t imported
              </Button>
            ) : null}
            <Button variant="ghost" className="rounded-full" onClick={() => (setStep("upload"), setGrid([]), setResult(null))}>
              Import another file
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
