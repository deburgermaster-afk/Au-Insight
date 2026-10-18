"use client";

import { Loader2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { undoable } from "@/components/undo/undo";
import { undoAudit } from "@/lib/record-actions";

/** Reverses one audit entry (an edit, add, removal or restore) from the audit log. */
export function RevertButton({ id, what }: { id: string; what: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await undoAudit(id);
          if (!r.ok) return void toast.error(r.error);
          undoable(r.undo, `undo ${what}`, `Reverted: ${what}`);
          router.refresh();
        })
      }
      className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground transition hover:text-foreground"
    >
      {pending ? <Loader2 className="size-3 animate-spin" /> : <Undo2 className="size-3" />} Revert
    </button>
  );
}
