import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { FadeIn } from "@/components/app/motion";
import { Logo } from "@/components/app/logo";

const points = [
  "Every client, matter and document in one place",
  "Checklists for 30+ visa subclasses, ready on day one",
  "Shared and personal mailboxes for the whole team",
  "Trust accounting that keeps you Code-compliant",
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-[oklch(0.2_0.05_280)] p-10 text-white lg:flex lg:flex-col">
        <div className="bg-grid absolute inset-0 opacity-[0.07]" />
        <div className="absolute -left-24 top-1/3 size-[28rem] rounded-full bg-[oklch(0.55_0.22_277)] opacity-40 blur-3xl" />
        <div className="absolute -right-24 bottom-0 size-[22rem] rounded-full bg-[oklch(0.6_0.21_330)] opacity-30 blur-3xl" />
        <Link href="/" className="relative flex items-center gap-2 text-lg font-semibold">
          <Logo className="size-8" /> Lodgely
        </Link>
        <div className="relative mt-auto max-w-md">
          <FadeIn>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight">The operating system for Australian migration agencies.</h2>
          </FadeIn>
          <ul className="mt-8 space-y-3">
            {points.map((p, i) => (
              <FadeIn key={p} delay={0.08 * (i + 1)}>
                <li className="flex items-center gap-3 text-white/85">
                  <CheckCircle2 className="size-5 text-[oklch(0.8_0.14_277)]" /> {p}
                </li>
              </FadeIn>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
