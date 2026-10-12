"use client";

import { Loader2, Upload } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { registerDocuments } from "@/lib/mail-actions";
import { uploadFile } from "./uploader";

/** Uploads one or more files and files them as documents on a client / matter / checklist item. */
export function UploadButton({
  agencyId,
  clientId,
  matterId,
  checklistItemId,
  category,
  label = "Upload",
  variant = "outline",
  size = "sm",
  icon,
}: {
  agencyId: string;
  clientId?: string | null;
  matterId?: string | null;
  checklistItemId?: string | null;
  category?: string | null;
  label?: string;
  variant?: "outline" | "ghost" | "default" | "secondary";
  size?: "sm" | "xs" | "icon-sm" | "icon-xs";
  icon?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pct, setPct] = useState<number | null>(null);
  async function go(files: FileList | null) {
    if (!files?.length) return;
    try {
      const done = [];
      for (const f of Array.from(files)) {
        setPct(0);
        done.push(await uploadFile(agencyId, `docs/${clientId ?? "general"}`, f, setPct));
      }
      const r = await registerDocuments(done, { clientId, matterId, checklistItemId, category });
      if (!r.ok) throw new Error(r.error);
      toast.success(`${done.length} file${done.length > 1 ? "s" : ""} uploaded`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setPct(null);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => go(e.target.files)} />
      <Button type="button" variant={variant} size={size} disabled={pct != null} onClick={() => input.current?.click()} title={label}>
        {pct != null ? <Loader2 className="animate-spin" /> : (icon ?? <Upload />)}
        {size.startsWith("icon") ? null : pct != null ? `${Math.round(pct)}%` : label}
      </Button>
    </>
  );
}
