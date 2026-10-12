import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { stageInfo, stageLabel, stageProgress } from "@/components/portal/stage";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { requireClient } from "@/lib/client-auth";
import { portalHome } from "@/lib/client-data";
import { dmy } from "@/lib/format";
import { visaByCode } from "@/lib/visas";

export const metadata = { title: "Cases" };

export default async function Cases() {
  const c = await requireClient();
  const { matters } = await portalHome(c);
  return (
    <div className="grid gap-2">
      <h1 className="px-0.5 pt-1 text-lg font-semibold tracking-tight">Cases</h1>
      {matters.map(({ m, agent }) => (
        <Link key={m.id} href={`/client/cases/${m.id}`} className="block rounded-xl border bg-card p-3 transition active:scale-[.99]">
          <div className="flex items-start gap-2.5">
            <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-muted px-1.5 font-mono text-xs font-semibold">{m.visaCode}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.title}</p>
              <p className="truncate text-[11px] text-muted-foreground">{visaByCode(m.visaCode)?.name ?? m.reference}</p>
            </div>
            {m.outcome ? <Badge variant={m.outcome === "granted" ? "default" : "destructive"} className="capitalize">{m.outcome}</Badge> : <Badge variant="secondary">{stageLabel(m.stage)}</Badge>}
          </div>
          <Progress value={stageProgress(m.stage)} className="mt-3 h-1.5" />
          <p className="mt-2 text-[11px] text-muted-foreground">{stageInfo[m.stage]}</p>
          <div className="mt-2 flex items-center gap-x-3 border-t pt-2 text-[11px] text-muted-foreground">
            <span>{m.reference}</span>
            {m.lodgedAt ? <span>Lodged {dmy(m.lodgedAt)}</span> : null}
            {agent ? <span className="truncate">Agent {agent}</span> : null}
            <ChevronRight className="ml-auto size-3.5" />
          </div>
        </Link>
      ))}
      {!matters.length ? <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">No cases yet.</p> : null}
    </div>
  );
}
