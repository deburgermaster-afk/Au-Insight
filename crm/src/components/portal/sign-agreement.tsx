"use client";

import { Check, Eraser, Loader2, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signAgreement } from "@/lib/agreement-actions";
import { cn } from "@/lib/utils";

/** Signature pad (finger, pen or mouse) plus the two confirmations and the typed name. */
export function SignAgreement({ id, expectedName }: { id: string; expectedName: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [drawn, setDrawn] = useState(false);
  const [name, setName] = useState("");
  const [guide, setGuide] = useState(false);
  const [agree, setAgree] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const el = canvas.current!;
    const fit = () => {
      const r = el.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      el.width = r.width * ratio;
      el.height = r.height * ratio;
      const ctx = el.getContext("2d")!;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2.2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111827";
      setDrawn(false);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const clear = () => {
    const el = canvas.current!;
    el.getContext("2d")!.clearRect(0, 0, el.width, el.height);
    setDrawn(false);
  };
  const ready = drawn && name.trim().length > 2 && guide && agree;

  return (
    <section className="grid gap-3 rounded-2xl border bg-card p-3.5">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <PenLine className="size-4" /> Sign
      </p>
      <label className="flex items-start gap-2.5 text-[13px]">
        <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={guide} onChange={(e) => setGuide(e.target.checked)} />
        I have received the Consumer Guide from my registered migration agent.
      </label>
      <label className="flex items-start gap-2.5 text-[13px]">
        <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        I have read this agreement, including the fee estimate, and I agree to it.
      </label>
      <label className="grid gap-1.5 text-[13px]">
        <span className="text-muted-foreground">Full name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={expectedName} autoComplete="name" className="h-10" />
      </label>
      <div className="grid gap-1.5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-muted-foreground">Draw your signature</span>
          <button type="button" onClick={clear} className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <Eraser className="size-3.5" /> Clear
          </button>
        </div>
        <canvas
          ref={canvas}
          aria-label="Signature pad"
          className={cn("h-36 w-full touch-none rounded-xl border-2 border-dashed bg-white", drawn ? "border-emerald-500/60" : "border-border")}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drawing.current = true;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = point(e);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 0.1, y + 0.1);
            ctx.stroke();
          }}
          onPointerMove={(e) => {
            if (!drawing.current) return;
            const ctx = e.currentTarget.getContext("2d")!;
            const [x, y] = point(e);
            ctx.lineTo(x, y);
            ctx.stroke();
            setDrawn(true);
          }}
          onPointerUp={() => (drawing.current = false)}
          onPointerCancel={() => (drawing.current = false)}
        />
      </div>
      <Button
        className="h-11 rounded-full text-[15px]"
        disabled={!ready || pending}
        onClick={() =>
          start(async () => {
            const r = await signAgreement(id, { name, signature: canvas.current!.toDataURL("image/png"), guide, agree });
            if (!r.ok) return void toast.error(r.error);
            toast.success("Signed. A copy is in your documents.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Check />} Sign agreement
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground">Signing electronically is the same as signing on paper. We record the time, your sign-in and device with your signature, and you&apos;ll get a signed PDF.</p>
    </section>
  );
}
