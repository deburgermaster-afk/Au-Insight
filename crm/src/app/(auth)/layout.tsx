import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { FadeIn } from "@/components/app/motion";
import { AppGlimpse } from "@/components/marketing/app-glimpse";
import { DuskScene } from "@/components/marketing/dusk";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="dark relative grid min-h-dvh place-items-center bg-black p-3 text-foreground sm:p-6">
      <DuskScene />
      <FadeIn y={16} className="relative w-full max-w-6xl">
        <div className="glass grid min-h-[min(44rem,calc(100dvh-3rem))] overflow-hidden rounded-3xl border border-white/10 shadow-2xl lg:grid-cols-2">
          <div className="flex flex-col p-6 sm:p-10">
            <Link href="/" className="flex items-center gap-2 text-sm font-semibold text-white">
              <Logo className="size-6" /> Lodgely
            </Link>
            <div className="mx-auto my-auto w-full max-w-sm py-10">{children}</div>
            <p className="text-center text-[11px] text-white/45">
              By continuing you agree to the <span className="text-white/70">Terms of Service</span> and <span className="text-white/70">Privacy Policy</span>.
            </p>
          </div>
          <div className="relative m-3 hidden overflow-hidden rounded-2xl border border-white/10 lg:block">
            <DuskScene className="scale-110 blur-[2px]" />
            <div className="absolute inset-0 grid place-items-center p-10">
              <FadeIn delay={0.2} y={20} className="w-full">
                <div className="flex justify-center">
                  <AppGlimpse />
                </div>
                <blockquote className="mx-auto mt-8 max-w-md text-center">
                  <p className="text-balance text-lg font-medium leading-snug text-white">“Every client, matter and document in one place. Our lodgement checks went from hours to minutes.”</p>
                  <footer className="mt-3 text-xs text-white/55">Principal agent, Sydney practice</footer>
                </blockquote>
              </FadeIn>
            </div>
          </div>
        </div>
      </FadeIn>
    </div>
  );
}
