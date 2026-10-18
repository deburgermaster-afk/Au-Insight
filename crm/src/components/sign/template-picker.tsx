"use client";

import { CheckCircle2, Eye, FileText, Search, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { type ConsentTemplate, consentGroups, consentTemplates } from "@/lib/consent-templates";
import { recommendTemplates } from "@/lib/sign-actions";
import { cn } from "@/lib/utils";
import { PdfPages } from "./pdf-pages";

type Pick = { key: string; reason: string };

const matches = (t: ConsentTemplate, q: string) => {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const hay = `${t.title} ${t.summary} ${t.group} ${t.key}`.toLowerCase();
  return words.every((w) => hay.includes(w));
};

/**
 * The consent form library: search, the forms this case needs now on top (ranked from the case,
 * with the AI's reasons), then every form by group. Each form can be previewed as the exact PDF.
 */
export function TemplatePicker({ clientId, matterId, onPick, hrefBase, busy, compact }: { clientId?: string; matterId?: string; onPick?: (key: string) => void; hrefBase?: string; busy?: boolean; compact?: boolean }) {
  const [q, setQ] = useState("");
  const [rec, setRec] = useState<{ picks: Pick[]; done: string[]; method: "ai" | "rules" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<ConsentTemplate | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const hrefFor = hrefBase ? (key: string) => `${hrefBase}${key}` : null;

  useEffect(() => {
    if (!clientId) return;
    let live = true;
    // Loading state is set by the effect itself; the ranking is fetched for the chosen case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    recommendTemplates(clientId, matterId || null).then((r) => {
      if (!live) return;
      setRec(r.ok ? { picks: r.picks, done: r.done, method: r.method } : null);
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [clientId, matterId]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  const shown = useMemo(() => consentTemplates.filter((t) => matches(t, q)), [q]);
  const recKeys = new Set(rec?.picks.map((p) => p.key) ?? []);
  const recommended = (rec?.picks ?? []).map((p) => ({ t: consentTemplates.find((t) => t.key === p.key)!, reason: p.reason })).filter((x) => x.t && matches(x.t, q));
  const previewUrl = (key: string) => `/api/sign/preview?template=${key}${clientId ? `&client=${clientId}` : ""}${matterId ? `&matter=${matterId}` : ""}`;

  const Row = ({ t, reason }: { t: ConsentTemplate; reason?: string }) => {
    const done = rec?.done.includes(t.key);
    const body = (
      <>
        <FileText className={cn("mt-0.5 size-4 shrink-0", reason ? "text-[var(--chart-2)]" : "text-muted-foreground")} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-medium">
            {t.title}
            {done ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/12 px-1.5 py-px text-[10px] font-medium text-emerald-600">
                <CheckCircle2 className="size-2.5" /> Sent
              </span>
            ) : null}
          </span>
          <span className="block text-xs text-muted-foreground">{reason ?? t.summary}</span>
        </span>
      </>
    );
    return (
      <li className={cn("group flex items-start gap-1 rounded-lg border border-transparent transition hover:border-border hover:bg-muted/30", reason && "border-[var(--chart-2)]/25 bg-[var(--chart-2)]/[0.04]")}>
        {hrefFor ? (
          <Link href={hrefFor(t.key)} className="flex min-w-0 flex-1 items-start gap-2.5 p-2.5">
            {body}
          </Link>
        ) : (
          <button type="button" disabled={busy} onClick={() => onPick?.(t.key)} className="flex min-w-0 flex-1 items-start gap-2.5 p-2.5 text-left disabled:opacity-60">
            {body}
          </button>
        )}
        <Button type="button" size="xs" variant="ghost" className="m-1.5 shrink-0 text-muted-foreground opacity-70 group-hover:opacity-100" onClick={() => setPreview(t)} aria-label={`Preview ${t.title}`}>
          <Eye /> Preview
        </Button>
      </li>
    );
  };

  return (
    <div className="grid gap-4">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${consentTemplates.length} consent forms`} className="h-10 pr-16 pl-9" />
        {q ? (
          <button type="button" onClick={() => setQ("")} className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground" aria-label="Clear search">
            <X className="size-4" />
          </button>
        ) : (
          <kbd className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground">/</kbd>
        )}
      </div>

      {clientId ? (
        <section className="grid gap-1.5">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-[var(--chart-2)] uppercase">
            <Sparkles className="size-3.5" /> Recommended for this case
            {rec ? <span className="font-normal normal-case tracking-normal text-muted-foreground">· {rec.method === "ai" ? "ranked by AI from the case" : "from the case's stage, visa and gaps"}</span> : null}
          </p>
          {loading ? (
            <div className="grid gap-1.5">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14 rounded-lg" />
              ))}
            </div>
          ) : recommended.length ? (
            <ul className="grid gap-1">
              {recommended.map(({ t, reason }) => (
                <Row key={t.key} t={t} reason={reason} />
              ))}
            </ul>
          ) : (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">{q ? "No recommended forms match the search." : "Nothing outstanding for this case. Every form is below."}</p>
          )}
        </section>
      ) : null}

      <section className="grid gap-3">
        {clientId ? <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{q ? "Search results" : "All consent forms"}</p> : null}
        {consentGroups.map((g) => {
          const list = shown.filter((t) => t.group === g && (q || !recKeys.has(t.key)));
          if (!list.length) return null;
          return (
            <div key={g} className="grid gap-1">
              <p className="px-1 text-[11px] font-medium text-muted-foreground">{g}</p>
              <ul className={cn("grid gap-1", !compact && "sm:grid-cols-2")}>
                {list.map((t) => (
                  <Row key={t.key} t={t} />
                ))}
              </ul>
            </div>
          );
        })}
        {!shown.length ? <p className="py-6 text-center text-sm text-muted-foreground">No forms match &ldquo;{q}&rdquo;.</p> : null}
      </section>

      <Dialog open={Boolean(preview)} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="grid max-h-[92dvh] w-[min(56rem,96vw)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-3 p-4 sm:max-w-none">
          <DialogHeader>
            <DialogTitle className="pr-8 text-base">{preview?.title}</DialogTitle>
            <p className="text-xs text-muted-foreground">{clientId ? "Filled in for this client and matter, exactly as they'll receive it." : "Your agency and agent are filled in; the client details are placeholders."}</p>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto rounded-lg bg-muted/40 p-3">{preview ? <PdfPages url={previewUrl(preview.key)} /> : null}</div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={preview ? previewUrl(preview.key) : "#"} target="_blank" rel="noreferrer">
                Open PDF
              </a>
            </Button>
            {preview && (onPick || hrefFor) ? (
              hrefFor ? (
                <Button size="sm" asChild>
                  <Link href={hrefFor(preview.key)}>Use this form</Link>
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    const k = preview.key;
                    setPreview(null);
                    onPick?.(k);
                  }}
                >
                  Use this form
                </Button>
              )
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
