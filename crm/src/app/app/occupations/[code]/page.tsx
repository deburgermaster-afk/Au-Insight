import { ArrowLeft, CircleCheck, CircleMinus, CircleX, ExternalLink, GraduationCap, MapPinned, Scale, TrendingUp } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { FadeIn } from "@/components/app/motion";
import { Section } from "@/components/app/section";
import { PageSkeleton } from "@/components/app/skeletons";
import { FactStrip } from "@/components/app/stat-card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type OccupationDetail, getOccupation } from "@/lib/occupations";
import { cn } from "@/lib/utils";
import { ListBadge } from "../badges";
import { EoiBacklog } from "./eoi-backlog";
import { RoundsChart } from "./rounds-chart";

export async function generateMetadata({ params }: PageProps<"/app/occupations/[code]">) {
  return { title: `ANZSCO ${(await params).code}` };
}

// The visas an occupation list can open, and which lists open each.
const visaRows = [
  { key: "189", label: "Skilled Independent", match: (v: string) => v.startsWith("189"), lists: ["MLTSSL"] },
  { key: "190", label: "Skilled Nominated", match: (v: string) => v.startsWith("190"), lists: ["MLTSSL", "STSOL", "ROL"] },
  { key: "491", label: "Skilled Work Regional · State nominated", match: (v: string) => v.startsWith("491") && /State/i.test(v), lists: ["MLTSSL", "STSOL", "ROL"] },
  { key: "491", label: "Skilled Work Regional · Family sponsored", match: (v: string) => v.startsWith("491") && /Family/i.test(v), lists: ["MLTSSL"] },
  { key: "485", label: "Temporary Graduate", match: (v: string) => v.startsWith("485"), lists: ["MLTSSL"] },
  { key: "482", label: "Skills in Demand · Core Skills", match: (v: string) => v.startsWith("482"), lists: ["CSOL"] },
  { key: "186", label: "Employer Nomination · Direct Entry", match: (v: string) => v.startsWith("186"), lists: ["CSOL"] },
  { key: "494", label: "Skilled Employer Sponsored Regional", match: (v: string) => v.startsWith("494"), lists: ["MLTSSL", "STSOL", "ROL"] },
  { key: "407", label: "Training", match: (v: string) => v.startsWith("407"), lists: ["MLTSSL", "STSOL", "ROL"] },
];
const allLists = ["MLTSSL", "STSOL", "ROL", "CSOL"];
const states = ["nsw", "vic", "qld", "sa", "wa", "tas", "nt", "act"] as const;

function Rating({ v }: { v: string | null }) {
  const t = (v ?? "").toLowerCase();
  const tone = t.startsWith("shortage") ? "text-emerald-600 dark:text-emerald-300 bg-emerald-500/10" : t.includes("regional") ? "text-amber-600 dark:text-amber-300 bg-amber-500/10" : t ? "text-rose-600 dark:text-rose-300 bg-rose-500/10" : "text-muted-foreground bg-muted/50";
  return <span className={cn("rounded-md px-2 py-1 text-xs font-medium", tone)}>{v ?? "Not rated"}</span>;
}

function VisaOptions({ d }: { d: OccupationDetail }) {
  const o = d.occupation;
  return (
    <Section title="Possible visa options" bodyClassName="p-0">
      <Table className="text-[13px]">
        <TableHeader className="bg-muted/40">
          <TableRow>
            <TableHead className="pl-4">Visa type</TableHead>
            <TableHead className="text-center">Eligible</TableHead>
            <TableHead className="text-center">Caveats</TableHead>
            {allLists.map((l) => (
              <TableHead key={l} className="hidden text-center sm:table-cell">
                {l}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visaRows.map((r) => {
            const visa = o.visas?.find(r.match);
            const caveats = (o.caveats ?? []).filter((c) => visa && c.visa === visa);
            return (
              <TableRow key={r.label}>
                <TableCell className="pl-4">
                  <p className="font-medium">Subclass {r.key}</p>
                  <p className="text-xs text-muted-foreground">{r.label}</p>
                </TableCell>
                <TableCell className="text-center">{visa ? <CircleCheck className="mx-auto size-4.5 text-emerald-500" /> : <CircleX className="mx-auto size-4.5 text-rose-400" />}</TableCell>
                <TableCell className="text-center">
                  {caveats.length ? (
                    <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-300" title={caveats.map((c) => c.title).join(", ")}>
                      {caveats.map((c) => c.title).join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">–</span>
                  )}
                </TableCell>
                {allLists.map((l) => (
                  <TableCell key={l} className="hidden text-center sm:table-cell">
                    {!r.lists.includes(l) ? (
                      <span className="text-muted-foreground/40">·</span>
                    ) : o.lists?.includes(l) ? (
                      <CircleCheck className="mx-auto size-4 text-emerald-500" />
                    ) : (
                      <CircleMinus className="mx-auto size-4 text-muted-foreground/60" />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        Eligibility follows the occupation lists in force today. Caveats exclude some positions; check the instrument before nominating. A dot means that list doesn't open the visa.
      </p>
    </Section>
  );
}

function StateEligibility({ d }: { d: OccupationDetail }) {
  const s = d.shortage;
  const noms = ["190", "491"].map((sub) => ({ sub, rows: d.nominations.filter((n) => n.subclass === sub) }));
  return (
    <div className="grid gap-4">
      <Section title={`Shortage rating by state${s ? ` · ${s.year} Occupation Shortage List` : ""}`}>
        {s ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-9">
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">National</p>
              <div className="mt-2">
                <Rating v={s.national} />
              </div>
            </div>
            {states.map((k) => (
              <div key={k} className="rounded-lg border p-3">
                <p className="text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground">{k}</p>
                <div className="mt-2">
                  <Rating v={s[k]} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Jobs and Skills Australia hasn't rated this occupation.</p>
        )}
      </Section>
      <Section title={`State and territory nominations · ${d.nominations[0]?.program_year ?? ""}`} bodyClassName="p-0">
        <Table className="text-[13px]">
          <TableHeader className="bg-muted/40">
            <TableRow>
              <TableHead className="pl-4">Subclass</TableHead>
              {["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map((st) => (
                <TableHead key={st} className="text-right">
                  {st}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {noms.map(({ sub, rows }) => (
              <TableRow key={sub}>
                <TableCell className="pl-4 font-medium">{sub}</TableCell>
                {["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"].map((st) => (
                  <TableCell key={st} className="text-right tabular-nums">
                    {rows.find((r) => r.state === st)?.nominations ?? "—"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="border-t px-4 py-3 text-xs text-muted-foreground">
          Nominations issued so far this program year ({d.nominations[0]?.as_of ?? "latest"}), across all occupations. States publish their own occupation criteria; check before lodging an EOI.
        </p>
      </Section>
    </div>
  );
}

function Rounds({ d }: { d: OccupationDetail }) {
  if (!d.rounds.length) return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">This occupation hasn't appeared in a published invitation round since 2021.</p>;
  const last189 = d.rounds.find((r) => r.subclass === "189");
  const last491 = d.rounds.find((r) => r.subclass === "491");
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <Section title="Minimum points invited over time">
        <RoundsChart rounds={d.rounds} />
      </Section>
      <Section title="Invitation rounds" bodyClassName="p-0">
        <div className="grid grid-cols-2 border-b">
          {[
            ["Latest 189 cut-off", last189],
            ["Latest 491 family cut-off", last491],
          ].map(([k, r]) => {
            const row = r as (typeof d.rounds)[number] | undefined;
            return (
              <div key={k as string} className="border-r p-4 last:border-r-0">
                <p className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k as string}</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{row?.min_points ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{row ? new Date(row.round_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "No round"}</p>
              </div>
            );
          })}
        </div>
        <div className="max-h-72 overflow-y-auto">
          <Table className="text-[13px]">
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead className="pl-4">Round</TableHead>
                <TableHead>Subclass</TableHead>
                <TableHead className="pr-4 text-right">Min points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.rounds.map((r) => (
                <TableRow key={r.round_date + r.subclass}>
                  <TableCell className="pl-4">{new Date(r.round_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</TableCell>
                  <TableCell>{r.subclass}</TableCell>
                  <TableCell className="pr-4 text-right font-medium tabular-nums">{r.min_points ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </div>
  );
}

function Anzsco({ d }: { d: OccupationDetail }) {
  const o = d.occupation;
  const a = d.authority;
  const ref = o.assessing_authorities?.[0];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Classification">
        <FactStrip
          items={[
            { label: "ANZSCO 2013", value: o.anzsco, tone: "rose" },
            { label: "ANZSCO 2022", value: o.code_2022 ?? "—", tone: "amber" },
            { label: "Skill level", value: d.shortage?.data?.skill_level ?? "—", tone: "primary" },
          ]}
        />
        <ul className="mt-5 grid gap-2">
          {(o.anzsco_links ?? []).map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-[13px] hover:underline">
                <ExternalLink className="size-3.5 text-muted-foreground" /> {l.label}
              </a>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Skills assessment">
        <p className="flex items-center gap-2 text-sm font-medium">
          <GraduationCap className="size-4 text-muted-foreground" /> {a?.name ?? ref?.name ?? o.authorities?.join(", ") ?? "—"}
        </p>
        {a ? (
          <dl className="mt-4 grid gap-3 text-[13px]">
            {[
              ["Fee", a.fee_text],
              ["Processing", a.processing_text],
              ["Validity", a.validity_text],
            ].map(([k, v]) =>
              v ? (
                <div key={k}>
                  <dt className="text-[10.5px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                  <dd className="mt-1 leading-relaxed">{v}</dd>
                </div>
              ) : null,
            )}
            {a.url ? (
              <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-[13px] hover:underline">
                <ExternalLink className="size-3.5" /> {a.short} website
              </a>
            ) : null}
          </dl>
        ) : ref?.details ? (
          <p className="mt-3 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{ref.details}</p>
        ) : (
          <p className="mt-3 text-[13px] text-muted-foreground">We don't hold fee and processing details for this authority yet.</p>
        )}
      </Section>
    </div>
  );
}

function Labour({ d }: { d: OccupationDetail }) {
  const p = d.profile;
  const j = d.projection;
  if (!p && !j) return <p className="rounded-xl border p-8 text-center text-sm text-muted-foreground">No labour market profile is published for this occupation.</p>;
  const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * (Math.abs(n) <= 1 ? 100 : 1))}%`);
  return (
    <div className="grid gap-4">
      {p ? (
        <Section title="Labour market">
          <FactStrip
            items={[
              { label: "Employed", value: p.employed?.toLocaleString("en-AU") ?? "—", tone: "rose" },
              { label: "Median weekly earnings", value: p.median_weekly_earnings ? `$${p.median_weekly_earnings.toLocaleString("en-AU")}` : "—", tone: "amber" },
              { label: "Part-time", value: pct(p.part_time_share), tone: "primary" },
              { label: "Female", value: pct(p.female_share), tone: "violet" },
              { label: "Median age", value: p.median_age ?? "—", tone: "sky" },
              { label: "5-year growth", value: pct(p.growth_5yr), tone: "emerald" },
            ]}
          />
        </Section>
      ) : null}
      {j ? (
        <Section title="Employment projection">
          <div className="flex flex-wrap items-center gap-6">
            <TrendingUp className="size-8 text-[var(--chart-1)]" />
            <div>
              <p className="text-2xl font-semibold tabular-nums">{j.growth_pct != null ? `${j.growth_pct > 0 ? "+" : ""}${j.growth_pct.toFixed(1)}%` : "—"}</p>
              <p className="text-xs text-muted-foreground">
                {j.base_period} → {j.projected_period} · {j.base_employment?.toLocaleString("en-AU")} → {j.projected_employment?.toLocaleString("en-AU")} workers
              </p>
            </div>
          </div>
        </Section>
      ) : null}
    </div>
  );
}

async function OccupationView({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const d = await getOccupation(code);
  if (!d) notFound();
  const o = d.occupation;
  const latest = d.rounds.find((r) => r.subclass === "189");
  return (
    <div className="grid gap-4">
      <FadeIn className="flex flex-wrap items-center gap-3">
        <Link href="/app/occupations" aria-label="Back" className="grid size-8 place-items-center rounded-full border bg-card text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
        </Link>
        <span className="grid h-11 place-items-center rounded-xl bg-gradient-to-br from-[oklch(0.78_0.15_60)] to-[oklch(0.62_0.2_20)] px-3 font-mono text-sm font-semibold text-white">{o.anzsco}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold tracking-tight">{o.title}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {o.lists?.map((l) => <ListBadge key={l} list={l} />)}
            <span className="text-[13px] text-muted-foreground">· Assessed by {o.authorities?.[0] ?? "—"}</span>
          </div>
        </div>
      </FadeIn>
      <FadeIn delay={0.04}>
        <Section title="At a glance">
          <FactStrip
            items={[
              { label: "Skill level", value: d.shortage?.data?.skill_level ?? "—", tone: "rose" },
              { label: "Eligible visas", value: `${o.visa_subclasses?.length ?? 0} subclasses`, tone: "amber" },
              { label: "National shortage", value: d.shortage?.national ?? "Not rated", tone: "emerald" },
              { label: "Latest 189 cut-off", value: latest ? `${latest.min_points} points` : "No round", tone: "primary" },
              { label: "189 submitted EOIs", value: ((v) => (typeof v === "number" ? v.toLocaleString("en-AU") : (v ?? "—")))(d.eoi.subclasses.find((s) => s.subclass === "189PTS")?.by_status.SUBMITTED), tone: "violet" },
              { label: "EOI data current to", value: d.eoi.data_current_to, tone: "sky" },
            ]}
          />
        </Section>
      </FadeIn>
      <FadeIn delay={0.08}>
        <Tabs defaultValue="backlog" className="gap-4">
          <TabsList className="max-w-full justify-start overflow-x-auto">
            <TabsTrigger value="visas">
              <Scale /> Visa options
            </TabsTrigger>
            <TabsTrigger value="states">
              <MapPinned /> State eligibility
            </TabsTrigger>
            <TabsTrigger value="backlog">Backlog & invitations</TabsTrigger>
            <TabsTrigger value="rounds">Cut-offs</TabsTrigger>
            <TabsTrigger value="anzsco">ANZSCO & assessment</TabsTrigger>
            <TabsTrigger value="labour">Labour market</TabsTrigger>
          </TabsList>
          <TabsContent value="visas">
            <VisaOptions d={d} />
          </TabsContent>
          <TabsContent value="states">
            <StateEligibility d={d} />
          </TabsContent>
          <TabsContent value="backlog">
            <EoiBacklog eoi={d.eoi} />
          </TabsContent>
          <TabsContent value="rounds">
            <Rounds d={d} />
          </TabsContent>
          <TabsContent value="anzsco">
            <Anzsco d={d} />
          </TabsContent>
          <TabsContent value="labour">
            <Labour d={d} />
          </TabsContent>
        </Tabs>
      </FadeIn>
    </div>
  );
}

export default function OccupationPage({ params }: PageProps<"/app/occupations/[code]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OccupationView params={params} />
    </Suspense>
  );
}
