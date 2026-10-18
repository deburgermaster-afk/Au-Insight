import { ArrowLeft, Check, CircleAlert, Download, MessageSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bytes, fileKind, fileUrl } from "@/components/mail/file-icon";
import { MessageSheet } from "@/components/portal/message";
import { stageIndex, stageInfo, stageLabel, track } from "@/components/portal/stage";
import { PortalTimeline } from "@/components/portal/timeline";
import { PortalUpload } from "@/components/portal/upload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireClient } from "@/lib/client-auth";
import { portalCase } from "@/lib/client-data";
import { aud, daysUntil, dmy } from "@/lib/format";
import { cn } from "@/lib/utils";
import { visaByCode } from "@/lib/visas";
import { PredictedTimeline } from "@/components/app/predicted-timeline";
import { liveProcessing } from "@/lib/processing-times";
import { fmtMonths, predictTimeline, processingMonths } from "@/lib/visa-timeline";

export const metadata = { title: "Case" };

const statusText: Record<string, { label: string; cls: string }> = {
  needed: { label: "Needed", cls: "text-amber-500" },
  requested: { label: "Requested", cls: "text-amber-500" },
  rejected: { label: "Re-upload", cls: "text-rose-500" },
  received: { label: "Received", cls: "text-sky-500" },
  approved: { label: "Approved", cls: "text-emerald-500" },
  waived: { label: "Not needed", cls: "text-muted-foreground" },
};
const waiting = (st: string) => st === "needed" || st === "requested" || st === "rejected";

export default async function CasePage({ params }: PageProps<"/client/cases/[id]">) {
  const { id } = await params;
  const c = await requireClient();
  const d = await portalCase(c, id);
  if (!d) notFound();
  const { m } = d;
  const visa = visaByCode(m.visaCode);
  const at = stageIndex(m.stage);
  const req = d.items.filter((i) => i.required);
  const got = req.filter((i) => !waiting(i.status)).length;
  const groups = [...new Set(d.items.map((i) => i.category))];
  const live = await liveProcessing(m.visaCode, m.stream);
  // Plain-language milestones for the client (agent-only steps like compliance are kept, worded simply).
  const plan = predictTimeline(m, live).map((x) => (x.key === "agreement" ? { ...x, label: "Service agreement signed", detail: "Your agreement with us and the Consumer Guide." } : x));
  const [p50, p90] = live ? [live.p50Months, live.p90Months] : processingMonths(m.visaCode);
  const facts = [
    { k: "Reference", v: m.reference },
    { k: "Lodged", v: m.lodgedAt ? dmy(m.lodgedAt) : "Not yet" },
    { k: "TRN", v: m.trn ?? "—" },
    { k: m.decisionAt ? "Decision" : "Target lodgement", v: m.decisionAt ? dmy(m.decisionAt) : m.dueAt ? dmy(m.dueAt) : "—" },
  ];
  return (
    <div className="grid gap-3">
      <Link href="/client/cases" className="flex w-fit items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-3.5" /> Cases
      </Link>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="relative bg-[radial-gradient(120%_140%_at_0%_0%,oklch(0.75_0.15_55/.35),transparent_55%),radial-gradient(120%_160%_at_100%_0%,oklch(0.6_0.18_300/.35),transparent_60%)] p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-2xl leading-none font-semibold">{m.visaCode}</p>
              <h1 className="mt-1.5 text-sm leading-snug font-semibold">{visa?.name ?? m.title}</h1>
              <p className="text-[11px] text-muted-foreground">{m.title}</p>
            </div>
            {m.outcome ? <Badge variant={m.outcome === "granted" ? "default" : "destructive"} className="capitalize">{m.outcome}</Badge> : <Badge variant="secondary">{stageLabel(m.stage)}</Badge>}
          </div>
          <ol className="mt-3 flex gap-1" aria-label="Progress">
            {track.map((s, i) => (
              <li key={s.key} title={s.label} className={cn("h-1.5 flex-1 rounded-full", i < at || m.stage === "closed" ? "bg-emerald-500" : i === at ? "bg-primary" : "bg-muted")} />
            ))}
          </ol>
          <p className="mt-2 text-xs">
            <span className="font-medium">{stageLabel(m.stage)}.</span> <span className="text-muted-foreground">{stageInfo[m.stage]}</span>
          </p>
        </div>
        {m.rfiDueAt && !m.decisionAt ? (
          <div className="flex items-center gap-2 border-t border-rose-500/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-500">
            <CircleAlert className="size-3.5 shrink-0" /> Information requested by Home Affairs. Response due {dmy(m.rfiDueAt)} ({Math.max(0, daysUntil(m.rfiDueAt))} days).
          </div>
        ) : null}
        <dl className="grid grid-cols-2 border-t">
          {facts.map((f, i) => (
            <div key={f.k} className={cn("px-3 py-2", i % 2 === 0 && "border-r", i < 2 && "border-b")}>
              <dt className="text-[10px] tracking-wide text-muted-foreground uppercase">{f.k}</dt>
              <dd className="truncate text-[13px] font-medium">{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Tabs defaultValue={waiting(d.items[0]?.status ?? "") || req.length > got ? "checklist" : "timeline"} className="gap-2">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="checklist" className="text-xs">
            Checklist
          </TabsTrigger>
          <TabsTrigger value="plan" className="text-xs">
            What&apos;s next
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">
            History
          </TabsTrigger>
          <TabsTrigger value="files" className="text-xs">
            Files · {d.docs.length}
          </TabsTrigger>
          <TabsTrigger value="invoices" className="text-xs">
            Fees
          </TabsTrigger>
        </TabsList>

        <TabsContent value="checklist" className="grid gap-2">
          <div className="rounded-xl border bg-card p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                {got} of {req.length} required documents
              </span>
              <span className="text-muted-foreground">{req.length ? Math.round((got / req.length) * 100) : 100}%</span>
            </div>
            <Progress value={req.length ? (got / req.length) * 100 : 100} className="mt-2 h-1.5" />
          </div>
          {groups.map((g) => (
            <div key={g} className="overflow-hidden rounded-xl border bg-card">
              <p className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">{g}</p>
              <ul className="divide-y">
                {d.items
                  .filter((i) => i.category === g)
                  .map((i) => {
                    const st = statusText[i.status] ?? statusText.needed;
                    const files = d.docs.filter((x) => x.checklistItemId === i.id).length;
                    return (
                      <li key={i.id} className="flex items-center gap-2.5 px-3 py-2">
                        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border", !waiting(i.status) && "border-emerald-500 bg-emerald-500 text-white")}>{!waiting(i.status) ? <Check className="size-3" /> : null}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-snug">
                            {i.label}
                            {!i.required ? <span className="text-muted-foreground"> (if applicable)</span> : null}
                          </p>
                          <p className={cn("text-[11px]", st.cls)}>
                            {st.label}
                            {files ? <span className="text-muted-foreground"> · {files} file{files > 1 ? "s" : ""}</span> : null}
                            {i.note ? <span className="text-muted-foreground"> · {i.note}</span> : null}
                          </p>
                        </div>
                        {i.status !== "approved" && i.status !== "waived" ? <PortalUpload agencyId={c.client.agencyId} clientId={c.client.id} matterId={m.id} itemId={i.id} label={waiting(i.status) ? "Upload" : "Add"} variant={waiting(i.status) ? "default" : "outline"} /> : null}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed p-3">
            <p className="text-xs text-muted-foreground">Something else for this case?</p>
            <PortalUpload agencyId={c.client.agencyId} clientId={c.client.id} matterId={m.id} label="Upload other" />
          </div>
        </TabsContent>

        <TabsContent value="plan">
          <div className="rounded-xl border bg-card p-3">
            <PredictedTimeline items={plan} audience="client" processing={live ? `about ${live.p50} for half of applications, ${live.p90} for most` : `about ${fmtMonths(p50)} to ${fmtMonths(p90)}`} source={live ? { asAt: live.asAt, url: live.sourceUrl } : null} />
          </div>
        </TabsContent>

        <TabsContent value="timeline">
          <div className="rounded-xl border bg-card p-3">
            <PortalTimeline items={d.events} />
          </div>
        </TabsContent>

        <TabsContent value="files">
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {d.docs.map((doc) => {
              const k = fileKind(doc.mimeType ?? "", doc.name);
              return (
                <li key={doc.id}>
                  <a href={doc.storageKey ? fileUrl(doc.storageKey, doc.name) : undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2 active:bg-muted/50">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", k.tone)}>
                      <k.Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px]">{doc.name}</span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {doc.category ?? k.label} · {dmy(doc.createdAt)}
                        {doc.sizeBytes ? ` · ${bytes(doc.sizeBytes)}` : ""}
                      </span>
                    </span>
                    {doc.storageKey ? <Download className="size-4 text-muted-foreground" /> : null}
                  </a>
                </li>
              );
            })}
            {!d.docs.length ? <li className="p-6 text-center text-xs text-muted-foreground">No files yet.</li> : null}
          </ul>
        </TabsContent>

        <TabsContent value="invoices" className="grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Professional fees</p>
              <p className="text-sm font-semibold tabular-nums">{aud(m.feeProfessional)}</p>
            </div>
            <div className="rounded-xl border bg-card p-3">
              <p className="text-[10px] text-muted-foreground uppercase">Government charge</p>
              <p className="text-sm font-semibold tabular-nums">{aud(m.feeGovernment)}</p>
            </div>
          </div>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {d.invoices.map((i) => {
              const owing = Number(i.total) - Number(i.paid);
              return (
                <li key={i.id}>
                  <Link href={`/client/payments/${i.id}`} className="flex items-center gap-2 px-3 py-2.5 active:bg-muted/50">
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium">{i.number}</span>
                      <span className="block text-[11px] text-muted-foreground">Due {dmy(i.dueAt)}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-[13px] font-medium tabular-nums">{aud(i.total, 2)}</span>
                      <span className={cn("block text-[11px]", owing > 0 ? "text-amber-500" : "text-emerald-500")}>{owing > 0 ? `${aud(owing, 2)} to pay` : "Paid"}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
            {!d.invoices.length ? <li className="p-6 text-center text-xs text-muted-foreground">No invoices for this case.</li> : null}
          </ul>
        </TabsContent>
      </Tabs>

      <MessageSheet
        to={d.agent?.split(" ")[0] ?? c.agency.name}
        matterId={m.id}
        subject={`${m.reference}: question`}
        trigger={
          <Button variant="outline" className="h-10 rounded-full">
            <MessageSquare /> Ask about this case
          </Button>
        }
      />
    </div>
  );
}
