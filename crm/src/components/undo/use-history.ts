"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Undo/redo for an editor's state. Rapid changes (typing) are grouped into one step; ⌘Z / ⇧⌘Z
 * (Ctrl+Z / Ctrl+Y) work while focus is inside the editor element passed as `scope`.
 */
export function useHistory<T>(initial: T, opts: { groupMs?: number; limit?: number } = {}) {
  const { groupMs = 700, limit = 100 } = opts;
  const [h, setH] = useState<{ past: T[]; present: T; future: T[] }>({ past: [], present: initial, future: [] });
  const last = useRef(0);

  const set = useCallback(
    (next: T | ((v: T) => T)) => {
      const now = Date.now();
      // Start a new undo step unless this change follows the last one closely (typing).
      const group = now - last.current <= groupMs;
      last.current = now;
      setH((cur) => {
        const v = typeof next === "function" ? (next as (v: T) => T)(cur.present) : next;
        if (Object.is(v, cur.present)) return cur;
        const past = group && cur.past.length ? cur.past : [...cur.past, cur.present].slice(-limit);
        return { past, present: v, future: [] };
      });
    },
    [groupMs, limit],
  );

  const undo = useCallback(() => {
    last.current = 0;
    setH((cur) => (cur.past.length ? { past: cur.past.slice(0, -1), present: cur.past[cur.past.length - 1], future: [cur.present, ...cur.future] } : cur));
  }, []);

  const redo = useCallback(() => {
    last.current = 0;
    setH((cur) => (cur.future.length ? { past: [...cur.past, cur.present], present: cur.future[0], future: cur.future.slice(1) } : cur));
  }, []);

  /** Replace without recording (e.g. after saving). */
  const reset = useCallback((v: T) => setH({ past: [], present: v, future: [] }), []);

  return { value: h.present, set, undo, redo, reset, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

/** Binds ⌘Z / ⇧⌘Z / Ctrl+Y to undo/redo while focus is inside `ref`. */
export function useUndoKeys(ref: React.RefObject<HTMLElement | null>, undo: () => void, redo: () => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((k === "z" && e.shiftKey) || k === "y") {
        e.preventDefault();
        redo();
      }
    };
    el.addEventListener("keydown", onKey);
    return () => el.removeEventListener("keydown", onKey);
  }, [ref, undo, redo]);
}
