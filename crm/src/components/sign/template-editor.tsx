"use client";

import { ArrowLeft, Eye, EyeOff, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CONSENT_VARS, type ConsentTemplate, consentGroups } from "@/lib/consent-templates";
import { resetTemplate, saveTemplate, setTemplateHidden, type TemplateInput } from "@/lib/template-actions";
import { PdfPages } from "./pdf-pages";

const BLANK = `## About this consent
I consent to {agencyLegal} ...

## What this covers
This consent covers the matter above only. I can withdraw it at any time in writing.`;

/** Edit an agency's wording for a consent form (or write its own), with a live PDF preview. */
export function TemplateEditor({ templateKey, initial, original }: { templateKey: string; initial: (ConsentTemplate & { disabled?: boolean }) | null; original: ConsentTemplate | null }) {
  const router = useRouter();
  const [v, setV] = useState<TemplateInput>({
    title: initial?.title ?? "",
    group: (initial?.group ?? "Engagement") as TemplateInput["group"],
    summary: initial?.summary ?? "",
    body: initial?.body ?? BLANK,
    checkboxes: initial?.checkboxes ?? [],
    textField: initial?.textField ?? null,
    initials: Boolean(initial?.initials),
    countersign: Boolean(initial?.countersign),
  });
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const body = useRef<HTMLTextAreaElement>(null);
  const set = <K extends keyof TemplateInput>(k: K, val: TemplateInput[K]) => setV((x) => ({ ...x, [k]: val }));

  // Debounced live preview of the unsaved wording.
  useEffect(() => {
    const t = setTimeout(async () => {
      const res = await fetch("/api/sign/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
      if (!res.ok) return;
      const url = URL.createObjectURL(await res.blob());
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
    }, 700);
    return () => clearTimeout(t);
  }, [v]);

  const insertVar = (k: string) => {
    const el = body.current;
    if (!el) return set("body", `${v.body}{${k}}`);
    const [a, b] = [el.selectionStart, el.selectionEnd];
    set("body", `${v.body.slice(0, a)}{${k}}${v.body.slice(b)}`);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(a + k.length + 2, a + k.length + 2);
    });
  };

  const save = () =>
    start(async () => {
      const r = await saveTemplate(templateKey, v);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Saved. New requests use this wording.");
      if (templateKey === "new") router.replace(`/app/sign/templates/${r.id}`);
      else router.refresh();
    });

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section className="grid content-start gap-3 rounded-xl border bg-card p-4">
        <Link href="/app/sign" className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowLeft className="size-3.5" /> E-sign
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold">{templateKey === "new" ? "New consent template" : "Edit consent template"}</h1>
          {initial?.edited ? <span className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] text-sky-600">Your wording</span> : null}
          {initial?.disabled ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Hidden from the library</span> : null}
        </div>
        <label className="grid gap-1 text-[13px]">
          <span className="text-muted-foreground">Title</span>
          <Input value={v.title} onChange={(e) => set("title", e.target.value)} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-[13px]">
            <span className="text-muted-foreground">Group</span>
            <select value={v.group} onChange={(e) => set("group", e.target.value as TemplateInput["group"])} className="h-9 rounded-md border bg-background px-2 text-sm">
              {consentGroups.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-[13px]">
            <span className="text-muted-foreground">One-line summary</span>
            <Input value={v.summary} onChange={(e) => set("summary", e.target.value)} />
          </label>
        </div>
        <div className="grid gap-1 text-[13px]">
          <span className="text-muted-foreground">Wording · start a section with &ldquo;## &rdquo;; a blank line starts a new paragraph. The parties panel is added for you.</span>
          <div className="flex flex-wrap gap-1">
            {Object.entries(CONSENT_VARS).map(([k, label]) => (
              <button key={k} type="button" title={label} onClick={() => insertVar(k)} className="rounded-md border bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] hover:bg-muted">
                {`{${k}}`}
              </button>
            ))}
          </div>
          <Textarea ref={body} value={v.body} onChange={(e) => set("body", e.target.value)} rows={18} className="font-mono text-[12.5px] leading-relaxed" />
        </div>
        <div className="grid gap-2 rounded-lg border p-3 text-[13px]">
          <p className="font-medium">Tick boxes for the client</p>
          {v.checkboxes.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={c.label} onChange={(e) => set("checkboxes", v.checkboxes.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-8 flex-1" placeholder="I consent to…" />
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" className="accent-foreground" checked={Boolean(c.required)} onChange={(e) => set("checkboxes", v.checkboxes.map((x, j) => (j === i ? { ...x, required: e.target.checked } : x)))} /> Required
              </label>
              <Button size="icon-xs" variant="ghost" onClick={() => set("checkboxes", v.checkboxes.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash2 />
              </Button>
            </div>
          ))}
          {v.checkboxes.length < 8 ? (
            <Button size="xs" variant="outline" className="justify-self-start" onClick={() => set("checkboxes", [...v.checkboxes, { id: `c${Date.now().toString(36)}`, label: "", required: true }])}>
              <Plus /> Add tick box
            </Button>
          ) : null}
          <label className="mt-1 flex items-center gap-2">
            <input type="checkbox" className="accent-foreground" checked={Boolean(v.textField)} onChange={(e) => set("textField", e.target.checked ? { id: "text", label: "Details", required: true } : null)} /> A line for the client to fill in
          </label>
          {v.textField ? <Input value={v.textField.label} onChange={(e) => set("textField", { ...v.textField!, label: e.target.value })} className="h-8" placeholder="What they write, e.g. name of the third party" /> : null}
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-foreground" checked={v.initials} onChange={(e) => set("initials", e.target.checked)} /> Client initials on every page
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="accent-foreground" checked={v.countersign} onChange={(e) => set("countersign", e.target.checked)} /> The registered agent countersigns
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={save} disabled={pending} className="rounded-full">
            {pending ? <Loader2 className="animate-spin" /> : <Save />} Save
          </Button>
          {templateKey !== "new" ? (
            <>
              <Button
                variant="outline"
                className="rounded-full"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await setTemplateHidden(templateKey, !initial?.disabled, v);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success(initial?.disabled ? "Shown in the library again." : "Hidden from the library.");
                    router.refresh();
                  })
                }
              >
                {initial?.disabled ? <Eye /> : <EyeOff />} {initial?.disabled ? "Show in library" : "Hide from library"}
              </Button>
              {initial?.edited || initial?.custom ? (
                <Button
                  variant="ghost"
                  className="rounded-full text-rose-600"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!confirm(initial?.custom ? "Delete this template?" : "Go back to Lodgely's wording? Your changes will be lost.")) return;
                      const r = await resetTemplate(templateKey);
                      if (!r.ok) return void toast.error(r.error);
                      if (initial?.custom) router.push("/app/sign");
                      else if (original) {
                        setV({ title: original.title, group: original.group, summary: original.summary, body: original.body, checkboxes: original.checkboxes ?? [], textField: original.textField ?? null, initials: Boolean(original.initials), countersign: Boolean(original.countersign) });
                        router.refresh();
                      }
                    })
                  }
                >
                  {initial?.custom ? <Trash2 /> : <RotateCcw />} {initial?.custom ? "Delete template" : "Reset to Lodgely wording"}
                </Button>
              ) : null}
            </>
          ) : null}
        </div>
      </section>
      <section className="grid content-start gap-2 xl:sticky xl:top-16">
        <p className="text-xs text-muted-foreground">Live preview (sample client; your agency and agent are filled in)</p>
        <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-xl bg-muted/40 p-3">{preview ? <PdfPages key={preview} url={preview} /> : <p className="p-10 text-center text-sm text-muted-foreground">Preparing preview…</p>}</div>
      </section>
    </div>
  );
}
