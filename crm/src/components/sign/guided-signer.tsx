"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, ChevronUp, Loader2, PenLine, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { SignField } from "@/db/crm-schema";
import { submitSignature } from "@/lib/sign-actions";
import { cn } from "@/lib/utils";
import { PdfPages } from "./pdf-pages";
import { SignaturePad } from "./signature-pad";

const today = () => new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "2-digit", year: "numeric" });
const verb: Record<SignField["type"], string> = { signature: "Sign", initials: "Initial", date: "Date", name: "Name", text: "Fill in", checkbox: "Tick" };

/**
 * The client's signing screen: the document with each field marked, and a guide bar that scrolls
 * to the next field one at a time. Signatures are drawn or typed once and applied to every
 * signature field after that.
 */
export function GuidedSigner({ id, pdfUrl, fields, expectedName }: { id: string; pdfUrl: string; fields: SignField[]; expectedName: string }) {
  const ordered = useMemo(() => [...fields].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x), [fields]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(null);
  const [editing, setEditing] = useState<SignField | null>(null);
  const [adopted, setAdopted] = useState<{ signature?: string; initials?: string }>({});
  const [text, setText] = useState("");
  const [finish, setFinish] = useState(false);
  const [name, setName] = useState(expectedName);
  const [agree, setAgree] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const isDone = useCallback((f: SignField) => (f.type === "checkbox" ? values[f.id] === "yes" || !f.required : Boolean(values[f.id])), [values]);
  const required = ordered.filter((f) => f.required || f.type !== "checkbox");
  const doneCount = required.filter(isDone).length;
  const allDone = ordered.every((f) => !f.required || isDone(f));
  const progress = required.length ? doneCount / required.length : 1;

  const scrollTo = (f: SignField) => {
    setActive(f.id);
    document.getElementById(`field-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const next = (from?: string) => {
    const idx = from ? ordered.findIndex((f) => f.id === from) : -1;
    const after = [...ordered.slice(idx + 1), ...ordered.slice(0, idx + 1)].find((f) => !isDone(f) && f.id !== from && (f.required || f.type !== "checkbox"));
    if (after) scrollTo(after);
    else {
      setActive(null);
      setFinish(true);
    }
  };
  const prev = () => {
    const idx = ordered.findIndex((f) => f.id === active);
    const before = ordered[(idx <= 0 ? ordered.length : idx) - 1];
    if (before) scrollTo(before);
  };
  const set = (f: SignField, v: string, advance = true) => {
    setValues((s) => ({ ...s, [f.id]: v }));
    if (advance && v) setTimeout(() => next(f.id), 250);
  };

  /** Tapping a field: apply what we can straight away, otherwise open the right editor. */
  const fill = (f: SignField) => {
    setActive(f.id);
    if (f.type === "checkbox") return set(f, values[f.id] === "yes" ? "" : "yes", values[f.id] !== "yes");
    if (f.type === "date") return set(f, values[f.id] || today());
    if ((f.type === "signature" || f.type === "initials") && adopted[f.type] && !values[f.id]) return set(f, adopted[f.type]!);
    setText(values[f.id] || (f.type === "name" ? expectedName : ""));
    setEditing(f);
  };

  return (
    <div className="grid gap-3">
      <div className="sticky top-12 z-20 -mx-3 border-b bg-background/90 px-3 py-2 backdrop-blur-xl">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="font-medium">
            {doneCount} of {required.length} done
          </span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
            <motion.div className="h-full rounded-full bg-emerald-500" animate={{ width: `${progress * 100}%` }} transition={{ type: "spring", stiffness: 140, damping: 22 }} />
          </div>
        </div>
      </div>

      <PdfPages
        url={pdfUrl}
        overlay={(page) =>
          ordered
            .filter((f) => f.page === page)
            .map((f) => {
              const v = values[f.id];
              const on = active === f.id;
              return (
                <button
                  key={f.id}
                  id={`field-${f.id}`}
                  type="button"
                  onClick={() => fill(f)}
                  aria-label={`${verb[f.type]}: ${f.label}`}
                  className={cn(
                    "absolute flex scroll-my-40 items-center justify-start overflow-visible rounded-[3px] text-left transition",
                    v ? "bg-emerald-400/10 ring-1 ring-emerald-500/50" : f.required ? "bg-amber-300/30 ring-1 ring-amber-500/70" : "bg-sky-300/20 ring-1 ring-sky-500/50",
                    on && "z-10 ring-2 ring-sky-600",
                  )}
                  style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                >
                  {on && !v ? <span className="absolute -inset-1 animate-ping rounded-md ring-2 ring-sky-500/40" /> : null}
                  {!v && on ? (
                    <span className="absolute -top-6 left-0 flex items-center gap-1 whitespace-nowrap rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                      <PenLine className="size-3" /> {verb[f.type]} here
                    </span>
                  ) : null}
                  {v && (f.type === "signature" || f.type === "initials") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={v} alt="" className="h-full w-auto max-w-full object-contain object-left" />
                  ) : v && f.type === "checkbox" ? (
                    <Check className="size-full text-sky-700" strokeWidth={3} />
                  ) : v ? (
                    <span className="truncate px-0.5 text-[clamp(7px,1.6vw,12px)] leading-none text-slate-900">{v}</span>
                  ) : f.type !== "checkbox" ? (
                    <span className="truncate px-1 text-[clamp(6px,1.4vw,10px)] font-medium leading-none text-amber-900/80">{f.required ? "" : "Optional · "}{f.label}</span>
                  ) : null}
                </button>
              );
            })
        }
      />

      {/* Guide bar */}
      <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-40 px-3 sm:bottom-24">
        <div className="mx-auto flex max-w-md items-center gap-2 rounded-2xl border bg-background/95 p-2 shadow-2xl backdrop-blur-xl">
          <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-xl" onClick={prev} aria-label="Previous field">
            <ChevronUp />
          </Button>
          <AnimatePresence mode="wait">
            {allDone ? (
              <motion.div key="finish" className="flex-1" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Button className="h-11 w-full rounded-xl bg-emerald-600 text-[15px] hover:bg-emerald-600/90" onClick={() => setFinish(true)}>
                  <Send /> Finish and send
                </Button>
              </motion.div>
            ) : (
              <motion.div key="next" className="flex-1" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Button
                  className="h-11 w-full rounded-xl text-[15px]"
                  onClick={() => {
                    const cur = ordered.find((f) => f.id === active);
                    if (cur && !isDone(cur)) {
                      // First tap scrolls there; the second fills it.
                      const el = document.getElementById(`field-${cur.id}`)?.getBoundingClientRect();
                      if (el && el.top > 60 && el.bottom < window.innerHeight - 120) fill(cur);
                      else scrollTo(cur);
                    } else next(active ?? undefined);
                  }}
                >
                  {(() => {
                    const cur = ordered.find((f) => f.id === active && !isDone(f));
                    return cur ? `${verb[cur.type]}: ${cur.label}`.slice(0, 34) : doneCount ? "Next field" : "Start signing";
                  })()}
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
          <Button variant="ghost" size="icon" className="size-10 shrink-0 rounded-xl" onClick={() => next(active ?? undefined)} aria-label="Next field">
            <ChevronDown />
          </Button>
        </div>
      </div>

      <Drawer open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent className="mx-auto max-w-lg">
          <DrawerHeader className="text-left">
            <DrawerTitle>{editing ? `${verb[editing.type]}: ${editing.label}` : ""}</DrawerTitle>
            <DrawerDescription>{editing?.type === "signature" ? "Your signature is applied to every place you need to sign." : editing?.type === "initials" ? "Applied to every place that needs your initials." : `Page ${editing?.page ?? ""}`}</DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-6">
            {editing && (editing.type === "signature" || editing.type === "initials") ? (
              <SignaturePad
                kind={editing.type}
                defaultText={expectedName}
                onCancel={() => setEditing(null)}
                onDone={(png) => {
                  const kind = editing.type as "signature" | "initials";
                  setAdopted((a) => ({ ...a, [kind]: png }));
                  const f = editing;
                  setEditing(null);
                  set(f, png);
                }}
              />
            ) : editing ? (
              <form
                className="grid gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = editing;
                  setEditing(null);
                  set(f, text.trim());
                }}
              >
                <Input value={text} onChange={(e) => setText(e.target.value)} autoFocus className="h-11" placeholder={editing.label} maxLength={300} />
                <Button type="submit" className="h-11 rounded-full" disabled={editing.required && !text.trim()}>
                  Apply
                </Button>
              </form>
            ) : null}
          </div>
        </DrawerContent>
      </Drawer>

      <Drawer open={finish} onOpenChange={setFinish}>
        <DrawerContent className="mx-auto max-w-lg">
          <DrawerHeader className="text-left">
            <DrawerTitle>Ready to send</DrawerTitle>
            <DrawerDescription>{allDone ? "Check your name and agree to sign electronically." : "A few required fields are still empty."}</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-3 px-4 pb-6">
            {allDone ? (
              <>
                <label className="grid gap-1.5 text-[13px]">
                  <span className="text-muted-foreground">Full name (as on your passport)</span>
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" autoComplete="name" />
                </label>
                <label className="flex items-start gap-2.5 text-[13px]">
                  <input type="checkbox" className="mt-0.5 size-4 accent-foreground" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
                  I agree that my electronic signature is the same as signing on paper, and I have read this document.
                </label>
                <Button
                  className="h-12 rounded-full bg-emerald-600 text-[15px] hover:bg-emerald-600/90"
                  disabled={!agree || name.trim().length < 3 || pending}
                  onClick={() =>
                    start(async () => {
                      const r = await submitSignature(id, { name, agree, values: Object.entries(values).map(([fid, value]) => ({ id: fid, value })) });
                      if (!r.ok) return void toast.error(r.error);
                      setFinish(false);
                      toast.success("Signed and sent. A copy is in your documents.");
                      router.refresh();
                    })
                  }
                >
                  {pending ? <Loader2 className="animate-spin" /> : <Send />} Sign and send
                </Button>
                <p className="text-[11px] leading-snug text-muted-foreground">We record the time, your sign-in, IP address and device with your signature, and add a signing record page to the PDF.</p>
              </>
            ) : (
              <Button
                className="h-11 rounded-full"
                onClick={() => {
                  setFinish(false);
                  next();
                }}
              >
                Take me to the next field
              </Button>
            )}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
