import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { portalFor } from "@/lib/portal";
import { visaByCode } from "@/lib/visas";
import { PortalUploads } from "./uploads";

export const metadata: Metadata = { title: "Upload your documents", robots: { index: false, follow: false } };

async function Portal({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const { token } = await params;
  const p = await portalFor(token);
  if (!p)
    return (
      <div className="mx-auto max-w-md py-24 text-center">
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <p className="mt-2 text-sm text-zinc-500">Upload links last a limited time to keep your documents safe. Ask your migration agent to send a new one.</p>
      </div>
    );
  const visa = visaByCode(p.matter.visaCode);
  const items = p.items.map((i) => ({ id: i.id, category: i.category, label: i.label, required: i.required, status: i.status, files: p.docs.filter((d) => d.checklistItemId === i.id).map((d) => d.name) }));
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <header className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-zinc-900 text-sm font-semibold text-white">{p.agency.name.slice(0, 1)}</span>
        <div>
          <p className="font-semibold">{p.agency.name}</p>
          <p className="text-xs text-zinc-500">{[p.profile?.marn ? `MARN ${p.profile.marn}` : null, p.profile?.phone].filter(Boolean).join(" · ")}</p>
        </div>
      </header>
      <section className="mt-8 overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm">
        <div className="relative h-28 bg-[linear-gradient(160deg,#1e2a44,#5b4a63_55%,#d08a5c)]">
          <span className="absolute bottom-3 left-6 font-mono text-4xl font-semibold text-white/90">{visa?.code ?? p.matter.visaCode}</span>
        </div>
        <div className="p-6">
          <h1 className="text-xl font-semibold tracking-tight">Hi {p.client.firstName}, please upload your documents</h1>
          <p className="mt-1 text-sm text-zinc-500">
            For your {visa?.name ?? p.matter.title} application · reference {p.matter.reference}
            {p.link.dueAt ? ` · please upload by ${new Date(p.link.dueAt).toLocaleDateString("en-AU", { day: "numeric", month: "long" })}` : ""}
          </p>
          {p.link.note ? <p className="mt-4 whitespace-pre-line rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-sm">{p.link.note}</p> : null}
        </div>
      </section>
      <PortalUploads token={token} agencyId={p.link.agencyId} linkId={p.link.id} items={items} />
      <footer className="mt-10 flex items-center justify-center gap-2 text-xs text-zinc-400">
        <Logo className="size-4" /> Secure upload by Lodgely · files go only to {p.agency.name}
      </footer>
    </div>
  );
}

export default function PortalPage({ params }: PageProps<"/portal/[token]">) {
  return (
    <div className="light min-h-dvh bg-zinc-50 text-zinc-900 [color-scheme:light]">
      <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm text-zinc-400">Loading your checklist…</div>}>
        <Portal params={params} />
      </Suspense>
    </div>
  );
}
