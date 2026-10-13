"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveAgreementTerms } from "@/lib/agreement-actions";
import { useConfigure } from "./configure";

/** The wording clients sign. "## " starts a heading; {agency}, {client} and {visa} are filled in. */
export function AgreementTerms({ value, template, custom, canEdit }: { value: string; template: string; custom: boolean; canEdit: boolean }) {
  const [text, setText] = useState(value);
  const [pending, start] = useTransition();
  const router = useRouter();
  const popup = useConfigure();
  const save = (v: string, msg: string) =>
    start(async () => {
      const r = await saveAgreementTerms(v);
      if (!r.ok) return void toast.error(r.error);
      toast.success(msg);
      popup?.close();
      router.refresh();
    });
  return (
    <div className="grid gap-3">
      <p className="text-[13px] text-muted-foreground">
        {custom ? "Your agency's own wording." : "Lodgely's template, written around the Code of Conduct. Have it reviewed for your practice before relying on it."} Each agreement also lists the parties, the agent&apos;s MARN and the fee estimate from the matter. Start a heading with <span className="font-mono">##</span>; <span className="font-mono">{"{agency}"}</span>, <span className="font-mono">{"{client}"}</span> and <span className="font-mono">{"{visa}"}</span> are filled in. Changes apply to agreements sent from now on.
      </p>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} disabled={!canEdit} rows={24} className="font-mono text-[12px] leading-relaxed" />
      {canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          {custom ? (
            <Button variant="ghost" className="rounded-full text-muted-foreground" disabled={pending} onClick={() => confirm("Go back to Lodgely's template?") && (setText(template), save("", "Template restored"))}>
              <RotateCcw /> Use the template
            </Button>
          ) : null}
          <Button className="rounded-full" disabled={pending || text === value} onClick={() => save(text, "Agreement terms saved")}>
            {pending ? <Loader2 className="animate-spin" /> : null} Save terms
          </Button>
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground">Only owners and admins can change these.</p>
      )}
    </div>
  );
}
