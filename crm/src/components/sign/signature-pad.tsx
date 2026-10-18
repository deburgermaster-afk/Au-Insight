"use client";

import { Eraser, PenLine, Type } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SCRIPT = "'Snell Roundhand','Segoe Script','Bradley Hand','Brush Script MT','Apple Chancery',cursive";

/** Draw (finger, pen, mouse) or type a signature; returns a trimmed PNG data URL. */
export function SignaturePad({ kind, defaultText, onDone, onCancel }: { kind: "signature" | "initials"; defaultText: string; onDone: (png: string) => void; onCancel?: () => void }) {
  const [mode, setMode] = useState<"draw" | "type">("draw");
  const [text, setText] = useState(kind === "initials" ? defaultText.split(/\s+/).map((w) => w[0]?.toUpperCase() ?? "").join("") : defaultText);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const [drawn, setDrawn] = useState(false);

  const fit = useCallback(() => {
    const el = canvas.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    el.width = r.width * ratio;
    el.height = r.height * ratio;
    const ctx = el.getContext("2d")!;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#0f172a";
    setDrawn(false);
  }, []);

  useEffect(() => {
    if (mode !== "draw") return;
    // Wait a frame so the drawer has its final size.
    const t = requestAnimationFrame(fit);
    window.addEventListener("resize", fit);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("resize", fit);
    };
  }, [mode, fit]);

  const pt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as [number, number];
  };

  /** Crops the drawing to its ink so it fills the field when stamped. */
  const trimmed = (src: HTMLCanvasElement) => {
    const ctx = src.getContext("2d")!;
    const { width, height } = src;
    const data = ctx.getImageData(0, 0, width, height).data;
    let x0 = width, y0 = height, x1 = 0, y1 = 0;
    for (let y = 0; y < height; y += 2)
      for (let x = 0; x < width; x += 2)
        if (data[(y * width + x) * 4 + 3] > 20) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    if (x1 <= x0 || y1 <= y0) return null;
    const pad = 8;
    const out = document.createElement("canvas");
    out.width = Math.min(width, x1 - x0 + pad * 2);
    out.height = Math.min(height, y1 - y0 + pad * 2);
    out.getContext("2d")!.drawImage(src, x0 - pad, y0 - pad, out.width, out.height, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  const typed = () => {
    const c = document.createElement("canvas");
    const size = kind === "initials" ? 72 : 64;
    const ctx = c.getContext("2d")!;
    ctx.font = `${size}px ${SCRIPT}`;
    const w = Math.ceil(ctx.measureText(text).width) + 24;
    c.width = Math.max(40, w);
    c.height = Math.round(size * 1.5);
    ctx.font = `${size}px ${SCRIPT}`;
    ctx.fillStyle = "#0f172a";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 12, c.height / 2);
    return trimmed(c);
  };

  const ready = mode === "draw" ? drawn : text.trim().length > (kind === "initials" ? 0 : 2);

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-1 rounded-full bg-muted p-1 text-[13px]">
        {(["draw", "type"] as const).map((m) => (
          <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full py-1.5 font-medium transition", mode === m ? "bg-background shadow-sm" : "text-muted-foreground")}>
            {m === "draw" ? <PenLine className="size-3.5" /> : <Type className="size-3.5" />} {m === "draw" ? "Draw" : "Type"}
          </button>
        ))}
      </div>
      {mode === "draw" ? (
        <div className="grid gap-1.5">
          <div className="relative">
            <canvas
              ref={canvas}
              data-vaul-no-drag
              aria-label={kind === "initials" ? "Initials pad" : "Signature pad"}
              className={cn("w-full touch-none rounded-xl border-2 border-dashed bg-white", kind === "initials" ? "h-32" : "h-44", drawn ? "border-emerald-500/60" : "border-border")}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                last.current = pt(e);
                const ctx = e.currentTarget.getContext("2d")!;
                const [x, y] = last.current;
                ctx.lineWidth = 2.4;
                ctx.beginPath();
                ctx.arc(x, y, 1.1, 0, Math.PI * 2);
                ctx.fillStyle = "#0f172a";
                ctx.fill();
              }}
              onPointerMove={(e) => {
                if (!drawing.current || !last.current) return;
                const ctx = e.currentTarget.getContext("2d")!;
                const [x, y] = pt(e);
                const [lx, ly] = last.current;
                // Thinner when moving fast: reads more like ink.
                const speed = Math.hypot(x - lx, y - ly);
                ctx.lineWidth = Math.max(1.4, 3 - speed / 18);
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.quadraticCurveTo(lx, ly, (lx + x) / 2, (ly + y) / 2);
                ctx.lineTo(x, y);
                ctx.stroke();
                last.current = [x, y];
                setDrawn(true);
              }}
              onPointerUp={() => (drawing.current = false)}
              onPointerCancel={() => (drawing.current = false)}
            />
            <span className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-slate-300" />
            <span className="pointer-events-none absolute bottom-9 left-6 text-lg text-slate-300">×</span>
          </div>
          <div className="flex items-center justify-between text-[12px] text-muted-foreground">
            <span>{kind === "initials" ? "Draw your initials" : "Sign with your finger or mouse"}</span>
            <button type="button" onClick={fit} className="inline-flex items-center gap-1">
              <Eraser className="size-3.5" /> Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === "initials" ? "Initials" : "Full name"} className="h-11" autoFocus />
          <div className="grid h-24 place-items-center overflow-hidden rounded-xl border bg-white px-4 text-slate-900" style={{ fontFamily: SCRIPT, fontSize: kind === "initials" ? 40 : 34 }}>
            {text || " "}
          </div>
        </div>
      )}
      <div className="flex gap-2">
        {onCancel ? (
          <Button variant="outline" className="h-11 flex-1 rounded-full" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        <Button
          className="h-11 flex-[2] rounded-full"
          disabled={!ready}
          onClick={() => {
            const png = mode === "draw" ? (canvas.current ? trimmed(canvas.current) : null) : typed();
            if (png) onDone(png);
          }}
        >
          Adopt and apply
        </Button>
      </div>
    </div>
  );
}
