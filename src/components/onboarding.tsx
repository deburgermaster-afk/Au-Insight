"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "motion/react";
import { ArrowUpIcon, CheckIcon, ChevronRightIcon, FileTextIcon, ScaleIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { spring } from "@/lib/motion";

const slides = [
  {
    title: (
      <>
        Visa decisions,
        <br />
        <span className="font-serif italic">not guesses.</span>
      </>
    ),
    body: "Every answer is computed from the Migration Act, the Regulations and Home Affairs — and cites the exact clause.",
    art: <DecisionArt />,
  },
  {
    title: (
      <>
        The whole law,
        <br />
        <span className="font-serif italic">always current.</span>
      </>
    ),
    body: "Every visa page, every tab, every fold — re-read daily, with a history of what changed and when.",
    art: <LawArt />,
  },
  {
    title: (
      <>
        Your documents,
        <br />
        <span className="font-serif italic">only yours.</span>
      </>
    ),
    body: "Files are stored privately in Australia. The assistant can read them for you, and nothing else can.",
    art: <FolderArt />,
  },
];

export function Onboarding() {
  const router = useRouter();
  const [[index, direction], setPage] = useState<[number, number]>([0, 0]);
  const last = index === slides.length - 1;

  const go = (next: number) => {
    if (next < 0 || next >= slides.length) return;
    setPage([next, next > index ? 1 : -1]);
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x * Math.abs(info.velocity.x);
    if (swipe < -4000 || info.offset.x < -80) go(index + 1);
    else if (swipe > 4000 || info.offset.x > 80) go(index - 1);
  };

  return (
    <main className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden px-6 pt-safe pb-safe">
      <div className="flex h-12 items-center justify-end">
        <Link href="/sign-in" className="flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
          Skip <ChevronRightIcon className="size-4" />
        </Link>
      </div>

      <div className="relative flex flex-1 flex-col">
        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={index}
            custom={direction}
            variants={{
              enter: (d: number) => ({ x: d * 120, opacity: 0, scale: 0.96, filter: "blur(6px)" }),
              center: { x: 0, opacity: 1, scale: 1, filter: "blur(0px)" },
              exit: (d: number) => ({ x: d * -120, opacity: 0, scale: 0.96, filter: "blur(6px)" }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.soft}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.18}
            onDragEnd={onDragEnd}
            className="flex flex-1 cursor-grab touch-pan-y flex-col active:cursor-grabbing"
          >
            <div className="flex flex-1 items-center justify-center py-6">{slides[index].art}</div>
            <h1 className="text-[2.1rem] leading-[1.08] font-medium tracking-tight">{slides[index].title}</h1>
            <p className="mt-3 max-w-[34ch] text-[15px] leading-relaxed text-muted-foreground">{slides[index].body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="mt-6 mb-6 flex gap-1.5">
        {slides.map((_, i) => (
          <button key={i} onClick={() => go(i)} aria-label={`Slide ${i + 1}`} className="relative h-1.5 w-6 overflow-hidden rounded-full bg-muted">
            {i === index && <motion.span layoutId="dot" className="absolute inset-0 rounded-full bg-foreground" transition={spring.snappy} />}
          </button>
        ))}
      </div>

      <motion.div layout transition={spring.snappy} className="flex flex-col gap-2">
        <Button size="lg" className="h-13 rounded-full text-[15px]" onClick={() => (last ? router.push("/sign-up") : go(index + 1))}>
          {last ? "Create account" : "Continue"}
        </Button>
        <AnimatePresence>
          {last && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={spring.snappy}>
              <Button asChild size="lg" variant="secondary" className="h-13 w-full rounded-full text-[15px]">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  );
}

function Float({ children, delay = 0, className }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      initial={{ y: 24, opacity: 0, rotate: -2 }}
      animate={{ y: [0, -6, 0], opacity: 1, rotate: 0 }}
      transition={{ y: { duration: 6, repeat: Infinity, ease: "easeInOut", delay }, opacity: { duration: 0.5, delay }, rotate: spring.soft }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function DecisionArt() {
  return (
    <div className="relative h-72 w-full">
      <Float className="absolute top-2 right-0 left-6 rotate-3 rounded-2xl border bg-card/40 p-4 opacity-40 blur-[1px]">
        <p className="text-sm text-muted-foreground">Can my partner be included in a 190?</p>
      </Float>
      <Float delay={0.15} className="absolute top-16 right-6 left-0 rounded-2xl border bg-card p-4 shadow-2xl shadow-black/40">
        <p className="text-[15px]">Am I eligible for the 189 with 8 years overseas experience?</p>
        <div className="mt-4 flex items-center justify-between">
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">Decision engine</span>
          <span className="grid size-8 place-items-center rounded-full bg-foreground text-background">
            <ArrowUpIcon className="size-4" />
          </span>
        </div>
      </Float>
      <Float delay={0.35} className="absolute right-2 bottom-2 left-10 flex items-center gap-3 rounded-2xl border border-brand/30 bg-brand/10 p-3">
        <span className="grid size-8 place-items-center rounded-full bg-brand text-brand-foreground">
          <CheckIcon className="size-4" />
        </span>
        <div className="text-sm">
          <p className="font-medium">Eligible · 85 points</p>
          <p className="text-muted-foreground">Sch 6D items 6D13, 6D21, 6D33</p>
        </div>
      </Float>
    </div>
  );
}

function LawArt() {
  const rows = ["Overview", "About this visa", "Eligibility", "How to apply", "When you have this visa"];
  return (
    <div className="w-full space-y-2">
      {rows.map((r, i) => (
        <motion.div
          key={r}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ ...spring.soft, delay: i * 0.06 }}
          className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3"
        >
          <ScaleIcon className="size-4 text-muted-foreground" />
          <span className="flex-1 text-sm">{r}</span>
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ ...spring.snappy, delay: 0.3 + i * 0.08 }}
            className="grid size-5 place-items-center rounded-full bg-brand text-brand-foreground"
          >
            <CheckIcon className="size-3" />
          </motion.span>
        </motion.div>
      ))}
    </div>
  );
}

function FolderArt() {
  const folders = [
    { name: "Identity", n: 3, tint: "bg-sky-300/80" },
    { name: "English test", n: 1, tint: "bg-brand" },
    { name: "Employment", n: 12, tint: "bg-amber-200/90" },
    { name: "Skills assessment", n: 2, tint: "bg-rose-200/90" },
  ];
  return (
    <div className="grid w-full grid-cols-2 gap-4">
      {folders.map((f, i) => (
        <Float key={f.name} delay={i * 0.12}>
          <div className="relative h-28">
            <div className={`absolute top-0 left-4 h-14 w-3/5 -rotate-6 rounded-md ${f.tint}`} />
            <div className="absolute top-2 left-10 h-14 w-1/2 rotate-3 rounded-md bg-white/90" />
            <div className="absolute inset-x-0 bottom-0 h-20 rounded-2xl border border-white/10 bg-white/10 backdrop-blur-md">
              <FileTextIcon className="absolute right-3 bottom-3 size-5 text-white/70" />
            </div>
          </div>
          <p className="mt-2 text-center text-sm">
            {f.name} <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{f.n}</span>
          </p>
        </Float>
      ))}
    </div>
  );
}
