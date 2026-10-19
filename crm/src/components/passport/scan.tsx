"use client";

import { AlertTriangle, BadgeCheck, Loader2, ScanLine, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import type { MailAttachment } from "@/db/crm-schema";
import { uploadFile } from "@/components/mail/uploader";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { applyPassport, clientFromPassport, type PassportFields, readPassport } from "@/lib/passport-actions";

const LABELS: [keyof PassportFields, string][] = [
  ["firstName", "Given names"],
  ["lastName", "Family name"],
  ["passportNumber", "Passport number"],
  ["passportExpiry", "Passport expiry"],
  ["dateOfBirth", "Date of birth"],
  ["nationality", "Nationality"],
  ["gender", "Sex"],
  ["countryOfBirth", "Country of birth"],
];

/** Scan a passport photo page: for an existing client (compare and update) or to add a new client. */
export function PassportScan({ agencyId, clientId, current, trigger }: { agencyId: string; clientId?: string; current?: Partial<Record<keyof PassportFields, string | null>>; trigger?: React.ReactNode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<MailAttachment | null>(null);
  const [fields, setFields] = useState<PassportFields | null>(null);
  const [verified, setVerified] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [pick, setPick] = useState<Set<keyof PassportFields>>(new Set());

  const reset = () => {
    setFile(null);
    setFields(null);
    setWarnings([]);
    setPick(new Set());
  };

  async function scan(f: File) {
    try {
      setBusy("Uploading…");
      const up = await uploadFile(agencyId, `docs/${clientId ?? "passports"}`, f);
      setFile(up);
      setBusy("Reading the passport…");
      const r = await readPassport(up);
      if (!r.ok) throw new Error(r.error);
      setFields(r.fields);
      setVerified(r.verified);
      setWarnings(r.warnings);
      // Pre-tick fields that are empty on file or differ from the passport.
      setPick(new Set(LABELS.map(([k]) => k).filter((k) => r.fields[k] && String(r.fields[k]).toLowerCase() !== String(current?.[k] ?? "").toLowerCase())));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  }

  async function save() {
    if (!fields || !file) return;
    setBusy("Saving…");
    const r = clientId ? await applyPassport(clientId, Object.fromEntries([...pick].map((k) => [k, fields[k]])), file) : await clientFromPassport(fields, file);
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(clientId ? "Client updated from the passport" : "Client added");
    setOpen(false);
    reset();
    if (!clientId && r.id) router.push(`/app/clients/${r.id}`);
    else router.refresh();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <ScanLine /> Scan passport
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{clientId ? "Update from a passport" : "Add a client from a passport"}</DialogTitle>
          <DialogDescription>Photograph or upload the photo page. Lodgely reads it and checks the machine-readable lines, then you choose what to save.</DialogDescription>
        </DialogHeader>
        <input ref={input} type="file" accept="image/*,application/pdf" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
        {!fields ? (
          <Button variant="outline" className="h-24 flex-col gap-1.5" disabled={Boolean(busy)} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
            {busy ?? "Take a photo or choose a file"}
          </Button>
        ) : (
          <div className="grid gap-3">
            {verified ? (
              <p className="flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
                <BadgeCheck className="size-4 shrink-0" /> Machine-readable lines read and check digits match.
              </p>
            ) : null}
            {warnings.map((w) => (
              <p key={w} className="flex items-start gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {w}
              </p>
            ))}
            <div className="grid gap-1.5">
              {LABELS.map(([k, label]) => (
                <div key={k} className="grid grid-cols-[auto_8rem_1fr] items-center gap-2 text-sm">
                  {clientId ? <Checkbox checked={pick.has(k)} disabled={!fields[k]} onCheckedChange={() => setPick((p) => (p.has(k) ? new Set([...p].filter((x) => x !== k)) : new Set([...p, k])))} aria-label={`Save ${label}`} /> : <span />}
                  <span className="text-muted-foreground">{label}</span>
                  <span className="min-w-0">
                    <Input value={fields[k] ?? ""} onChange={(e) => setFields({ ...fields, [k]: e.target.value || null })} className="h-8" />
                    {clientId && current?.[k] && String(current[k]).toLowerCase() !== String(fields[k] ?? "").toLowerCase() ? <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">On file: {current[k]}</span> : null}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">The scan is filed with the client&apos;s identity documents. Check the details against the passport before you save.</p>
          </div>
        )}
        {fields ? (
          <DialogFooter>
            <Button variant="outline" onClick={reset}>
              Scan again
            </Button>
            <Button disabled={Boolean(busy) || (clientId ? !pick.size : !fields.firstName || !fields.lastName)} onClick={save}>
              {busy ? <Loader2 className="animate-spin" /> : null} {clientId ? `Save ${pick.size} field${pick.size === 1 ? "" : "s"}` : "Add client"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
