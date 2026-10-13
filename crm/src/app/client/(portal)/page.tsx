import { CalendarDays, ChevronRight, FileSignature, FileUp, Mail, Phone, Wallet } from "lucide-react";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema as s } from "@/db";
import Link from "next/link";
import { MessageSheet } from "@/components/portal/message";
import { stageInfo, stageLabel, stageProgress } from "@/components/portal/stage";
import { PortalTimeline } from "@/components/portal/timeline";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { requireClient } from "@/lib/client-auth";
import { portalHome } from "@/lib/client-data";
import { aud, dmy, time } from "@/lib/format";

export const metadata = { title: "Home" };

const waiting = (st: string) => st === "needed" || st === "requested" || st === "rejected";

export default async function PortalHome() {
  const c = await requireClient();
  const [{ matters, items, invoices, appts, recent }, toSign] = await Promise.all([
    portalHome(c),
    db.select({ id: s.serviceAgreements.id, content: s.serviceAgreements.content }).from(s.serviceAgreements).where(and(eq(s.serviceAgreements.clientId, c.client.id), inArray(s.serviceAgreements.status, ["sent", "viewed"]))),
  ]);
  const open = matters.filter((r) => r.m.stage !== "closed");
  const todo = items.filter((i) => i.required && waiting(i.status));
  const owing = invoices.reduce((t, i) => t + Math.max(0, Number(i.total) - Number(i.paid)), 0);
  const nextDue = invoices.filter((i) => Number(i.total) > Number(i.paid)).sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt)))[0];
  const agent = open.find((r) => r.agent) ?? matters.find((r) => r.agent);
  const firstTodo = todo[0] ? open.find((r) => r.m.id === todo[0].matterId) : null;
  return (
    <div className="grid gap-3">
      <section className="px-0.5 pt-1">
        <h1 className="text-lg font-semibold tracking-tight">Hi {c.client.firstName}</h1>
        <p className="text-xs text-muted-foreground">
          {open.length ? `${open.length} active case${open.length > 1 ? "s" : ""}` : "No active cases"} · {todo.length ? `${todo.length} document${todo.length > 1 ? "s" : ""} to upload` : "nothing to upload"}
        </p>
      </section>

      {toSign.map((a) => (
        <Link key={a.id} href={`/client/agreements/${a.id}`} className="flex items-center gap-3 rounded-2xl border border-sky-500/40 bg-sky-500/[0.06] p-3.5 transition active:scale-[.98]">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-500/15 text-sky-500">
            <FileSignature className="size-4.5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Sign your service agreement</span>
            <span className="block truncate text-[12px] text-muted-foreground">{a.content.matter.visa}</span>
          </span>
          <ChevronRight className="size-4 text-muted-foreground" />
        </Link>
      ))}

      <section className="grid grid-cols-2 gap-2">
        <Link href={firstTodo ? `/client/cases/${firstTodo.m.id}` : "/client/documents"} className="rounded-xl border bg-card p-3 transition active:scale-[.98]">
          <span className="flex items-center justify-between">
            <FileUp className="size-4 text-amber-500" />
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </span>
          <p className="mt-2 text-xl font-semibold tabular-nums">{todo.length}</p>
          <p className="text-[11px] text-muted-foreground">Documents needed</p>
        </Link>
        <Link href={nextDue ? `/client/payments/${nextDue.id}` : "/client/payments"} className="rounded-xl border bg-card p-3 transition active:scale-[.98]">
          <span className="flex items-center justify-between">
            <Wallet className="size-4 text-emerald-500" />
            <ChevronRight className="size-3.5 text-muted-foreground" />
          </span>
          <p className="mt-2 text-xl font-semibold tabular-nums">{aud(owing)}</p>
          <p className="text-[11px] text-muted-foreground">{nextDue ? `Due ${dmy(nextDue.dueAt)}` : "All paid"}</p>
        </Link>
      </section>

      <section className="grid gap-2">
        <h2 className="px-0.5 text-xs font-medium text-muted-foreground">Your cases</h2>
        {matters.map(({ m }) => {
          const its = items.filter((i) => i.matterId === m.id && i.required);
          const got = its.filter((i) => !waiting(i.status)).length;
          return (
            <Link key={m.id} href={`/client/cases/${m.id}`} className="block rounded-xl border bg-card p-3 transition active:scale-[.99]">
              <div className="flex items-start gap-2.5">
                <span className="grid h-9 min-w-9 place-items-center rounded-lg bg-muted px-1.5 font-mono text-xs font-semibold">{m.visaCode}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {m.reference} · {stageLabel(m.stage)}
                  </p>
                </div>
                {m.outcome ? <Badge variant={m.outcome === "granted" ? "default" : "destructive"} className="capitalize">{m.outcome}</Badge> : <ChevronRight className="mt-1 size-4 text-muted-foreground" />}
              </div>
              <Progress value={stageProgress(m.stage)} className="mt-3 h-1.5" />
              <p className="mt-2 line-clamp-1 text-[11px] text-muted-foreground">{stageInfo[m.stage]}</p>
              {its.length && m.stage !== "closed" ? (
                <p className="mt-1 text-[11px]">
                  <span className={got < its.length ? "text-amber-500" : "text-emerald-500"}>
                    {got}/{its.length} documents
                  </span>
                  {m.rfiDueAt && !m.decisionAt ? <span className="text-rose-500"> · response due {dmy(m.rfiDueAt)}</span> : null}
                </p>
              ) : null}
            </Link>
          );
        })}
        {!matters.length ? <p className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Your cases will appear here once your agent opens them.</p> : null}
      </section>

      {appts.length ? (
        <section className="grid gap-2">
          <h2 className="px-0.5 text-xs font-medium text-muted-foreground">Upcoming</h2>
          {appts.map(({ a, staff }) => (
            <div key={a.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky-500/10 text-sky-500">
                <CalendarDays className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.title}</p>
                <p className="truncate text-[11px] text-muted-foreground" suppressHydrationWarning>
                  {dmy(a.startsAt)} · {time(a.startsAt)} · {a.location ?? "Office"}
                  {staff ? ` · with ${staff}` : ""}
                </p>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-xs font-semibold text-white">
            {(agent?.agent ?? c.agency.name)
              .split(" ")
              .map((w) => w[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{agent?.agent ?? c.agency.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">Your {agent?.agent ? "migration agent" : "agency"}</p>
          </div>
          {c.profile?.phone ? (
            <Button asChild size="icon-sm" variant="outline" className="rounded-full">
              <a href={`tel:${c.profile.phone.replace(/\s|\(|\)/g, "")}`} aria-label="Call">
                <Phone />
              </a>
            </Button>
          ) : null}
          <MessageSheet
            to={agent?.agent?.split(" ")[0] ?? c.agency.name}
            trigger={
              <Button size="icon-sm" className="rounded-full" aria-label="Message">
                <Mail />
              </Button>
            }
          />
        </div>
      </section>

      <section className="rounded-xl border bg-card p-3">
        <h2 className="mb-3 text-xs font-medium text-muted-foreground">Latest updates</h2>
        <PortalTimeline items={recent} />
      </section>
    </div>
  );
}
