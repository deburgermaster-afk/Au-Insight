import { Paperclip, PenLine } from "lucide-react";
import { fileUrl } from "@/components/mail/file-icon";
import { MessageSheet } from "@/components/portal/message";
import { Button } from "@/components/ui/button";
import { requireClient } from "@/lib/client-auth";
import { portalMessages } from "@/lib/client-data";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Messages" };

export default async function Messages() {
  const c = await requireClient();
  const rows = await portalMessages(c);
  const me = (c.client.email ?? "").toLowerCase();
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between px-0.5 pt-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Messages</h1>
          <p className="text-xs text-muted-foreground">Emails between you and {c.agency.name}</p>
        </div>
        <MessageSheet
          to={c.agency.name}
          trigger={
            <Button size="sm" className="rounded-full">
              <PenLine /> New
            </Button>
          }
        />
      </div>
      <ol className="grid gap-2">
        {rows.map((m) => {
          const mine = m.fromAddress.toLowerCase() === me;
          return (
            <li key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <details className={cn("group max-w-[88%] rounded-2xl border px-3 py-2", mine ? "rounded-br-md border-primary/30 bg-primary/10" : "rounded-bl-md bg-card")}>
                <summary className="cursor-pointer list-none">
                  <p className="flex items-baseline gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground">{mine ? "You" : (m.fromName ?? m.fromAddress)}</span>
                    <span className="ml-auto shrink-0" suppressHydrationWarning>
                      {ago(m.sentAt)}
                    </span>
                  </p>
                  <p className="text-[13px] font-medium">{m.subject}</p>
                  <p className="line-clamp-2 text-xs text-muted-foreground group-open:hidden">{m.bodyText}</p>
                </summary>
                <p className="mt-1 text-xs leading-relaxed whitespace-pre-line">{m.bodyText}</p>
                {m.attachments.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.attachments.map((a) => (
                      <a key={a.key} href={fileUrl(a.key, a.name)} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px]">
                        <Paperclip className="size-3" /> {a.name}
                      </a>
                    ))}
                  </div>
                ) : null}
              </details>
            </li>
          );
        })}
      </ol>
      {!rows.length ? <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">No messages yet. Send one and we'll reply by email.</p> : null}
    </div>
  );
}
