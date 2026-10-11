"use client";

import { Archive, ArrowLeft, Inbox, Mail, Reply, Send, Star } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useOptimistic, useState, useTransition } from "react";
import { initials } from "@/lib/format";
import { ComposeDialog } from "@/components/forms/dialogs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { markMessage } from "@/lib/actions";
import { ago, dmy, time } from "@/lib/format";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  folder: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  subject: string;
  bodyText: string | null;
  read: boolean;
  starred: boolean;
  clientId: string | null;
  sentAt: Date;
};

const folders = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "starred", label: "Starred", icon: Star },
  { key: "sent", label: "Sent", icon: Send },
  { key: "archive", label: "Archive", icon: Archive },
];

export function Mailbox({ messages, address }: { messages: Msg[]; address: string }) {
  const [folder, setFolder] = useState("inbox");
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, patch] = useOptimistic(messages, (s, p: { id: string } & Partial<Msg>) => s.map((m) => (m.id === p.id ? { ...m, ...p } : m)));
  const [, start] = useTransition();
  const shown = useMemo(() => list.filter((m) => (folder === "starred" ? m.starred && m.folder !== "trash" : m.folder === folder)), [list, folder]);
  const open = list.find((m) => m.id === openId) ?? null;
  const unread = list.filter((m) => m.folder === "inbox" && !m.read).length;
  const change = (id: string, p: { read?: boolean; starred?: boolean; folder?: string }) =>
    start(async () => {
      patch({ id, ...p });
      await markMessage(id, p);
    });

  return (
    <div className="grid h-[calc(100dvh-11rem)] min-h-[32rem] overflow-hidden rounded-2xl border bg-card shadow-xs md:grid-cols-[12rem_20rem_minmax(0,1fr)]">
      <aside className="hidden flex-col gap-1 border-r p-2 md:flex">
        <div className="px-2 pb-2 pt-1">
          <p className="truncate text-xs text-muted-foreground">{address}</p>
        </div>
        {folders.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFolder(f.key);
              setOpenId(null);
            }}
            className={cn("relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition", folder === f.key ? "font-medium text-primary" : "text-muted-foreground hover:bg-muted")}
          >
            {folder === f.key ? <motion.span layoutId="mail-folder" className="absolute inset-0 rounded-lg bg-primary/10" /> : null}
            <f.icon className="relative size-4" />
            <span className="relative">{f.label}</span>
            {f.key === "inbox" && unread ? <span className="relative ml-auto rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">{unread}</span> : null}
          </button>
        ))}
      </aside>

      <div className={cn("flex min-h-0 flex-col border-r", open && "hidden md:flex")}>
        <div className="flex gap-1 overflow-x-auto border-b p-2 md:hidden">
          {folders.map((f) => (
            <Button key={f.key} size="sm" variant={folder === f.key ? "secondary" : "ghost"} onClick={() => setFolder(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence initial={false}>
            {shown.map((m) => (
              <motion.li key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -20 }}>
                <button
                  type="button"
                  onClick={() => {
                    setOpenId(m.id);
                    if (!m.read) change(m.id, { read: true });
                  }}
                  className={cn("flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-muted/50", openId === m.id && "bg-primary/5")}
                >
                  <Avatar className="size-9">
                    <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(m.fromName ?? m.fromAddress)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("truncate text-sm", !m.read ? "font-semibold" : "font-medium")}>{folder === "sent" ? m.toAddresses.join(", ") : (m.fromName ?? m.fromAddress)}</p>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(m.sentAt).replace(" ago", "")}</span>
                    </div>
                    <p className={cn("truncate text-sm", !m.read ? "text-foreground" : "text-muted-foreground")}>{m.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.bodyText?.slice(0, 120)}</p>
                  </div>
                  {!m.read ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
                </button>
              </motion.li>
            ))}
          </AnimatePresence>
          {!shown.length ? <li className="p-10 text-center text-sm text-muted-foreground">No messages.</li> : null}
        </ul>
      </div>

      <div className={cn("min-h-0 flex-col", open ? "flex" : "hidden md:flex")}>
        <AnimatePresence mode="wait">
          {open ? (
            <motion.article key={open.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex min-h-0 flex-1 flex-col">
              <div className="flex items-center gap-1 border-b p-2">
                <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={() => setOpenId(null)} aria-label="Back">
                  <ArrowLeft />
                </Button>
                <Button variant="ghost" size="icon-sm" onClick={() => change(open.id, { starred: !open.starred })} aria-label="Star">
                  <Star className={cn(open.starred && "fill-amber-400 text-amber-400")} />
                </Button>
                {open.folder !== "archive" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => {
                      change(open.id, { folder: "archive" });
                      setOpenId(null);
                    }}
                    aria-label="Archive"
                  >
                    <Archive />
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon-sm" onClick={() => change(open.id, { read: false })} aria-label="Mark unread">
                  <Mail />
                </Button>
                <div className="ml-auto">
                  <ComposeDialog
                    to={open.fromAddress}
                    clientId={open.clientId ?? undefined}
                    trigger={
                      <Button size="sm">
                        <Reply /> Reply
                      </Button>
                    }
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <h2 className="text-xl font-semibold tracking-tight">{open.subject}</h2>
                <div className="mt-4 flex items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials(open.fromName ?? open.fromAddress)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {open.fromName} <span className="font-normal text-muted-foreground">&lt;{open.fromAddress}&gt;</span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      to {open.toAddresses.join(", ")} · {dmy(open.sentAt)} {time(open.sentAt)}
                    </p>
                  </div>
                </div>
                <div className="mt-6 whitespace-pre-line text-sm leading-relaxed">{open.bodyText}</div>
                {open.clientId ? (
                  <Link href={`/app/clients/${open.clientId}`} className="mt-6 inline-block rounded-lg border px-3 py-2 text-xs text-primary hover:bg-muted">
                    Filed to client →
                  </Link>
                ) : null}
              </div>
            </motion.article>
          ) : (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <Mail className="mx-auto size-10 text-muted-foreground/40" />
                <p className="mt-3 text-sm text-muted-foreground">Choose a message to read</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
