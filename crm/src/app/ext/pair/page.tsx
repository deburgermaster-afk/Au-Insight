import { Suspense } from "react";
import { connection } from "next/server";
import { Logo } from "@/components/app/logo";
import { PairApprove } from "@/components/lodge/pair-approve";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Connect the ImmiAccount helper" };

async function Pair({ searchParams }: PageProps<"/ext/pair">) {
  await connection();
  const [sp, ctx] = await Promise.all([searchParams, getCtx()]);
  const ext = typeof sp.ext === "string" && /^[a-p]{32}$/.test(sp.ext) ? sp.ext : null;
  const browser = typeof sp.browser === "string" ? sp.browser.slice(0, 40) : "Chrome";
  return <PairApprove ext={ext} browser={browser} user={{ name: ctx.name, email: ctx.email, agency: ctx.agencyName }} allowed={ctx.caps.includes("clients")} />;
}

/** Opened by the extension: the person approves it with their Lodgely sign-in, like any app connection. */
export default function PairPage(props: PageProps<"/ext/pair">) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2 text-sm font-semibold">
          <Logo className="size-6" /> Lodgely
        </div>
        <Suspense fallback={<div className="h-80 animate-pulse rounded-3xl border bg-card" />}>
          <Pair {...props} />
        </Suspense>
      </div>
    </div>
  );
}
