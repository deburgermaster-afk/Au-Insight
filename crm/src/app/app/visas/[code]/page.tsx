import { ArrowLeft, CheckCircle2, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pill } from "@/components/app/badges";
import { FadeIn, Stagger, StaggerItem } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { Button } from "@/components/ui/button";
import { visaByCode, visas } from "@/lib/visas";

export function generateStaticParams() {
  return visas.map((v) => ({ code: v.code }));
}

export async function generateMetadata({ params }: PageProps<"/app/visas/[code]">) {
  const v = visaByCode((await params).code);
  return { title: v ? `${v.code} ${v.name}` : "Visa" };
}

export default async function VisaPage({ params }: PageProps<"/app/visas/[code]">) {
  const v = visaByCode((await params).code);
  if (!v) notFound();
  const groups = Object.entries(
    v.checklist.reduce<Record<string, typeof v.checklist>>((a, i) => {
      (a[i.category] ??= []).push(i);
      return a;
    }, {}),
  );
  return (
    <>
      <Link href="/app/visas" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Visa library
      </Link>
      <FadeIn className="mb-6 overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/15 via-card to-card p-6 shadow-xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <span className="grid size-16 place-items-center rounded-2xl bg-primary font-mono text-xl font-semibold text-primary-foreground shadow-lg shadow-primary/30">{v.code}</span>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{v.name}</h1>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Pill t="violet">{v.category}</Pill>
              <Pill t={v.permanent ? "green" : "blue"}>{v.permanent ? "Permanent" : "Temporary"}</Pill>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href={v.url} target="_blank" rel="noreferrer">
              Home Affairs <ExternalLink />
            </a>
          </Button>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-muted-foreground">{v.summary}</p>
      </FadeIn>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="grid content-start gap-6">
          <Section title="Key requirements">
            <Stagger className="grid gap-2.5">
              {v.requirements.map((r) => (
                <StaggerItem key={r} className="flex gap-2.5 text-sm">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" />
                  {r}
                </StaggerItem>
              ))}
            </Stagger>
          </Section>
          {v.streams?.length ? (
            <Section title="Streams">
              <div className="flex flex-wrap gap-2">
                {v.streams.map((s) => (
                  <Pill key={s} t="violet">
                    {s}
                  </Pill>
                ))}
              </div>
            </Section>
          ) : null}
        </div>
        <Section title={`Document checklist · ${v.checklist.length}`}>
          <div className="grid gap-4">
            {groups.map(([cat, items]) => (
              <div key={cat}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
                <ul className="grid gap-2">
                  {items.map((i) => (
                    <li key={i.label} className="flex gap-2.5 text-sm">
                      <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
                      <span>
                        {i.label}
                        {i.required === false ? <span className="ml-1 text-xs text-muted-foreground">(if applicable)</span> : null}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
