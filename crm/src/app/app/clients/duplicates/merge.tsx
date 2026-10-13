"use client";

import { Check, GitMerge, Loader2, UserX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { dismissDuplicates, mergeClients } from "@/lib/client-import-actions";
import { cn } from "@/lib/utils";

type Member = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; dateOfBirth: string | null; passportNumber: string | null; nationality: string | null; stage: string; createdAt: Date; matters: number; documents: number; invoices: number };
const FIELDS: [keyof Member, string][] = [
  ["firstName", "First name"],
  ["lastName", "Last name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["dateOfBirth", "Date of birth"],
  ["passportNumber", "Passport"],
  ["nationality", "Nationality"],
  ["stage", "Stage"],
];

/** One group of probable duplicates: compare, then merge (admins) or mark as different people. */
export function DuplicateGroup({ members, reasons, canMerge }: { members: Member[]; reasons: string[]; canMerge: boolean }) {
  const [open, setOpen] = useState(false);
  const [keep, setKeep] = useState(members[0].id);
  // For each field, which member's value to use (default: the kept record, else the first that has one).
  const pickDefault = (k: string) => (members.find((m) => m.id === keep)?.[k as keyof Member] ? keep : (members.find((m) => m[k as keyof Member])?.id ?? keep));
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const pickOf = (k: string) => picks[k] ?? pickDefault(k);
  const values = Object.fromEntries(FIELDS.map(([k]) => [k, (members.find((m) => m.id === pickOf(k))?.[k] as string | null) ?? null]));
  const differs = (k: keyof Member) => new Set(members.map((m) => String(m[k] ?? ""))).size > 1;

  return (
    <section className="rounded-2xl border bg-card">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <p className="text-sm font-medium">
          {members[0].firstName} {members[0].lastName}
        </p>
        {reasons.map((r) => (
          <span key={r} className="rounded-full bg-sky-500/12 px-2 py-0.5 text-[11px] text-sky-500">
            {r}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => start(async () => {
            const r = await dismissDuplicates(members.map((m) => m.id));
            if (!r.ok) return void toast.error(r.error);
            toast.success("Marked as different people");
            router.refresh();
          })}>
            <UserX /> Not the same
          </Button>
          {canMerge ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full">
                  <GitMerge /> Merge
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
                <DialogHeader>
                  <DialogTitle>Merge {members.length} records</DialogTitle>
                  <DialogDescription>Choose the value to keep for each detail. Cases, documents, invoices, emails, tasks and payments from every record move to the merged client. This can&apos;t be undone from here.</DialogDescription>
                </DialogHeader>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-[13px]">
                    <thead className="bg-muted/40 text-left text-[11px] text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Detail</th>
                        {members.map((m, i) => (
                          <th key={m.id} className="px-3 py-2 font-medium">
                            <label className="flex items-center gap-1.5">
                              <input type="radio" name="keep" className="accent-foreground" checked={keep === m.id} onChange={() => (setKeep(m.id), setPicks({}))} />
                              Record {i + 1} {keep === m.id ? "(keep)" : ""}
                            </label>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {FIELDS.map(([k, label]) => (
                        <tr key={k} className={cn(differs(k) && "bg-amber-500/[0.04]")}>
                          <td className="px-3 py-2 text-muted-foreground">{label}</td>
                          {members.map((m) => {
                            const v = m[k] as string | null;
                            const on = pickOf(k) === m.id;
                            return (
                              <td key={m.id} className="px-3 py-1.5">
                                <button type="button" disabled={!v && !on} onClick={() => setPicks({ ...picks, [k]: m.id })} className={cn("flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left transition", on ? "bg-foreground/10 font-medium" : "hover:bg-muted", !v && "text-muted-foreground/50")}>
                                  {on ? <Check className="size-3.5 shrink-0" /> : <span className="size-3.5 shrink-0" />}
                                  <span className="truncate">{v || "—"}</span>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                      <tr>
                        <td className="px-3 py-2 text-muted-foreground">Moves across</td>
                        {members.map((m) => (
                          <td key={m.id} className="px-3 py-2 text-[12px] text-muted-foreground">
                            {counts(m)}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[12px] text-muted-foreground">Tags are combined, notes are joined, and the removed records are kept in the audit log.</p>
                <div className="flex justify-end">
                  <Button className="rounded-full" disabled={pending} onClick={() => start(async () => {
                    const r = await mergeClients(keep, members.map((m) => m.id).filter((x) => x !== keep), values);
                    if (!r.ok) return void toast.error(r.error);
                    toast.success("Merged");
                    setOpen(false);
                    router.refresh();
                  })}>
                    {pending ? <Loader2 className="animate-spin" /> : <GitMerge />} Merge into one client
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </header>
      <div className="grid divide-y md:grid-cols-2 md:divide-x md:divide-y-0">
        {members.map((m) => (
          <Link key={m.id} href={`/app/clients/${m.id}`} className="grid gap-0.5 px-4 py-3 text-[13px] transition hover:bg-muted/30">
            <span className="font-medium">
              {m.firstName} {m.lastName}
            </span>
            <span className="text-muted-foreground">{[m.email, m.phone].filter(Boolean).join(" · ") || "No contact details"}</span>
            <span className="text-muted-foreground">{[m.dateOfBirth && `Born ${m.dateOfBirth}`, m.passportNumber && `Passport ${m.passportNumber}`].filter(Boolean).join(" · ") || "—"}</span>
            <span className="text-[12px] text-muted-foreground" suppressHydrationWarning>
              {counts(m)} · added {new Date(m.createdAt).toLocaleDateString("en-AU")}
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
function counts(m: { matters: number; documents: number; invoices: number }) {
  return `${plural(m.matters, "case")} · ${plural(m.documents, "doc")} · ${plural(m.invoices, "invoice")}`;
}
