import { CheckCircle2, Clock3, Download, Eye, FilePen, FileSignature, Send, XCircle } from "lucide-react";
import Link from "next/link";
import { Pill, type Tone } from "@/components/app/badges";
import { fileUrl } from "@/components/mail/file-icon";
import { Button } from "@/components/ui/button";
import type { SignEvent } from "@/db/crm-schema";
import { dmy, relativeDays } from "@/lib/format";
import { SignRequestActions } from "./request-actions";

export type SignRow = {
  id: string;
  title: string;
  status: string;
  clientId: string;
  clientName?: string;
  matterId: string | null;
  createdAt: Date;
  viewedAt: Date | null;
  signedAt: Date | null;
  dueAt: string | null;
  fields: unknown[];
  events: SignEvent[];
  sentByName: string | null;
  signedKey?: string | null;
  signedName?: string | null;
};

const status: Record<string, { t: Tone; label: string; icon: typeof Send }> = {
  draft: { t: "gray", label: "Draft", icon: FilePen },
  sent: { t: "blue", label: "Sent", icon: Send },
  viewed: { t: "amber", label: "Opened", icon: Eye },
  signed: { t: "green", label: "Signed", icon: CheckCircle2 },
  void: { t: "red", label: "Withdrawn", icon: XCircle },
};

/** Signature requests with their progress: sent → opened → signed. */
export function SignList({ rows, showClient = true, empty = "No signature requests yet." }: { rows: SignRow[]; showClient?: boolean; empty?: string }) {
  if (!rows.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="grid divide-y">
      {rows.map((r) => {
        const st = status[r.status] ?? status.sent;
        const steps = [
          { on: r.status !== "draft", label: "Sent", at: r.status !== "draft" ? r.createdAt : null },
          { on: Boolean(r.viewedAt) || r.status === "signed", label: "Opened", at: r.viewedAt },
          { on: r.status === "signed", label: "Signed", at: r.signedAt },
        ];
        const overdue = r.dueAt && (r.status === "sent" || r.status === "viewed") && r.dueAt < new Date().toISOString().slice(0, 10);
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
            <FileSignature className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <Link href={r.status === "draft" ? `/app/sign/new?draft=${r.id}` : `/app/sign/${r.id}`} className="block truncate text-sm font-medium hover:underline">{r.title}</Link>
              <p className="truncate text-xs text-muted-foreground">
                {showClient && r.clientName ? (
                  <>
                    <Link href={`/app/clients/${r.clientId}`} className="hover:text-foreground hover:underline">
                      {r.clientName}
                    </Link>
                    {" · "}
                  </>
                ) : null}
                {r.fields.length} field{r.fields.length === 1 ? "" : "s"}
                {r.sentByName ? ` · by ${r.sentByName}` : ""} · <span suppressHydrationWarning>{relativeDays(r.signedAt ?? r.createdAt)}</span>
                {r.dueAt && r.status !== "signed" ? <span className={overdue ? "text-rose-500" : ""}> · due {dmy(r.dueAt)}</span> : null}
              </p>
            </div>
            {r.status !== "draft" && r.status !== "void" ? (
              <ol className="hidden items-center gap-1 sm:flex" aria-label="Progress">
                {steps.map((s, i) => (
                  <li key={s.label} className="flex items-center gap-1" title={s.at ? `${s.label} ${new Date(s.at).toLocaleString("en-AU")}` : s.label}>
                    {i ? <span className={`h-px w-4 ${s.on ? "bg-emerald-500" : "bg-border"}`} /> : null}
                    <span className={`grid size-4 place-items-center rounded-full ${s.on ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{s.on ? <CheckCircle2 className="size-3" /> : <Clock3 className="size-2.5" />}</span>
                  </li>
                ))}
              </ol>
            ) : null}
            <Pill t={overdue ? "red" : st.t}>{overdue ? "Overdue" : st.label}</Pill>
            {r.status === "signed" && r.signedKey ? (
              <Button asChild size="icon-xs" variant="ghost" aria-label="Signed PDF">
                <a href={fileUrl(r.signedKey, r.signedName ?? "signed.pdf")} target="_blank" rel="noreferrer">
                  <Download />
                </a>
              </Button>
            ) : r.status === "draft" ? (
              <Button asChild size="xs" variant="outline">
                <Link href={`/app/sign/new?draft=${r.id}`}>Finish</Link>
              </Button>
            ) : null}
            <SignRequestActions id={r.id} status={r.status} />
          </li>
        );
      })}
    </ul>
  );
}
