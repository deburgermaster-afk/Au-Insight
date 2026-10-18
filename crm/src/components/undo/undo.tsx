"use client";

import { useRouter } from "next/navigation";
import { Redo2, Undo2 } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { undoAudit } from "@/lib/record-actions";

// App-wide undo/redo for record changes. Every save, add or remove that returns an undo token is
// pushed here: the toast offers Undo, and Ctrl/⌘+Z (Ctrl/⌘+Shift+Z or Ctrl+Y to redo) works anywhere
// outside a text field. Tokens are audit entries; undoing one returns a token that redoes it.

type Entry = { token: string; label: string };
const past: Entry[] = [];
let future: Entry[] = [];
let refresh: (() => void) | null = null;
const MAX = 30;
const listeners = new Set<() => void>();
let version = 0;
const changed = () => {
  version++;
  for (const l of listeners) l();
};

async function run(e: Entry, dir: "undo" | "redo") {
  const r = await undoAudit(e.token);
  if (!r.ok) {
    toast.error(r.error);
    return;
  }
  const next = { token: r.undo ?? "", label: e.label };
  if (next.token) {
    if (dir === "undo") future.push(next);
    else past.push(next);
  }
  changed();
  refresh?.();
  toast.success(dir === "undo" ? `Undone: ${e.label}` : `Redone: ${e.label}`, {
    action: next.token ? { label: dir === "undo" ? "Redo" : "Undo", onClick: () => void (dir === "undo" ? redo() : undo()) } : undefined,
  });
}

export async function undo() {
  const e = past.pop();
  changed();
  if (!e) return void toast("Nothing to undo");
  await run(e, "undo");
}
export async function redo() {
  const e = future.pop();
  changed();
  if (!e) return void toast("Nothing to redo");
  await run(e, "redo");
}

/** Records an undoable change and shows a toast with Undo. */
export function undoable(token: string | undefined, label: string, message = label) {
  if (!token) return void toast.success(message);
  past.push({ token, label });
  if (past.length > MAX) past.shift();
  future = [];
  changed();
  toast.success(message, { action: { label: "Undo", onClick: () => void undo() }, description: "⌘Z to undo" });
}

const typing = (el: Element | null) => !!el && (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el as HTMLElement).isContentEditable);

/** Mount once in the app shell: keyboard shortcuts and page refresh after an undo. */
export function UndoShortcuts() {
  const router = useRouter();
  useEffect(() => {
    refresh = () => router.refresh();
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.metaKey || ev.ctrlKey) || typing(document.activeElement)) return;
      const k = ev.key.toLowerCase();
      if (k === "z" && !ev.shiftKey && past.length) {
        ev.preventDefault();
        void undo();
      } else if (((k === "z" && ev.shiftKey) || k === "y") && future.length) {
        ev.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      refresh = null;
    };
  }, [router]);
  return null;
}

/** Undo / redo buttons for the app header; disabled when there's nothing to undo or redo. */
export function UndoButtons() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  const btn = "grid size-8 place-items-center rounded-lg border bg-card text-muted-foreground transition hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground";
  return (
    <>
      <button type="button" aria-label="Undo" title={past.at(-1) ? `Undo ${past.at(-1)!.label} (⌘Z)` : "Nothing to undo"} disabled={!past.length} onClick={() => void undo()} className={btn}>
        <Undo2 className="size-4" />
      </button>
      <button type="button" aria-label="Redo" title={future.at(-1) ? `Redo ${future.at(-1)!.label} (⇧⌘Z)` : "Nothing to redo"} disabled={!future.length} onClick={() => void redo()} className={btn}>
        <Redo2 className="size-4" />
      </button>
    </>
  );
}
