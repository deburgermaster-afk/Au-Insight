import { CheckCircle2, Clock, ExternalLink, FileText, Layers, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { label, matterStageTone, Pill } from "@/components/app/badges";
import { HeaderActions } from "@/components/app/header-actions";
import { FadeIn } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { FactStrip } from "@/components/app/stat-card";
import { WithPickers } from "@/components/app/with-pickers";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { mattersOnVisa } from "@/lib/data";
import { visaProcessing } from "@/lib/occupations";
import { stages, visaByCode, visas } from "@/lib/visas";
import { UseVisa } from "./use-visa";

export function generateStaticParams() {
  return visas.map((v) => ({ code: v.code }));
}

export async function generateMetadata({ params }: PageProps<"/app/visas/[code]">) {
  const v = visaByCode(decodeURIComponent((await params).code));
  return { title: v ? `${v.code} ${v.name}` : "Visa" };
}

const art: Record<string, string> = {
  Skilled: "linear-gradient(160deg,#1e2a44,#5b4a63 55%,#d08a5c)",
  Employer: "linear-gradient(160deg,#1a2c33,#3f6b6a 55%,#e0b06a)",
  Student: "linear-gradient(160deg,#20264a,#5a5296 55%,#e39a7a)",
  Graduate: "linear-gradient(160deg,#241c3a,#7a4a78 55%,#f0a46a)",
  Family: "linear-gradient(160deg,#2a1e2c,#8a4a5a 55%,#f2b48a)",
  Visitor: "linear-gradient(160deg,#16303a,#3a7a8a 55%,#f0d08a)",
  Business: "linear-gradient(160deg,#1c2230,#4a5a7a 55%,#c9a46a)",
  Other: "linear-gradient(160deg,#1f1f24,#4a4a58 55%,#a89a8a)",
};

async function Processing({ code }: { code: string }) {
  const rows = await visaProcessing(code);
  if (!rows.length) return <p className="p-6 text-center text-sm text-muted-foreground">Home Affairs doesn't publish processing times for this one.</p>;
  return (
    <>
      <Table className="text-[13px]">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="pl-4">Subclass · stream</TableHead>
            <TableHead className="text-right">25%</TableHead>
            <TableHead className="text-right">50%</TableHead>
            <TableHead className="text-right">75%</TableHead>
            <TableHead className="pr-4 text-right">90%</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.subclass + r.stream}>
              <TableCell className="pl-4">
                <span className="font-mono text-xs text-muted-foreground">{r.subclass}</span> {r.stream || "All applications"}
              </TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{r.p25 ?? "—"}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">{r.p50 ?? "—"}</TableCell>
              <TableCell className="text-right tabular-nums text-muted-foreground">{r.p75 ?? "—"}</TableCell>
              <TableCell className="pr-4 text-right font-medium tabular-nums">{r.p90 ?? "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">Share of applications decided within each time, from Home Affairs' global processing times (updated {rows[0]?.updated}).</p>
    </>
  );
}

async function Matters({ code }: { code: string }) {
  const rows = await mattersOnVisa(code);
  if (!rows.length) return <p className="p-6 text-center text-sm text-muted-foreground">No matters on this visa yet.</p>;
  return (
    <ul>
      {rows.map((m) => (
        <li key={m.id} className="border-b last:border-0">
          <Link href={`/app/matters/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-muted/40">
            <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {m.first} {m.last}
              {m.stream ? <span className="font-normal text-muted-foreground"> · {m.stream}</span> : null}
            </span>
            {m.outcome ? <Pill t={m.outcome === "granted" ? "green" : "red"}>{label(m.outcome)}</Pill> : null}
            <Pill t={matterStageTone[m.stage]}>{stages.find((s) => s.key === m.stage)?.label}</Pill>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function VisaPage({ params }: PageProps<"/app/visas/[code]">) {
  const v = visaByCode(decodeURIComponent((await params).code));
  if (!v) notFound();
  const groups = Object.entries(
    v.checklist.reduce<Record<string, typeof v.checklist>>((a, i) => {
      (a[i.category] ??= []).push(i);
      return a;
    }, {}),
  );
  const required = v.checklist.filter((i) => i.required !== false).length;
  return (
    <div className="grid gap-3">
      <HeaderActions>
        <Button size="sm" variant="outline" asChild>
          <a href={v.url} target="_blank" rel="noreferrer">
            Home Affairs <ExternalLink />
          </a>
        </Button>
        <WithPickers fallback="Send checklist" render={(p) => <UseVisa code={v.code} name={v.name} streams={v.streams ?? []} pickers={p} />} />
      </HeaderActions>
      <FadeIn className="relative overflow-hidden rounded-xl border">
        <div className="absolute inset-0" style={{ background: art[v.category] ?? art.Other }} />
        <div className="absolute inset-0 bg-[radial-gradient(60%_90%_at_75%_120%,rgba(255,200,140,.45),transparent)]" />
        <div className="relative flex flex-col gap-3 p-6 text-white sm:flex-row sm:items-end sm:p-8">
          <span className="font-mono text-6xl font-semibold leading-none tracking-tight drop-shadow sm:text-7xl">{v.code}</span>
          <div className="min-w-0 flex-1 sm:pb-1">
            <h1 className="text-2xl font-semibold tracking-tight">{v.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-white/75">{v.summary}</p>
          </div>
          <div className="flex gap-1.5 sm:pb-1">
            <span className="rounded-md bg-white/15 px-2 py-1 text-xs backdrop-blur">{v.category}</span>
            <span className="rounded-md bg-white/15 px-2 py-1 text-xs backdrop-blur">{v.permanent ? "Permanent" : "Temporary"}</span>
          </div>
        </div>
      </FadeIn>
      <Section title="Key facts">
        <FactStrip
          items={[
            { label: "Category", value: v.category, tone: "rose" },
            { label: "Residency", value: v.permanent ? "Permanent" : "Temporary", tone: "amber" },
            { label: "Streams", value: v.streams?.length ? `${v.streams.length} streams` : "One stream", tone: "primary" },
            { label: "Documents", value: `${v.checklist.length} items`, tone: "violet" },
            { label: "Required", value: `${required} required`, tone: "sky" },
            { label: "Requirements", value: `${v.requirements.length} criteria`, tone: "emerald" },
          ]}
        />
      </Section>
      <Tabs defaultValue="checklist" className="gap-3">
        <TabsList className="max-w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">
            <ShieldCheck /> Requirements
          </TabsTrigger>
          <TabsTrigger value="checklist">
            <FileText /> Document checklist
          </TabsTrigger>
          <TabsTrigger value="processing">
            <Clock /> Processing times
          </TabsTrigger>
          <TabsTrigger value="matters">
            <Layers /> Our matters
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Section title="Core requirements">
              <ol className="grid gap-3">
                {v.requirements.map((r, i) => (
                  <li key={r} className="flex gap-3 text-sm">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border text-xs tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="pt-0.5">{r}</span>
                  </li>
                ))}
              </ol>
            </Section>
            <Section title="Streams">
              {v.streams?.length ? (
                <ul className="grid gap-2">
                  {v.streams.map((s) => (
                    <li key={s} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                      <CheckCircle2 className="size-4 text-emerald-500" /> {s}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">This visa has a single stream.</p>
              )}
            </Section>
          </div>
        </TabsContent>
        <TabsContent value="checklist">
          <div className="columns-1 gap-3 lg:columns-2 2xl:columns-3">
            {groups.map(([cat, items]) => (
              <div key={cat} className="mb-3 break-inside-avoid rounded-xl border bg-card">
                <p className="flex items-center justify-between border-b px-4 py-2.5 text-[13px] font-medium">
                  {cat}
                  <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
                </p>
                <ul className="grid gap-0.5 p-2">
                  {items.map((i) => (
                    <li key={i.label} className="flex gap-2.5 rounded-lg px-2 py-2 text-[13px] hover:bg-muted/40">
                      <span className="mt-1 size-3.5 shrink-0 rounded border" />
                      <span className="flex-1">{i.label}</span>
                      {i.required === false ? <span className="shrink-0 text-[11px] text-muted-foreground">if applicable</span> : <span className="shrink-0 text-[11px] text-[var(--chart-2)]">required</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">A starting checklist. Each matter gets its own copy you can edit, then send to the client with a private upload link.</p>
        </TabsContent>
        <TabsContent value="processing">
          <Section title="Global processing times" bodyClassName="p-0">
            <Suspense fallback={<Skeleton className="m-4 h-40" />}>
              <Processing code={v.code} />
            </Suspense>
          </Section>
        </TabsContent>
        <TabsContent value="matters">
          <Section title={`Matters on subclass ${v.code}`} bodyClassName="p-0">
            <Suspense fallback={<Skeleton className="m-4 h-24" />}>
              <Matters code={v.code} />
            </Suspense>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
