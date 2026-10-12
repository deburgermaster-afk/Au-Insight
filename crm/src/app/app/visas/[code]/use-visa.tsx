"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { SelectField } from "@/components/forms/fields";
import type { Pickers } from "@/components/forms/dialogs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { createMatter } from "@/lib/actions";

/** Opens a matter on this visa for a client, then lands on it with the checklist dialog open. */
export function UseVisa({ code, name, streams, pickers }: { code: string; name: string; streams: string[]; pickers: Pickers }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="rounded-full">
          <Send /> Send checklist to a client
        </Button>
      </DialogTrigger>
      <DialogContent className="gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-md">
        <div className="h-20 bg-[linear-gradient(160deg,#1e2a44,#5b4a63_55%,#d08a5c)]" />
        <form
          className="grid gap-4 p-6"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            f.set("visaCode", code);
            f.set("stage", "documents");
            start(async () => {
              const r = await createMatter(f);
              if (!r.ok || !r.id) return void toast.error(r.ok ? "Couldn't open the matter" : r.error);
              setOpen(false);
              router.push(`/app/matters/${r.id}?send=1`);
            });
          }}
        >
          <div>
            <DialogTitle>
              {code} · {name}
            </DialogTitle>
            <DialogDescription className="mt-1">Opens a matter with this visa's checklist, then you pick the documents to request.</DialogDescription>
          </div>
          <SelectField label="Client" name="clientId" options={pickers.clients.map((c) => ({ value: c.id, label: c.name }))} required />
          {streams.length ? <SelectField label="Stream" name="stream" options={streams.map((s) => ({ value: s, label: s }))} /> : null}
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button type="button" variant="secondary" className="h-10 rounded-full" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" className="h-10 rounded-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : null} Continue
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
