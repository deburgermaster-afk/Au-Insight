"use client";

import { Check, Loader2, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { useConfigure } from "@/components/settings/configure";
import { Button } from "@/components/ui/button";
import { setAiDocs } from "@/lib/ai-doc-actions";

/** Consent for AI document checks and drafting: what is shared, what isn't, then on/off. */
export function AiDocsConsent({ on }: { on: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const popup = useConfigure();
  return (
    <div className="grid gap-4 text-[13px]">
      <div className="grid gap-2 rounded-xl border p-3.5">
        <p className="font-medium">What the AI sees</p>
        {["Each uploaded document (the image, or a PDF's text and page images), with the checklist item it was filed under", "The client's name, date of birth, passport number and expiry, to compare with the document", "For drafts: the case file (client details, visa, checklist, documents on file and the Department's correspondence)"].map((x) => (
          <p key={x} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> {x}
          </p>
        ))}
      </div>
      <div className="grid gap-2 rounded-xl border p-3.5">
        <p className="flex items-center gap-1.5 font-medium">
          <Lock className="size-3.5" /> What it never does
        </p>
        {["Change a checklist status, approve a document or lodge anything", "Send anything to the client or the Department", "Use documents from other clients or other agencies"].map((x) => (
          <p key={x} className="flex gap-2 text-muted-foreground">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" /> {x}
          </p>
        ))}
      </div>
      <p className="text-[12px] text-muted-foreground">Documents are sent to Lodgely&apos;s AI service (xKiro) to be read. Results are advice for the registered migration agent, who stays responsible for every check and every word submitted.</p>
      <div className="flex justify-end gap-2">
        {on ? (
          <Button variant="outline" className="rounded-full" disabled={pending} onClick={() => start(async () => {
            const r = await setAiDocs(false);
            if (!r.ok) return void toast.error(r.error);
            toast.success("AI document checks and drafting turned off");
            popup?.close();
            router.refresh();
          })}>
            Turn off
          </Button>
        ) : (
          <Button className="rounded-full" disabled={pending} onClick={() => start(async () => {
            const r = await setAiDocs(true);
            if (!r.ok) return void toast.error(r.error);
            toast.success("On. New uploads are checked automatically.");
            popup?.close();
            router.refresh();
          })}>
            {pending ? <Loader2 className="animate-spin" /> : <Check />} I agree, turn it on
          </Button>
        )}
      </div>
    </div>
  );
}
