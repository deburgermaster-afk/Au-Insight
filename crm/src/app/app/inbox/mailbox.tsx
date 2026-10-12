"use client";

import { categoryStyle, InsightCard, type InsightRow } from "@/components/mail-ai/insight";

import {
  Bot,
  Archive,
  ArrowLeft,
  CheckCheck,
  Download,
  ExternalLink,
  Eye,
  FolderInput,
  Forward,
  Inbox,
  Link2,
  Mail,
  MailOpen,
  Paperclip,
  Reply,
  ReplyAll,
  Search,
  Send,
  Star,
  Trash2,
  UserRound,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bytes, fileKind, fileUrl } from "@/components/mail/file-icon";
import { Composer } from "@/components/mail/composer";
import { type Auth, AuthBadge, SenderLogo } from "@/components/mail/sender";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { MailAttachment } from "@/db/crm-schema";
import { markMessage } from "@/lib/actions";
import { registerDocuments } from "@/lib/mail-actions";
import { ago, dmy, time } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Msg = {
  id: string;
  threadKey: string;
  folder: string;
  mailbox: string;
  fromAddress: string;
  fromName: string | null;
  toAddresses: string[];
  ccAddresses: string[] | null;
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  read: boolean;
  starred: boolean;
  clientId: string | null;
  clientName: string | null;
  matterId: string | null;
  sentAt: Date;
  attachments: MailAttachment[];
  status: string | null;
  auth: Auth;
  messageId: string | null;
  insight?: InsightRow | null;
};
type Box = { id: string; address: string; name: string; kind: string; mine: boolean };

const folders = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "starred", label: "Starred", icon: Star },
  { key: "sent", label: "Sent", icon: Send },
  { key: "archive", label: "Archive", icon: Archive },
  { key: "trash", label: "Trash", icon: Trash2 },
];
const filters = [
  { key: "unread", label: "Unread" },
  { key: "files", label: "Attachments" },
  { key: "clients", label: "From clients" },
  { key: "unverified", label: "Unverified" },
];
const statusTone: Record<string, string> = {
  delivered: "text-emerald-500",
  sent: "text-sky-500",
  bounced: "text-rose-500",
  failed: "text-rose-500",
  complained: "text-rose-500",
  delayed: "text-amber-500",
  saved: "text-muted-foreground",
};

export function Mailbox({ messages, boxes, accounts }: { messages: Msg[]; boxes: Box[]; accounts?: React.ReactNode }) {
  const [box, setBox] = useState<string>("all");
  const [folder, setFolder] = useState("inbox");
  const [filter, setFilter] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [list, patch] = useOptimistic(messages, (s, p: { id: string } & Partial<Msg>) => s.map((m) => (m.id === p.id ? { ...m, ...p } : m)));
  const [, start] = useTransition();

  const inBox = (m: Msg) => box === "all" || m.mailbox === box || m.fromAddress === box;
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return list.filter(
      (m) =>
        inBox(m) &&
        (folder === "starred" ? m.starred && m.folder !== "trash" : m.folder === folder) &&
        (filter !== "unread" || !m.read) &&
        (filter !== "files" || m.attachments.length > 0) &&
        (filter !== "clients" || m.clientId) &&
        (filter !== "unverified" || (m.folder === "inbox" && !m.auth?.verified)) &&
        (!t || `${m.fromName} ${m.fromAddress} ${m.subject} ${m.bodyText} ${m.toAddresses.join(" ")}`.toLowerCase().includes(t)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, box, folder, filter, q]);
  const count = (f: string) => list.filter((m) => inBox(m) && m.folder === f && !m.read).length;
  const open = list.find((m) => m.id === openId) ?? null;
  const change = (id: string, p: { read?: boolean; starred?: boolean; folder?: string }) =>
    start(async () => {
      patch({ id, ...p });
      await markMessage(id, p);
    });

  return (
    <div className="-m-3 grid h-[calc(100dvh-3.25rem-1rem)] min-h-[34rem] overflow-hidden md:grid-cols-[14rem_22rem_minmax(0,1fr)] md:h-[calc(100dvh-3.25rem-1rem)]">
      {/* Folders */}
      <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-r p-3 md:flex">
        <select value={box} onChange={(e) => setBox(e.target.value)} className="h-9 w-full rounded-lg border bg-card px-2 text-[13px]" aria-label="Mailbox">
          <option value="all">All mailboxes</option>
          {boxes.map((b) => (
            <option key={b.id} value={b.address}>
              {b.kind === "shared" ? "Shared · " : b.mine ? "Me · " : ""}
              {b.address}
            </option>
          ))}
        </select>
        <nav className="grid gap-0.5">
          {folders.map((f) => {
            const n = f.key === "inbox" ? count("inbox") : 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setFolder(f.key);
                  setOpenId(null);
                }}
                className={cn("relative flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition", folder === f.key ? "font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60")}
              >
                {folder === f.key ? <motion.span layoutId="mail-folder" className="absolute inset-0 rounded-lg bg-muted" transition={{ type: "spring", stiffness: 500, damping: 40 }} /> : null}
                <f.icon className="relative size-4" />
                <span className="relative">{f.label}</span>
                {n ? <span className="relative ml-auto rounded-full bg-[var(--chart-2)] px-1.5 text-[10px] font-semibold text-black">{n}</span> : null}
              </button>
            );
          })}
        </nav>
        <div>
          <p className="mb-1.5 px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">Filters</p>
          <div className="grid gap-0.5">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter((x) => (x === f.key ? null : f.key))}
                className={cn("flex h-8 items-center gap-2 rounded-lg px-2.5 text-[13px]", filter === f.key ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}
              >
                <span className={cn("size-1.5 rounded-full", filter === f.key ? "bg-[var(--chart-2)]" : "bg-muted-foreground/40")} /> {f.label}
              </button>
            ))}
          </div>
        </div>
        {accounts ?? (
          <div className="mt-auto rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">
            Mail to any of your addresses lands here and is filed to the client automatically.
          </div>
        )}
      </aside>

      {/* List */}
      <div className={cn("flex min-h-0 flex-col border-r", open && "hidden md:flex")}>
        <div className="flex items-center gap-2 border-b p-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search mail" className="h-8 pl-8 text-[13px]" />
          </div>
        </div>
        <div className="flex gap-1 overflow-x-auto border-b px-2 py-1.5 md:hidden">
          {folders.map((f) => (
            <Button key={f.key} size="xs" variant={folder === f.key ? "secondary" : "ghost"} onClick={() => setFolder(f.key)}>
              {f.label}
            </Button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          <AnimatePresence initial={false}>
            {shown.map((m) => {
              const out = m.folder === "sent";
              return (
                <motion.li key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, x: -24 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpenId(m.id);
                      if (!m.read) change(m.id, { read: true });
                    }}
                    className={cn("relative flex w-full gap-3 border-b px-3 py-3 text-left transition hover:bg-muted/40", openId === m.id && "bg-muted/60")}
                  >
                    {!m.read ? <span className="absolute left-1 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[var(--chart-2)]" /> : null}
                    <SenderLogo address={out ? (m.toAddresses[0] ?? "") : m.fromAddress} name={out ? m.toAddresses[0] : m.fromName} auth={out ? null : m.auth} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("truncate text-[13px]", !m.read ? "font-semibold" : "font-medium")}>{out ? `To: ${m.toAddresses.join(", ")}` : (m.fromName ?? m.fromAddress)}</p>
                        <span suppressHydrationWarning className="ml-auto shrink-0 text-[11px] text-muted-foreground">{ago(m.sentAt).replace(" ago", "")}</span>
                      </div>
                      <p className={cn("truncate text-[13px]", !m.read ? "text-foreground" : "text-foreground/80")}>{m.subject}</p>
                      <p className="truncate text-xs text-muted-foreground">{m.bodyText?.slice(0, 140)}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 empty:hidden">
                        {m.insight && m.insight.category !== "unrelated" ? (
                          <span className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10.5px]", categoryStyle[m.insight.category]?.tone)}>
                            <Bot className="size-3" /> {categoryStyle[m.insight.category]?.label ?? m.insight.title}
                            {m.insight.actionStatus === "open" && m.insight.action !== "none" ? <span className="size-1.5 rounded-full bg-current" /> : null}
                          </span>
                        ) : null}
                        {m.attachments.length ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10.5px] text-muted-foreground">
                            <Paperclip className="size-3" /> {m.attachments.length}
                          </span>
                        ) : null}
                        {m.clientName ? <span className="rounded-md bg-violet-500/12 px-1.5 py-0.5 text-[10.5px] text-violet-600 dark:text-violet-300">{m.clientName}</span> : null}
                        {out && m.status ? <span className={cn("text-[10.5px] capitalize", statusTone[m.status])}>{m.status === "saved" ? "Not sent" : m.status}</span> : null}
                        {m.starred ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}
                      </div>
                    </div>
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {!shown.length ? (
            <li className="grid place-items-center p-12 text-center text-sm text-muted-foreground">
              <MailOpen className="mb-2 size-8 opacity-40" /> Nothing here
            </li>
          ) : null}
        </ul>
      </div>

      {/* Reader */}
      <div className={cn("min-h-0 flex-col", open ? "flex" : "hidden md:flex")}>
        <AnimatePresence mode="wait">
          {open ? <Reader key={open.id} m={open} onBack={() => setOpenId(null)} change={change} /> : <Empty />}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Empty() {
  return (
    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid flex-1 place-items-center p-8 text-center">
      <div>
        <div className="mx-auto grid size-14 place-items-center rounded-2xl border bg-muted/40">
          <Mail className="size-6 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium">Choose a message</p>
        <p className="text-xs text-muted-foreground">Or start a new one from Compose.</p>
      </div>
    </motion.div>
  );
}

function links(html: string | null) {
  if (!html || typeof window === "undefined") return [];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const seen = new Set<string>();
  return [...doc.querySelectorAll("a[href]")]
    .map((a) => ({ href: a.getAttribute("href") ?? "", text: (a.textContent ?? "").trim() }))
    .filter((l) => /^https?:/i.test(l.href) && !seen.has(l.href) && seen.add(l.href))
    .slice(0, 12)
    .map((l) => {
      const host = new URL(l.href).hostname.replace(/^www\./, "");
      const shown = l.text.match(/([a-z0-9-]+\.)+[a-z]{2,}/i)?.[0]?.replace(/^www\./, "");
      return { ...l, host, mismatch: Boolean(shown && !host.endsWith(shown) && !shown.endsWith(host)) };
    });
}

const frameDoc = (html: string) => `<!doctype html><html><head><base target="_blank"><meta name="color-scheme" content="light"><style>
html,body{margin:0;background:#fff;color:#18181b;font:14px/1.6 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;word-wrap:break-word}
body{padding:20px}img{max-width:100%;height:auto}a{color:#2563eb}blockquote{border-left:3px solid #e4e4e7;margin:0;padding-left:12px;color:#52525b}
table{max-width:100%}pre{white-space:pre-wrap;font:inherit;margin:0}</style></head><body>${html}</body></html>`;

function Reader({ m, onBack, change }: { m: Msg; onBack: () => void; change: (id: string, p: { read?: boolean; starred?: boolean; folder?: string }) => void }) {
  const out = m.folder === "sent";
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(240);
  const html = m.bodyHtml ?? `<pre>${(m.bodyText ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!)}</pre>`;
  const ls = useMemo(() => links(m.bodyHtml), [m.bodyHtml]);
  const domain = m.fromAddress.split("@")[1] ?? "";
  const [saving, startSave] = useTransition();
  const quote = `<p></p><p></p><blockquote><p>On ${dmy(m.sentAt)} ${time(m.sentAt)}, ${m.fromName ?? m.fromAddress} wrote:</p>${m.bodyHtml ?? `<p>${(m.bodyText ?? "").replace(/\n/g, "<br>")}</p>`}</blockquote>`;
  const re = m.subject.toLowerCase().startsWith("re:") ? m.subject : `Re: ${m.subject}`;
  const replyTo = out ? m.toAddresses.join(", ") : m.fromAddress;
  const all = [...new Set([...(out ? m.toAddresses : [m.fromAddress]), ...m.toAddresses, ...(m.ccAddresses ?? [])])].filter((a) => a !== m.mailbox);

  return (
    <motion.article initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-0.5 border-b px-2 py-1.5">
        <Button variant="ghost" size="icon-sm" className="md:hidden" onClick={onBack} aria-label="Back">
          <ArrowLeft />
        </Button>
        {[
          { label: "Archive", icon: Archive, run: () => (change(m.id, { folder: "archive" }), onBack()), hide: m.folder === "archive" || out },
          { label: "Move to inbox", icon: FolderInput, run: () => change(m.id, { folder: "inbox" }), hide: m.folder === "inbox" || out },
          { label: "Delete", icon: Trash2, run: () => (change(m.id, { folder: "trash" }), onBack()), hide: m.folder === "trash" },
          { label: m.read ? "Mark unread" : "Mark read", icon: m.read ? Mail : CheckCheck, run: () => change(m.id, { read: !m.read }) },
        ]
          .filter((a) => !a.hide)
          .map((a) => (
            <Tooltip key={a.label}>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={a.run} aria-label={a.label}>
                  <a.icon />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{a.label}</TooltipContent>
            </Tooltip>
          ))}
        <Button variant="ghost" size="icon-sm" onClick={() => change(m.id, { starred: !m.starred })} aria-label="Star">
          <Star className={cn(m.starred && "fill-amber-400 text-amber-400")} />
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <Composer to={replyTo} subject={re} html={quote} inReplyTo={m.messageId} threadKey={m.threadKey} clientId={m.clientId} matterId={m.matterId} trigger={<Button size="sm" className="rounded-full"><Reply /> Reply</Button>} />
          <Composer to={all.join(", ")} subject={re} html={quote} inReplyTo={m.messageId} threadKey={m.threadKey} clientId={m.clientId} matterId={m.matterId} trigger={<Button size="icon-sm" variant="outline" aria-label="Reply all"><ReplyAll /></Button>} />
          <Composer subject={`Fwd: ${m.subject}`} html={quote} clientId={m.clientId} trigger={<Button size="icon-sm" variant="outline" aria-label="Forward"><Forward /></Button>} />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-5 pb-4 pt-5">
          <h2 className="text-lg font-semibold tracking-tight">{m.subject}</h2>
          {m.insight && m.insight.category !== "unrelated" ? (
            <div className="mt-3">
              <InsightCard i={m.insight} />
            </div>
          ) : null}
          <div className="mt-4 flex items-start gap-3">
            <SenderLogo address={m.fromAddress} name={m.fromName} auth={out ? null : m.auth} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <p className="text-sm font-medium">{m.fromName ?? m.fromAddress}</p>
                <p className="truncate text-xs text-muted-foreground">&lt;{m.fromAddress}&gt;</p>
                {!out ? <AuthBadge auth={m.auth} domain={domain} /> : m.status ? <span className={cn("text-[11px] font-medium capitalize", statusTone[m.status])}>{m.status === "saved" ? "Not sent" : m.status}</span> : null}
              </div>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                to {m.toAddresses.join(", ")}
                {m.ccAddresses?.length ? ` · cc ${m.ccAddresses.join(", ")}` : ""}
              </p>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {dmy(m.sentAt)} · {time(m.sentAt)}
            </p>
          </div>
          {m.clientId ? (
            <Link href={`/app/clients/${m.clientId}`} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-violet-500/12 px-2 py-1 text-xs text-violet-600 hover:underline dark:text-violet-300">
              <UserRound className="size-3.5" /> Filed to {m.clientName}
            </Link>
          ) : null}
        </div>
        <div className="mx-5 overflow-hidden rounded-xl border bg-white">
          <iframe
            ref={frame}
            title="Message"
            sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            srcDoc={frameDoc(html)}
            className="block w-full"
            style={{ height }}
            onLoad={() => {
              const d = frame.current?.contentDocument;
              if (d) setHeight(Math.min(Math.max(d.documentElement.scrollHeight, 160), 4000));
            }}
          />
        </div>
        {m.attachments.length ? (
          <section className="px-5 pt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Paperclip className="size-3.5" /> {m.attachments.length} attachment{m.attachments.length > 1 ? "s" : ""} · {bytes(m.attachments.reduce((a, f) => a + f.size, 0))}
              {m.clientId ? (
                <button
                  type="button"
                  disabled={saving}
                  className="ml-auto rounded-md border px-2 py-1 text-[11px] text-foreground hover:bg-muted"
                  onClick={() =>
                    startSave(async () => {
                      const r = await registerDocuments(m.attachments, { clientId: m.clientId, matterId: m.matterId, source: "email", category: "Email attachment" });
                      if (r.ok) toast.success(`Saved to ${m.clientName}'s documents`);
                      else toast.error(r.error);
                    })
                  }
                >
                  Save all to {m.clientName?.split(" ")[0]}'s documents
                </button>
              ) : null}
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {m.attachments.map((a) => {
                const k = fileKind(a.type, a.name);
                const img = a.type.startsWith("image/");
                return (
                  <div key={a.key} className="group overflow-hidden rounded-xl border bg-card">
                    {img ? (
                      // biome-ignore lint/performance/noImgElement: private file preview
                      <img src={fileUrl(a.key, a.name)} alt={a.name} className="h-28 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className={cn("grid h-28 place-items-center", k.tone)}>
                        <k.Icon className="size-8" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 p-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px]">{a.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {k.label} · {bytes(a.size)}
                        </p>
                      </div>
                      <a href={fileUrl(a.key, a.name)} target="_blank" rel="noreferrer" className="grid size-7 place-items-center rounded-md hover:bg-muted" aria-label="Open">
                        <Eye className="size-3.5" />
                      </a>
                      <a href={fileUrl(a.key, a.name, true)} className="grid size-7 place-items-center rounded-md hover:bg-muted" aria-label="Download">
                        <Download className="size-3.5" />
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}
        {ls.length ? (
          <section className="px-5 pb-6 pt-5">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Link2 className="size-3.5" /> Links in this email
            </p>
            <ul className="grid gap-1.5">
              {ls.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer" className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-[13px] hover:bg-muted/40", l.mismatch && "border-amber-500/40 bg-amber-500/5")}>
                    <img src={`https://icons.duckduckgo.com/ip3/${l.host}.ico`} alt="" className="size-4" loading="lazy" />
                    <span className="font-medium">{l.host}</span>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">{l.text || l.href}</span>
                    {l.mismatch ? <span className="text-[11px] text-amber-600 dark:text-amber-300">Text and link don't match</span> : null}
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="h-6" />
        )}
      </div>
    </motion.article>
  );
}
