"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { ActionResult } from "@/lib/actions";

/**
 * A dialog holding a form that posts to a server action. The action refreshes the agency's cache
 * tag, so the page behind updates on its own; [goTo] navigates to the created record.
 */
export function ActionDialog({
  trigger,
  title,
  description,
  action,
  children,
  submitLabel = "Save",
  success = "Saved",
  goTo,
  wide,
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  action: (f: FormData) => Promise<ActionResult>;
  children: ReactNode;
  submitLabel?: string;
  success?: string;
  goTo?: (id: string) => string;
  wide?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className={`gap-0 overflow-hidden rounded-3xl p-0 ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"}`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            start(async () => {
              const r = await action(data);
              if (!r.ok) {
                toast.error(r.error);
                return;
              }
              toast.success(success);
              setOpen(false);
              if (goTo && r.id) router.push(goTo(r.id));
            });
          }}
          className="grid"
        >
          <div className="h-20 bg-[radial-gradient(120%_140%_at_10%_0%,oklch(0.75_0.15_55/.55),transparent_55%),radial-gradient(120%_160%_at_90%_10%,oklch(0.6_0.18_300/.45),transparent_60%),linear-gradient(180deg,oklch(0.3_0.03_260),transparent)]" />
          <DialogHeader className="-mt-6 px-6">
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="grid max-h-[58vh] gap-4 overflow-y-auto px-6 py-5">{children}</div>
          <DialogFooter className="mx-0 mb-0 grid grid-cols-2 gap-2 border-0 bg-transparent px-6 pb-6 pt-1 sm:grid-cols-2">
            <Button type="button" variant="secondary" className="h-10 rounded-full" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button type="submit" disabled={pending} className="h-10 rounded-full">
              {pending ? <Loader2 className="animate-spin" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Runs a server action from a button or menu item, with a toast. */
export function useAction() {
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>, success?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error(r.error);
      else if (success) toast.success(success);
    });
  return { pending, run };
}
