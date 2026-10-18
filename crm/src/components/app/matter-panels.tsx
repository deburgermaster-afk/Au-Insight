"use client";

import { Download, FileText } from "lucide-react";
import { useMemo, useState } from "react";
import { type CheckView, DocCheckBadge } from "@/components/ai/doc-check-badge";
import { EditRecord } from "@/components/edit/edit-record";
import { fileUrl } from "@/components/mail/file-icon";
import type { EditOptions } from "@/lib/edit-data";
import { relativeDays } from "@/lib/format";
import { cn } from "@/lib/utils";

export type PanelDoc = {
  id: string;
  name: string;
  category: string | null;
  storageKey: string | null;
  source: string | null;
  createdAt: string;
  expiresAt: string | null;
  checklistLabel: string | null;
  check: CheckView;
  values: Record<string, string | number | boolean | string[] | null>;
};

/** Every file on the case: filter by category or "from client", open, download, AI-check, edit, delete. */
export function DocumentsPanel({ docs, aiDocs, options, caps }: { docs: PanelDoc[]; aiDocs: boolean; options: EditOptions; caps: string[] }) {
  const [filter, setFilter] = useState<string>("all");
  const cats = useMemo(() => [...new Set(docs.map((d) => d.category ?? "Other"))].sort(), [docs]);
  const fromClient = docs.filter((d) => d.source === "portal").length;
  const unlinked = docs.filter((d) => !d.checklistLabel).length;
  const shown = docs.filter((d) =>
    filter === "all" ? true : filter === "client" ? d.source === "portal" : filter === "unlinked" ? !d.checklistLabel : (d.category ?? "Other") === filter,
  );
  if (!docs.length) return <p className="text-sm text-muted-foreground">No files yet. Upload here, from a checklist item, or ask the client through their portal.</p>;
  const chip = (key: string, label: string, n: number) => (
    <button
      key={key}
      type="button"
      onClick={() => setFilter(key)}
      className={cn("rounded-full border px-2.5 py-1 text-xs transition", filter === key ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}
    >
      {label} <span className="tabular-nums opacity-70">{n}</span>
    </button>
  );
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-1.5">
        {chip("all", "All", docs.length)}
        {fromClient ? chip("client", "From client", fromClient) : null}
        {unlinked ? chip("unlinked", "Not on checklist", unlinked) : null}
        {cats.map((c) => chip(c, c, docs.filter((d) => (d.category ?? "Other") === c).length))}
      </div>
      <ul className="grid gap-1.5">
        {shown.map((d) => {
          const expired = d.expiresAt && new Date(d.expiresAt) < new Date();
          return (
            <li key={d.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                {d.storageKey ? (
                  <a href={fileUrl(d.storageKey, d.name)} target="_blank" rel="noreferrer" className="block truncate hover:underline">
                    {d.name}
                  </a>
                ) : (
                  <span className="block truncate">{d.name}</span>
                )}
                <span className="block truncate text-xs text-muted-foreground" suppressHydrationWarning>
                  {[d.category, d.checklistLabel ? `for: ${d.checklistLabel}` : "not on checklist", d.source === "portal" ? "from client" : null, relativeDays(d.createdAt)].filter(Boolean).join(" · ")}
                  {d.expiresAt ? <span className={cn(expired && "text-red-500")}> · {expired ? "expired" : "expires"} {d.expiresAt}</span> : null}
                </span>
              </span>
              <DocCheckBadge documentId={d.id} check={d.check} aiOn={aiDocs} />
              {d.storageKey ? (
                <a href={fileUrl(d.storageKey, d.name, true)} aria-label={`Download ${d.name}`} className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Download className="size-3.5" />
                </a>
              ) : null}
              <EditRecord entity="document" id={d.id} values={d.values} options={options} caps={caps} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
