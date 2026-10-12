"use client";

import { Bot, Check, Loader2, ShieldCheck, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { setAiMail, setMatterTracking } from "@/lib/mail-ai-actions";
import { MailAiDemo } from "./demo";

const shared = ["Sender, subject and date", "The email's text", "Attachment file names (not the files)", "The linked case's visa subclass and stage"];
const never = ["Your client list or other clients' details", "Passport scans or attachment contents", "Fees, invoices and trust records"];
const nevers = ["Reply to or send any email", "Delete or move mail", "Change a case without your click"];

/**
 * Consent for the AI mail assistant, with a three-step demo. "agency" turns it on for the whole
 * agency (admins); "matter" turns on tracking for one case when it moves forward.
 */
export function MailAiConsent({ scope, matterId, clientName, trigger, open: openProp, onOpenChange }: { scope: "agency" | "matter"; matterId?: string; clientName?: string; trigger?: ReactNode; open?: boolean; onOpenChange?: (v: boolean) => void }) {
  const [inner, setInner] = useState(false);
  const open = openProp ?? inner;
  const setOpen = onOpenChange ?? setInner;
  const [agree, setAgree] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const decide = (on: boolean) =>
    start(async () => {
      const r = scope === "agency" ? await setAiMail(on) : await setMatterTracking(matterId!, on);
      if (!r.ok) return void toast.error(r.error);
      toast.success(on ? (scope === "agency" ? "AI mail assistant is on" : "AI tracking on for this case") : "Okay, AI won't read this case's emails");
      setOpen(false);
      router.refresh();
    });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[92dvh] gap-0 overflow-y-auto rounded-3xl p-0 sm:max-w-2xl">
        <div className="p-5 pb-3 sm:p-6 sm:pb-3">
          <DialogHeader>
            <span className="mb-1 grid size-10 place-items-center rounded-2xl bg-gradient-to-br from-orange-400 to-fuchsia-500 text-white">
              <Bot className="size-5" />
            </span>
            <DialogTitle className="text-lg">{scope === "agency" ? "Turn on the AI mail assistant" : `Track ${clientName ? `${clientName}'s` : "this case's"} emails with AI?`}</DialogTitle>
            <DialogDescription>
              {scope === "agency"
                ? "When Home Affairs, an assessing body or a client emails your agency, AI works out which client it's about and what it means. You stay in control of every change."
                : "Emails about this case (from Home Affairs, assessing bodies or the client) will be read by AI so grants, requests and deadlines show up on the client's file straight away."}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-5 sm:px-6">
          <MailAiDemo />
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
          <div className="rounded-2xl border p-3">
            <p className="text-xs font-medium">Shared with AI</p>
            <ul className="mt-2 grid gap-1">
              {shared.map((t) => (
                <li key={t} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border p-3">
            <p className="text-xs font-medium">Never shared</p>
            <ul className="mt-2 grid gap-1">
              {never.map((t) => (
                <li key={t} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <X className="mt-0.5 size-3 shrink-0 text-rose-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border p-3">
            <p className="text-xs font-medium">AI never will</p>
            <ul className="mt-2 grid gap-1">
              {nevers.map((t) => (
                <li key={t} className="flex gap-1.5 text-[11px] text-muted-foreground">
                  <ShieldCheck className="mt-0.5 size-3 shrink-0 text-sky-500" /> {t}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] text-muted-foreground sm:col-span-3">
            Emails are matched to clients inside Lodgely first, without AI. Only emails from authorities, emails for cases with AI tracking on, or emails you choose to analyse are sent to the AI service (xKiro gateway). Results are stored with the email and can be dismissed. You can turn this off at any time in Settings.
          </p>
        </div>
        <div className="flex flex-col gap-3 border-t bg-muted/20 p-5 sm:flex-row sm:items-center sm:p-6">
          <label className="flex flex-1 items-start gap-2 text-xs">
            <Checkbox checked={agree} onCheckedChange={(v) => setAgree(v === true)} className="mt-0.5" />
            <span>{scope === "agency" ? "I'm authorised to turn this on for the agency and I understand what is shared." : "I understand what is shared for this case."}</span>
          </label>
          <div className="flex gap-2">
            <Button variant="ghost" className="rounded-full" disabled={pending} onClick={() => (scope === "matter" ? decide(false) : setOpen(false))}>
              {scope === "matter" ? "Not for this case" : "Not now"}
            </Button>
            <Button className="rounded-full" disabled={!agree || pending} onClick={() => decide(true)}>
              {pending ? <Loader2 className="animate-spin" /> : <Bot />} Turn on
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
