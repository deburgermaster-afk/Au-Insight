"use client";

import { upload } from "@vercel/blob/client";
import { Check, CloudUpload, FileText, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { portalAttach } from "@/lib/portal-actions";
import { cn } from "@/lib/utils";

type Item = { id: string; category: string; label: string; required: boolean; status: string; files: string[] };
const done = (s: string) => s === "received" || s === "approved" || s === "waived";

export function PortalUploads({ token, agencyId, linkId, items: initial }: { token: string; agencyId: string; linkId: string; items: Item[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = items.filter((i) => !done(i.status) || i.files.length);
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const i of open) m.set(i.category, [...(m.get(i.category) ?? []), i]);
    return [...m.entries()];
  }, [open]);
  const required = items.filter((i) => i.required);
  const complete = required.filter((i) => done(i.status)).length;

  async function send(itemId: string | null, files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    setBusy(itemId ?? "other");
    try {
      for (const f of Array.from(files)) {
        const blob = await upload(`agency/${agencyId}/portal/${linkId}/${f.name.replace(/[^\w.\- ()]+/g, "_")}`, f, {
          access: "private",
          handleUploadUrl: "/api/upload",
          clientPayload: JSON.stringify({ token }),
          contentType: f.type || undefined,
        });
        const r = await portalAttach(token, itemId, { name: f.name, size: f.size, type: f.type || "application/octet-stream", key: blob.pathname });
        if (!r.ok) throw new Error(r.error);
        setItems((list) => list.map((i) => (i.id === itemId ? { ...i, status: "received", files: [...i.files, f.name] } : i)));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-6 grid gap-5">
      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">
            {complete} of {required.length} required documents received
          </span>
          <span className="text-zinc-500">{Math.round((complete / Math.max(1, required.length)) * 100)}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
          <motion.div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-500" animate={{ width: `${(complete / Math.max(1, required.length)) * 100}%` }} />
        </div>
      </div>
      {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p> : null}
      {groups.map(([cat, rows]) => (
        <section key={cat}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">{cat}</h2>
          <div className="grid gap-2">
            {rows.map((i) => (
              <Row key={i.id} item={i} busy={busy === i.id} onFiles={(f) => send(i.id, f)} />
            ))}
          </div>
        </section>
      ))}
      <section>
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">Anything else</h2>
        <Row item={{ id: "other", category: "", label: "Other documents your agent asked for", required: false, status: "needed", files: [] }} busy={busy === "other"} onFiles={(f) => send(null, f)} />
      </section>
    </div>
  );
}

function Row({ item, busy, onFiles }: { item: Item; busy: boolean; onFiles: (f: FileList | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const ok = done(item.status);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles(e.dataTransfer.files);
      }}
      className={cn("rounded-2xl border bg-white p-4 transition", over ? "border-orange-400 ring-4 ring-orange-100" : ok ? "border-emerald-200" : "border-zinc-200")}
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", ok ? "bg-emerald-500 text-white" : "border border-zinc-300")}>{ok ? <Check className="size-3.5" /> : null}</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">
            {item.label}
            {!item.required ? <span className="ml-1 text-xs font-normal text-zinc-400">(if applicable)</span> : null}
          </p>
          <AnimatePresence>
            {item.files.map((f) => (
              <motion.p key={f} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                <FileText className="size-3.5" /> {f}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} accept="image/*,application/pdf,.doc,.docx,.heic" />
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy}
          className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition", ok ? "border border-zinc-200 text-zinc-700 hover:bg-zinc-50" : "bg-zinc-900 text-white hover:bg-zinc-800")}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
          {ok ? "Add more" : "Upload"}
        </button>
      </div>
    </div>
  );
}
