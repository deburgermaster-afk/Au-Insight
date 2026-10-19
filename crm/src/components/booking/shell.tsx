import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";

/** The public booking pages' frame: the agency's name and logo, centred and phone-friendly. */
export function BookingShell({ agency, logo, children }: { agency: string; logo?: string | null; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-4">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" className="size-9 rounded-lg object-cover" />
          ) : (
            <span className="grid size-9 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{agency.split(/\s+/).map((w) => w[0]).slice(0, 2).join("")}</span>
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold">{agency}</p>
            <p className="text-xs text-muted-foreground">Book an appointment</p>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">{children}</main>
      <footer className="mx-auto flex max-w-3xl items-center justify-center gap-1.5 px-4 pb-8 text-xs text-muted-foreground">
        <Logo className="size-4" /> Bookings by Lodgely
      </footer>
    </div>
  );
}
