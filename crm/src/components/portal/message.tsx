"use client";

import { Loader2, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { clientMessage } from "@/lib/client-actions";

/** A bottom sheet to message the agency, optionally about one case. */
export function MessageSheet({ trigger, matterId, subject, to }: { trigger: ReactNode; matterId?: string; subject?: string; to: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>{trigger}</DrawerTrigger>
      <DrawerContent className="mx-auto max-w-lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            start(async () => {
              const r = await clientMessage(f);
              if (!r.ok) return void toast.error(r.error);
              toast.success("Message sent. We'll reply by email.");
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <DrawerHeader className="text-left">
            <DrawerTitle>Message {to}</DrawerTitle>
            <DrawerDescription>Usually answered within one business day.</DrawerDescription>
          </DrawerHeader>
          <div className="grid gap-2 px-4">
            {matterId ? <input type="hidden" name="matterId" value={matterId} /> : null}
            <Input name="subject" defaultValue={subject} placeholder="Subject" className="h-9" />
            <Textarea name="body" required rows={5} placeholder="Write your message…" className="resize-none" autoFocus />
          </div>
          <DrawerFooter className="flex-row gap-2">
            <DrawerClose asChild>
              <Button type="button" variant="secondary" className="flex-1 rounded-full">
                Cancel
              </Button>
            </DrawerClose>
            <Button type="submit" className="flex-1 rounded-full" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Send />}
              Send
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
