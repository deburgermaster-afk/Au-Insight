"use client";

import { Check, Download, Lock, ShieldCheck, Unplug } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { revokeExtension } from "@/lib/ext-actions";
import { ago } from "@/lib/format";

type Ext = { id: string; label: string | null; createdAt: Date; lastUsedAt: Date | null };

/** Install steps, signed-in browsers and the download for the ImmiAccount helper extension. */
export function ImmiHelperSetup({ extensions }: { extensions: Ext[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="grid gap-3">
      {extensions.map((x) => (
        <div key={x.id} className="flex items-center gap-3 rounded-xl border p-3">
          <span className="size-2 shrink-0 rounded-full bg-emerald-500" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{x.label ?? "Browser"}</p>
            <p className="text-[11px] text-muted-foreground" suppressHydrationWarning>
              Connected {ago(x.createdAt)}
              {x.lastUsedAt ? ` · last used ${ago(x.lastUsedAt)}` : ""}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-muted-foreground"
            disabled={pending}
            onClick={() =>
              confirm("Sign this browser out of the ImmiAccount helper?") &&
              start(async () => {
                const r = await revokeExtension(x.id);
                if (!r.ok) toast.error(r.error);
                else toast.success("Signed out");
                router.refresh();
              })
            }
          >
            <Unplug /> Sign out
          </Button>
        </div>
      ))}
      <ol className="grid list-decimal gap-1.5 rounded-xl border p-3.5 pl-8 text-[13px]">
        <li>Download the extension and unzip it.</li>
        <li>
          In Chrome open <span className="font-mono text-[12px]">chrome://extensions</span> (Edge: <span className="font-mono text-[12px]">edge://extensions</span>), turn on <b className="font-medium">Developer mode</b>, click <b className="font-medium">Load unpacked</b> and pick the unzipped folder.
        </li>
        <li>
          Click the Lodgely icon in the toolbar, then <b className="font-medium">Connect</b>, and allow it in Lodgely.
        </li>
        <li>
          In ImmiAccount, pick the case in the side panel and click <b className="font-medium">Fill this page</b>.
        </li>
      </ol>
      <div className="grid gap-3 rounded-xl border bg-muted/20 p-3.5 text-[13px]">
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <ShieldCheck className="size-3.5" /> It can
        </p>
        {["List your agency's open cases and read the one you pick", "Fill ImmiAccount fields on the page you're on, when you click Fill", "Outline every field it filled so you can check it"].map((c) => (
          <p key={c} className="flex gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-500" /> {c}
          </p>
        ))}
        <p className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <Lock className="size-3.5" /> It never
        </p>
        {["Sees or stores your ImmiAccount password", "Clicks Next, Submit or Pay", "Changes anything in Lodgely"].map((c) => (
          <p key={c} className="flex gap-2 text-muted-foreground">
            <span className="mt-[7px] size-1 shrink-0 rounded-full bg-muted-foreground" /> {c}
          </p>
        ))}
      </div>
      <div className="flex justify-end">
        <Button asChild className="rounded-full">
          <a href="/downloads/lodgely-immiaccount-helper.zip" download>
            <Download /> Download extension
          </a>
        </Button>
      </div>
    </div>
  );
}
