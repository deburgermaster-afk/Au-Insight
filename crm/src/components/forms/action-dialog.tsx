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
      <DialogContent className={wide ? "sm:max-w-2xl" : "sm:max-w-lg"}>
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
          className="grid gap-5"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <div className="-mx-1 grid max-h-[62vh] gap-4 overflow-y-auto px-1 py-0.5">{children}</div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
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
