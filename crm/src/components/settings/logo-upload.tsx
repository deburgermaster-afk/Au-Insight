"use client";

import { ImageUp, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeLogo, uploadLogo } from "@/lib/brand-actions";

/** Upload or replace the agency logo; shows how it sits on a letterhead. */
export function LogoUpload({ hasLogo, agencyName, canEdit, onChange }: { hasLogo: boolean; agencyName: string; canEdit: boolean; onChange?: () => void }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState(0); // busts the preview cache after an upload
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pick = (file: File | undefined) => {
    if (!file) return;
    const fd = new FormData();
    fd.set("logo", file);
    start(async () => {
      const r = await uploadLogo(fd);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Logo saved. It's on every new PDF from now on.");
        setV((x) => x + 1);
        onChange?.();
        router.refresh();
      }
    });
  };
  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-3 rounded-xl border bg-white p-4 text-zinc-900">
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/agency/logo?v=${v}`} alt="Agency logo" className="h-10 max-w-[160px] object-contain" />
        ) : (
          <span className="grid h-10 w-24 place-items-center rounded-md border border-dashed border-zinc-300 text-[10px] text-zinc-400">Your logo</span>
        )}
        <span className="text-[15px] font-bold">{agencyName}</span>
        <span className="ml-auto hidden text-right text-[9px] leading-tight text-zinc-500 sm:block">
          ABN · address
          <br />
          phone · email
        </span>
      </div>
      <p className="text-[12px] text-muted-foreground">PNG or JPG up to 900 KB. A wide logo on a transparent or white background works best. It appears on consent forms, letters, scholarship offers, tuition receipts, agreements and contracts.</p>
      {canEdit ? (
        <div className="flex gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
          <Button size="sm" disabled={pending} onClick={() => input.current?.click()}>
            <ImageUp className="size-4" /> {pending ? "Uploading…" : hasLogo ? "Replace logo" : "Upload logo"}
          </Button>
          {hasLogo ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await removeLogo();
                  if (!r.ok) toast.error(r.error);
                  else {
                    onChange?.();
                    router.refresh();
                  }
                })
              }
            >
              <Trash2 className="size-4" /> Remove
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
