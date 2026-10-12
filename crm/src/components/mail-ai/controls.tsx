"use client";

import { Bot, BotOff, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setAiMail, setMatterTracking } from "@/lib/mail-ai-actions";
import { MailAiConsent } from "./consent";

/** Settings card: agency-wide switch for the AI mail assistant. */
export function AiMailCard({ on, by, at, available }: { on: boolean; by: string | null; at: string | null; available: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center">
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl ${on ? "bg-gradient-to-br from-orange-400 to-fuchsia-500 text-white" : "bg-muted text-muted-foreground"}`}>
        <Bot className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">AI mail assistant {on ? <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-500">On</span> : <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Off</span>}</p>
        <p className="text-xs text-muted-foreground">
          {on
            ? `Turned on by ${by ?? "an admin"}${at ? ` on ${at}` : ""}. Emails from Home Affairs, assessing bodies and tracked cases are understood and linked to clients. AI never replies.`
            : available
              ? "Understand grants, requests and deadlines in incoming mail and link them to the right client. AI never replies or changes anything without you."
              : "Needs the AI service to be configured on the server."}
        </p>
      </div>
      {on ? (
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await setAiMail(false);
              if (!r.ok) toast.error(r.error);
              else toast.success("AI mail assistant turned off");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : <BotOff />} Turn off
        </Button>
      ) : (
        <MailAiConsent
          scope="agency"
          trigger={
            <Button size="sm" className="rounded-full" disabled={!available}>
              <Bot /> See how it works
            </Button>
          }
        />
      )}
    </div>
  );
}

/** Matter header pill: shows AI tracking state; asks for consent to turn it on. */
export function MatterAiToggle({ matterId, tracking, clientName, agencyOn }: { matterId: string; tracking: boolean | null; clientName: string; agencyOn: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!agencyOn) return null;
  if (tracking)
    return (
      <Button
        size="sm"
        variant="outline"
        className="rounded-full border-emerald-500/40 text-emerald-500"
        disabled={pending}
        title="AI reads emails about this case. Click to stop."
        onClick={() =>
          start(async () => {
            const r = await setMatterTracking(matterId, false);
            if (!r.ok) toast.error(r.error);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Bot />} AI tracking on
      </Button>
    );
  return (
    <MailAiConsent
      scope="matter"
      matterId={matterId}
      clientName={clientName}
      trigger={
        <Button size="sm" variant="outline" className="rounded-full">
          <Bot /> AI tracking
        </Button>
      }
    />
  );
}
