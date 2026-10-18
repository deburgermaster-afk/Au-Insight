"use client";

import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";

type Size = { w: number; h: number };

/**
 * Renders every page of a PDF to canvases (pdf.js via unpdf, in the browser) and lets the caller
 * draw an overlay on each page. Overlays use page fractions, so they line up at any width.
 */
export function PdfPages({ url, overlay, onPageClick, className }: { url: string; overlay?: (page: number, size: Size) => ReactNode; onPageClick?: (page: number, x: number, y: number) => void; className?: string }) {
  const [loaded, setLoaded] = useState<{ doc: { getPage(n: number): Promise<unknown> }; sizes: Size[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(res.status === 403 ? "You don't have access to this document." : "Couldn't load the document.");
        const data = new Uint8Array(await res.arrayBuffer());
        const { getDocumentProxy } = await import("unpdf");
        const doc = await getDocumentProxy(data);
        if (cancelled) return;
        const sizes: Size[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const p = await doc.getPage(i);
          const vp = p.getViewport({ scale: 1 });
          sizes.push({ w: vp.width, h: vp.height });
        }
        if (!cancelled) setLoaded({ doc: doc as never, sizes });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the document.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) return <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{error}</p>;
  if (!loaded)
    return (
      <div className="grid place-items-center gap-2 rounded-xl border border-dashed p-10 text-sm text-muted-foreground">
        <Loader2 className="size-5 animate-spin" /> Opening the document…
      </div>
    );
  return (
    <div className={className ?? "grid gap-4"}>
      {loaded.sizes.map((size, i) => (
        <Page key={i} n={i + 1} size={size} doc={loaded.doc} overlay={overlay} onPageClick={onPageClick} />
      ))}
    </div>
  );
}

function Page({ n, size, doc, overlay, onPageClick }: { n: number; size: Size; doc: { getPage(n: number): Promise<unknown> }; overlay?: (page: number, size: Size) => ReactNode; onPageClick?: (page: number, x: number, y: number) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(n <= 2);

  // Render pages as they come near the screen; long PDFs stay light.
  useEffect(() => {
    if (visible || !box.current) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { rootMargin: "800px" });
    io.observe(box.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let task: { cancel(): void; promise: Promise<void> } | null = null;
    let stop = false;
    (async () => {
      const page = (await doc.getPage(n)) as { getViewport(o: { scale: number }): { width: number; height: number }; render(o: object): { cancel(): void; promise: Promise<void> } };
      const el = canvas.current;
      if (!el || stop) return;
      const cssW = el.parentElement!.clientWidth || size.w;
      const scale = (cssW / size.w) * Math.min(2, window.devicePixelRatio || 1);
      const vp = page.getViewport({ scale });
      el.width = Math.floor(vp.width);
      el.height = Math.floor(vp.height);
      task = page.render({ canvasContext: el.getContext("2d")!, viewport: vp, canvas: el });
      await task.promise.catch(() => {});
    })();
    return () => {
      stop = true;
      task?.cancel();
    };
  }, [visible, doc, n, size.w]);

  return (
    <div
      ref={box}
      data-page={n}
      className="relative w-full overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/10"
      style={{ aspectRatio: `${size.w} / ${size.h}` }}
      onClick={(e) => {
        if (!onPageClick || e.target !== e.currentTarget.querySelector("canvas")) return;
        const r = e.currentTarget.getBoundingClientRect();
        onPageClick(n, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      <canvas ref={canvas} className="absolute inset-0 size-full" />
      {overlay?.(n, size)}
    </div>
  );
}
