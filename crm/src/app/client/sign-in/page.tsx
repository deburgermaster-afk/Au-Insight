import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { ClientSignIn } from "@/components/portal/sign-in";

export const metadata = { title: "Client portal sign in", robots: { index: false, follow: false } };

export default function Page() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo className="size-9" />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Your client portal</h1>
          <p className="mt-1 text-xs text-muted-foreground">Track your visa application, upload documents and pay invoices.</p>
        </div>
        <Suspense>
          <ClientSignIn />
        </Suspense>
        <p className="mt-6 text-center text-[11px] text-muted-foreground">No password needed. We email you a 6-digit code (and a one-tap link).</p>
      </div>
    </div>
  );
}
