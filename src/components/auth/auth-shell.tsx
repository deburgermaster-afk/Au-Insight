"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ChevronLeftIcon, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { spring } from "@/lib/motion";

export function AuthShell({
  back = "/",
  title,
  subtitle,
  children,
  footer,
}: {
  back?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-6 pt-safe pb-safe">
      <div className="flex h-12 items-center">
        <Link href={back} className="-ml-1 flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
          <ChevronLeftIcon className="size-4" /> Back
        </Link>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring.soft}
        className="flex flex-1 flex-col"
      >
        <h1 className="mt-6 text-[2.25rem] leading-[1.05] font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-3 text-[15px] text-muted-foreground">{subtitle}</p>}
        <div className="mt-8 flex flex-col gap-3">{children}</div>
        {footer && <div className="mt-auto pt-8 text-center text-sm text-muted-foreground">{footer}</div>}
      </motion.div>
    </main>
  );
}

export function IconInput({ icon: Icon, className, ...props }: React.ComponentProps<typeof Input> & { icon: LucideIcon }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input className={cn("h-12 rounded-xl border-transparent bg-muted/60 pl-11 text-[15px] transition-colors focus-visible:bg-muted", className)} {...props} />
    </div>
  );
}

export function Divider({ children = "or" }: { children?: React.ReactNode }) {
  return (
    <div className="my-1 flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

/** Supabase's email code length (6 by default; configurable 6–10 in Auth settings). */
export const OTP_LENGTH = Number(process.env.NEXT_PUBLIC_OTP_LENGTH ?? 6);

export function authErrorMessage(message: string) {
  if (/invalid login credentials/i.test(message)) return "Email or password is incorrect.";
  if (/expired|invalid.*(otp|token)/i.test(message)) return "That code is invalid or has expired. Request a new one.";
  if (/rate limit|too many/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  return message;
}
