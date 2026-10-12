"use client";

import { Check, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { uploadClientFile } from "@/components/mail/uploader";
import { Button } from "@/components/ui/button";
import { clientAttach } from "@/lib/client-actions";

/** Picks files (camera on phones), uploads them and files them on the case/checklist item. */
export function PortalUpload({ agencyId, clientId, matterId = null, itemId = null, label = "Upload", variant = "outline", size = "xs" }: { agencyId: string; clientId: string; matterId?: string | null; itemId?: string | null; label?: string; variant?: "outline" | "default" | "secondary"; size?: "xs" | "sm" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const router = useRouter();
  async function send(files: FileList | null) {
    if (!files?.length) return;
    try {
      for (const f of Array.from(files)) {
        setPct(0);
        const file = await uploadClientFile(agencyId, clientId, f, setPct);
        const r = await clientAttach(matterId, itemId, file);
        if (!r.ok) throw new Error(r.error);
      }
      setDone(true);
      toast.success(files.length > 1 ? `${files.length} files sent` : "File sent to your agent");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPct(null);
      if (ref.current) ref.current.value = "";
    }
  }
  return (
    <>
      <input ref={ref} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.heic" className="hidden" onChange={(e) => send(e.target.files)} />
      <Button type="button" size={size} variant={variant} className="shrink-0 rounded-full" disabled={pct != null} onClick={() => ref.current?.click()}>
        {pct != null ? <Loader2 className="animate-spin" /> : done ? <Check /> : <Upload />}
        {pct != null ? `${Math.round(pct)}%` : label}
      </Button>
    </>
  );
}
