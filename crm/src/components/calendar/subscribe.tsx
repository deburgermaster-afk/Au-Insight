"use client";

import { CalendarSync, Check, Copy, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { newCalendarFeed } from "@/lib/calendar-feed-actions";

/** Get a private link that shows your Lodgely appointments in Google, Outlook or Apple Calendar. */
export function SubscribeCalendar({ hasFeed }: { hasFeed: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CalendarSync /> Sync to my calendar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Show your appointments in your calendar</DialogTitle>
          <DialogDescription>A private link your calendar app checks for changes. New, moved and cancelled appointments show up on their own (Google checks every few hours).</DialogDescription>
        </DialogHeader>
        {url ? (
          <div className="grid gap-3">
            <div className="flex gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 text-xs">{url}</code>
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                {copied ? <Check /> : <Copy />} Copy
              </Button>
            </div>
            <ul className="grid gap-1.5 text-sm text-muted-foreground">
              <li>
                <b className="text-foreground">Google Calendar:</b> Other calendars → + → From URL → paste.
              </li>
              <li>
                <b className="text-foreground">Outlook:</b> Add calendar → Subscribe from web → paste.
              </li>
              <li>
                <b className="text-foreground">Apple Calendar:</b> File → New Calendar Subscription → paste. On iPhone,{" "}
                <a className="text-primary underline" href={url.replace(/^https?:/, "webcal:")}>
                  tap here
                </a>
                .
              </li>
            </ul>
            <p className="text-[11px] text-muted-foreground">Keep this link private: anyone with it can see your appointment titles and times. Making a new link turns this one off.</p>
          </div>
        ) : (
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await newCalendarFeed();
                if (!r.ok) return void toast.error(r.error);
                setUrl(r.url);
              })
            }
          >
            {pending ? <Loader2 className="animate-spin" /> : <CalendarSync />} {hasFeed ? "Make a new link (the old one stops working)" : "Create my calendar link"}
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
