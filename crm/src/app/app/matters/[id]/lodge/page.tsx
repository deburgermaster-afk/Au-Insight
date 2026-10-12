import { AlertTriangle, ArrowLeft, CheckCircle2, Download, ExternalLink, FileText, Printer, Puzzle, XCircle } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { Guard } from "@/components/app/guard";
import { HeaderActions } from "@/components/app/header-actions";
import { PageSkeleton } from "@/components/app/skeletons";
import { CopyValue } from "@/components/lodge/copy-value";
import { ImmiHelperSetup } from "@/components/lodge/immi-helper";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { Button } from "@/components/ui/button";
import { IMMI_MAX_FILES, buildPack } from "@/lib/lodgement";
import { getCtx } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Lodgement pack" };

const tabs = [
  { key: "sheet", label: "Data sheet" },
  { key: "documents", label: "Documents" },
  { key: "checks", label: "Before lodging" },
  { key: "extension", label: "Fill ImmiAccount" },
];

const kb = (n: number | null) => (n == null ? "" : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

function Ring({ value, label }: { value: number; label: ReactNode }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 44 44" className="size-11 -rotate-90">
        <circle cx="22" cy="22" r={r} className="fill-none stroke-muted" strokeWidth="4" />
        <circle cx="22" cy="22" r={r} className={cn("fill-none transition-all", value >= 100 ? "stroke-emerald-500" : value >= 70 ? "stroke-amber-500" : "stroke-rose-500")} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} />
      </svg>
      <div className="text-[12px] leading-tight">
        <p className="text-base font-semibold tabular-nums">{value}%</p>
        <p className="text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

async function Lodge({ params, searchParams }: PageProps<"/app/matters/[id]/lodge">) {
  await connection();
  const [{ id }, sp, ctx] = await Promise.all([params, searchParams, getCtx()]);
  const pack = await buildPack(ctx.agencyId, id);
  if (!pack) notFound();
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "sheet";
  const extensions =
    tab === "extension"
      ? await db
          .select({ id: s.extensionTokens.id, label: s.extensionTokens.label, createdAt: s.extensionTokens.createdAt, lastUsedAt: s.extensionTokens.lastUsedAt })
          .from(s.extensionTokens)
          .where(and(eq(s.extensionTokens.agencyId, ctx.agencyId), eq(s.extensionTokens.userId, ctx.userId), isNull(s.extensionTokens.revokedAt)))
          .orderBy(desc(s.extensionTokens.createdAt))
      : [];
  const blocking = pack.gaps.filter((g) => g.level === "block");
  const fieldsPct = Math.round((pack.score.fields.filled / Math.max(1, pack.score.fields.total)) * 100);

  return (
    <div className="grid gap-5">
      <HeaderActions>
        <Button asChild size="sm" variant="outline" className="rounded-full">
          <a href={`/api/matters/${id}/pack?view=sheet`} target="_blank" rel="noreferrer">
            <Printer /> Print sheet
          </a>
        </Button>
        <Button asChild size="sm" className="rounded-full">
          <a href={`/api/matters/${id}/pack`}>
            <Download /> Download pack
          </a>
        </Button>
      </HeaderActions>

      <div className="grid gap-4 border-b">
        <div className="flex flex-wrap items-start gap-3">
          <Link href={`/app/matters/${id}`} className="mt-1 grid size-8 shrink-0 place-items-center rounded-full border text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Back to matter">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-muted-foreground">{pack.matter.reference}</p>
            <h1 className="text-lg font-semibold tracking-tight">Lodgement pack · {pack.client.name}</h1>
            <p className="text-[13px] text-muted-foreground">{pack.matter.visaName}. Everything ImmiAccount asks for, in the order it asks, plus the documents renamed and ordered for attaching.</p>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Ring value={pack.score.checklist} label="Checklist" />
            <Ring value={fieldsPct} label={`${pack.score.fields.filled}/${pack.score.fields.total} fields`} />
            <div className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium", blocking.length ? "bg-rose-500/12 text-rose-500" : "bg-emerald-500/12 text-emerald-500")}>
              {blocking.length ? <XCircle className="size-4" /> : <CheckCircle2 className="size-4" />}
              {blocking.length ? `${blocking.length} to fix` : "Ready to lodge"}
            </div>
          </div>
        </div>
        <nav className="-mb-px flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <Link key={t.key} href={`/app/matters/${id}/lodge?tab=${t.key}`} scroll={false} className={cn("shrink-0 border-b-2 px-3 pb-2.5 pt-1 text-[13px] font-medium transition", t.key === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {t.label}
              {t.key === "checks" && pack.gaps.length ? <span className={cn("ml-1.5 rounded-full px-1.5 text-[10px]", blocking.length ? "bg-rose-500/15 text-rose-500" : "bg-amber-500/15 text-amber-500")}>{pack.gaps.length}</span> : null}
              {t.key === "documents" ? <span className="ml-1.5 text-[11px] text-muted-foreground">{pack.docs.length}</span> : null}
            </Link>
          ))}
        </nav>
      </div>

      {tab === "sheet" ? (
        <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
          {pack.sheet.map((sec) => (
            <section key={sec.title} className="rounded-2xl border bg-card">
              <header className="border-b px-4 py-2.5 text-[13px] font-medium">{sec.title}</header>
              <dl className="divide-y">
                {sec.fields.map((f) => (
                  <div key={f.key} className="grid grid-cols-[42%_1fr] items-center gap-2 px-4 py-1.5 text-[13px]">
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="min-w-0">{f.value ? <CopyValue value={f.value} className="-ml-1.5" /> : <span className={cn("text-[12px]", f.required ? "text-rose-500" : "text-muted-foreground/60")}>{f.required ? "Missing" : "—"}</span>}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="text-[12px] text-muted-foreground lg:col-span-2 2xl:col-span-3">Click a value to copy it. Dates are in ImmiAccount&apos;s format (DD Mon YYYY). Edit anything wrong on the client or matter, and this sheet updates.</p>
        </div>
      ) : null}

      {tab === "documents" ? (
        <div className="overflow-hidden rounded-2xl border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-[13px]">
              <thead className="bg-muted/40 text-[11px] text-muted-foreground">
                <tr>
                  <th className="w-10 px-4 py-2 font-medium">#</th>
                  <th className="px-2 py-2 font-medium">File name in the pack</th>
                  <th className="px-2 py-2 font-medium">ImmiAccount attachment type</th>
                  <th className="w-20 px-2 py-2 font-medium">Size</th>
                  <th className="w-56 px-4 py-2 font-medium">Check</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pack.docs.map((d) => (
                  <tr key={d.id}>
                    <td className="px-4 py-2 tabular-nums text-muted-foreground">{d.order}</td>
                    <td className="px-2 py-2">
                      <p className="flex items-center gap-1.5 font-medium">
                        <FileText className="size-3.5 shrink-0 text-muted-foreground" /> {d.file}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        was {d.original}
                        {d.certified ? " · certified" : ""}
                        {d.translated ? " · translated" : ""}
                      </p>
                    </td>
                    <td className="px-2 py-2">
                      <CopyValue value={d.evidence} className="-ml-1.5" />
                    </td>
                    <td className="px-2 py-2 tabular-nums text-muted-foreground">{kb(d.sizeBytes)}</td>
                    <td className="px-4 py-2">{d.issues.length ? <span className="text-[12px] text-rose-500">{d.issues.join("; ")}</span> : <span className="inline-flex items-center gap-1 text-[12px] text-emerald-500"><CheckCircle2 className="size-3.5" /> OK</span>}</td>
                  </tr>
                ))}
                {!pack.docs.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No documents on this matter yet. Upload them from the matter or ask the client through the portal.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="border-t px-4 py-2 text-[11px] text-muted-foreground">Ordered by the checklist (identity, relationship, character, health, English, skills, employment, education, nomination). ImmiAccount takes files up to 5 MB, {IMMI_MAX_FILES} per applicant. Attachment types are suggestions; pick the closest match ImmiAccount offers.</p>
        </div>
      ) : null}

      {tab === "checks" ? (
        <div className="grid max-w-3xl gap-2">
          {pack.gaps.length ? (
            pack.gaps.map((g, i) => (
              <div key={i} className={cn("flex items-start gap-2.5 rounded-xl border bg-card px-3.5 py-2.5 text-[13px]", g.level === "block" ? "border-rose-500/30" : "border-amber-500/30")}>
                {g.level === "block" ? <XCircle className="mt-0.5 size-4 shrink-0 text-rose-500" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />}
                <span>{g.text}</span>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-card px-3.5 py-3 text-sm">
              <CheckCircle2 className="size-4 text-emerald-500" /> Nothing missing. Check the values against the documents, then lodge.
            </div>
          )}
          <p className="mt-2 text-[12px] text-muted-foreground">Red items stop a clean lodgement; amber ones are worth a look. Lodgely never lodges for you: the registered agent reviews and submits in ImmiAccount.</p>
        </div>
      ) : null}

      {tab === "extension" ? (
        <div className="grid max-w-5xl items-start gap-4 md:grid-cols-[1.3fr_1fr]">
          <section className="rounded-2xl border bg-card p-4">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500">
              <Puzzle className="size-5" />
            </span>
            <h2 className="mt-3 font-medium">Lodgely for ImmiAccount</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">A Chrome and Edge extension. Open ImmiAccount, pick this case in the Lodgely side panel, and click <b className="font-medium text-foreground">Fill this page</b>. It fills the fields it recognises, highlights them for you to check, and never clicks Next or Submit.</p>
            <div className="mt-4">
              <ImmiHelperSetup extensions={extensions} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline" className="rounded-full">
                <a href={pack.matter.immiUrl} target="_blank" rel="noreferrer">
                  Open ImmiAccount <ExternalLink />
                </a>
              </Button>
            </div>
          </section>
          <section className="rounded-2xl border bg-card p-4 text-[13px]">
            <h2 className="font-medium">How a lodgement goes</h2>
            <ol className="mt-2 grid list-decimal gap-1.5 pl-4 text-muted-foreground">
              <li>Clear everything under Before lodging.</li>
              <li>Download the pack: documents renamed and in order.</li>
              <li>In ImmiAccount, start the application and open the Lodgely side panel.</li>
              <li>On each page, click Fill this page, check the highlighted fields, then click Next yourself.</li>
              <li>Attach the documents in pack order, using the suggested types.</li>
              <li>Review, pay and submit in ImmiAccount, then record the TRN on the matter.</li>
            </ol>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default function LodgePage(props: PageProps<"/app/matters/[id]/lodge">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="clients">
        <Lodge {...props} />
      </Guard>
    </Suspense>
  );
}
