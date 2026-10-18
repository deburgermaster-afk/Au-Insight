"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * A thin bar at the top that starts the instant a link is clicked and finishes when the new page
 * is on screen, so every navigation feels immediate even while the server renders.
 */
export function NavProgress() {
  const pathname = usePathname();
  const [p, setP] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const start = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      setP(0.08);
      if (timer.current) clearInterval(timer.current);
      // Eases towards 90% and waits there for the page.
      timer.current = setInterval(() => setP((x) => (x == null ? x : x + (0.9 - x) * 0.12)), 120);
      // Same-path links (only the query changes) don't change the pathname: finish after a moment.
      if (url.pathname === location.pathname) setTimeout(() => setP((x) => (x == null ? x : 1)), 600);
      else setTimeout(() => setP((x) => (x == null || x >= 1 ? x : 1)), 10000);
    };
    document.addEventListener("click", start, true);
    return () => document.removeEventListener("click", start, true);
  }, []);

  // The new page is on screen: finish the bar (state adjusted during render, React's pattern for this).
  const [seen, setSeen] = useState(pathname);
  if (seen !== pathname) {
    setSeen(pathname);
    if (p != null) setP(1);
  }
  useEffect(() => {
    if (p !== 1) return;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    const t = setTimeout(() => setP(null), 260);
    return () => clearTimeout(t);
  }, [p]);

  if (p == null) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div className="h-full bg-gradient-to-r from-[var(--chart-2)] to-primary shadow-[0_0_8px_var(--chart-2)] transition-[width,opacity] duration-200 ease-out" style={{ width: `${p * 100}%`, opacity: p >= 1 ? 0 : 1 }} />
    </div>
  );
}
