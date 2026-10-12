"use client";

import { ChevronDown, Loader2, Paperclip, Send, Sparkles, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { MailAttachment } from "@/db/crm-schema";
import { composeMail, myMailboxes } from "@/lib/mail-actions";
import { cn } from "@/lib/utils";
import { MailEditor } from "./editor";
import { bytes, fileKind } from "./file-icon";
import { uploadFile } from "./uploader";

type Boxes = Awaited<ReturnType<typeof myMailboxes>>;
type Pending = { id: string; name: string; size: number; type: string; pct: number; done?: MailAttachment; error?: string };

const templates = [
  {
    name: "Document request",
    subject: "Documents needed for your application",
    html: "<p>Hi,</p><p>To move your application forward, please send us the following:</p><ul><li><p>Passport bio page</p></li><li><p>…</p></li></ul><p>Clear photos or PDF scans are fine. Let me know if anything is unclear.</p>",
  },
  { name: "Application lodged", subject: "Your application has been lodged", html: "<p>Hi,</p><p>Good news: your application was lodged today. Your Transaction Reference Number (TRN) is <strong>…</strong>.</p><p>Home Affairs will contact you if they need anything further; we'll keep you posted.</p>" },
  { name: "Visa granted", subject: "Congratulations: your visa has been granted", html: "<p>Hi,</p><p>Congratulations! Your visa has been granted. I've attached the grant notice; please keep it somewhere safe and check the conditions listed on it.</p>" },
  { name: "Consultation follow-up", subject: "Following up on our consultation", html: "<p>Hi,</p><p>Thank you for meeting with us today. As discussed, your best pathway is…</p><p>Next steps:</p><ol><li><p>…</p></li></ol>" },
  { name: "Payment reminder", subject: "Friendly reminder: invoice due", html: "<p>Hi,</p><p>This is a friendly reminder that your invoice is due. You can pay by bank transfer to the account on the invoice.</p>" },
];

export type ComposeProps = {
  to?: string;
  cc?: string;
  subject?: string;
  html?: string;
  inReplyTo?: string | null;
  threadKey?: string | null;
  clientId?: string | null;
  matterId?: string | null;
  trigger: ReactNode;
};

export function Composer(p: ComposeProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{p.trigger}</DialogTrigger>
      <DialogContent showCloseButton={false} className="flex h-[min(52rem,92dvh)] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl">
        <DialogTitle className="sr-only">New message</DialogTitle>
        {open ? <ComposeForm {...p} onDone={() => setOpen(false)} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ComposeForm(p: ComposeProps & { onDone: () => void }) {
  const [boxes, setBoxes] = useState<Boxes | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(p.to ?? "");
  const [cc, setCc] = useState(p.cc ?? "");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(Boolean(p.cc));
  const [subject, setSubject] = useState(p.subject ?? "");
  const [html, setHtml] = useState(p.html ?? "");
  const [editorKey, setEditorKey] = useState(0);
  const [files, setFiles] = useState<Pending[]>([]);
  const [over, setOver] = useState(false);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    myMailboxes().then((b) => {
      if (!live) return;
      setBoxes(b);
      setFrom(b.boxes[0]?.id ?? "");
    });
    return () => {
      live = false;
    };
  }, []);
  const box = boxes?.boxes.find((b) => b.id === from);

  const add = (list: FileList | null) => {
    if (!list || !boxes) return;
    for (const f of Array.from(list)) {
      const id = crypto.randomUUID();
      setFiles((x) => [...x, { id, name: f.name, size: f.size, type: f.type, pct: 0 }]);
      uploadFile(boxes.agencyId, "mail/out", f, (pct) => setFiles((x) => x.map((y) => (y.id === id ? { ...y, pct } : y))))
        .then((done) => setFiles((x) => x.map((y) => (y.id === id ? { ...y, pct: 100, done } : y))))
        .catch((e) => setFiles((x) => x.map((y) => (y.id === id ? { ...y, error: e instanceof Error ? e.message : String(e) } : y))));
    }
  };

  const send = () =>
    start(async () => {
      if (files.some((f) => !f.done && !f.error)) return void toast.message("Wait for attachments to finish uploading");
      const sig = box ? `<p></p><p>--<br>${box.name}${box.kind === "shared" ? "" : `<br>${box.address}`}</p>` : "";
      const r = await composeMail({
        fromId: from,
        to,
        cc,
        bcc,
        subject,
        html: html + sig,
        attachments: files.flatMap((f) => (f.done ? [f.done] : [])),
        inReplyTo: p.inReplyTo,
        threadKey: p.threadKey,
        clientId: p.clientId,
        matterId: p.matterId,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Message sent");
      p.onDone();
    });

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        add(e.dataTransfer.files);
      }}
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <p className="text-sm font-medium">{p.inReplyTo ? "Reply" : "New message"}</p>
        {boxes && !boxes.enabled ? <span className="rounded-md bg-amber-500/12 px-1.5 py-0.5 text-[11px] text-amber-600 dark:text-amber-300">Sending is off</span> : null}
        <button type="button" onClick={p.onDone} className="ml-auto grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="grid border-b text-sm [&>label]:flex [&>label]:items-center [&>label]:gap-3 [&>label]:border-b [&>label]:px-4 [&>label:last-child]:border-0">
        <label>
          <span className="w-12 shrink-0 text-xs text-muted-foreground">From</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent outline-none">
            {(boxes?.boxes ?? []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} &lt;{b.address}&gt;{b.kind === "shared" ? " · shared" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="w-12 shrink-0 text-xs text-muted-foreground">To</span>
          <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com, another@example.com" className="h-10 min-w-0 flex-1 bg-transparent outline-none" autoFocus={!p.to} />
          {!showCc ? (
            <button type="button" onClick={() => setShowCc(true)} className="text-xs text-muted-foreground hover:text-foreground">
              Cc Bcc
            </button>
          ) : null}
        </label>
        {showCc ? (
          <>
            <label>
              <span className="w-12 shrink-0 text-xs text-muted-foreground">Cc</span>
              <input value={cc} onChange={(e) => setCc(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent outline-none" />
            </label>
            <label>
              <span className="w-12 shrink-0 text-xs text-muted-foreground">Bcc</span>
              <input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent outline-none" />
            </label>
          </>
        ) : null}
        <label>
          <span className="w-12 shrink-0 text-xs text-muted-foreground">Subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-10 min-w-0 flex-1 bg-transparent font-medium outline-none" autoFocus={Boolean(p.to)} />
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <MailEditor key={editorKey} initial={html} onChange={setHtml} minHeight={260} />
        <AnimatePresence initial={false}>
          {files.length ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 grid gap-2 sm:grid-cols-2">
              {files.map((f) => {
                const k = fileKind(f.type, f.name);
                return (
                  <motion.div key={f.id} layout initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="relative flex items-center gap-2.5 overflow-hidden rounded-lg border bg-card p-2">
                    <span className={cn("grid size-8 shrink-0 place-items-center rounded-md", k.tone)}>
                      <k.Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px]">{f.name}</p>
                      <p className={cn("text-[11px]", f.error ? "text-rose-500" : "text-muted-foreground")}>{f.error ?? (f.done ? bytes(f.size) : `Uploading ${Math.round(f.pct)}%`)}</p>
                    </div>
                    <button type="button" onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))} className="grid size-6 place-items-center rounded text-muted-foreground hover:bg-muted" aria-label="Remove">
                      <X className="size-3.5" />
                    </button>
                    {!f.done && !f.error ? <span className="absolute bottom-0 left-0 h-0.5 bg-[var(--chart-2)] transition-all" style={{ width: `${f.pct}%` }} /> : null}
                  </motion.div>
                );
              })}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
      <div className="flex items-center gap-2 border-t px-3 py-2.5">
        <Button onClick={send} disabled={pending || !from} className="rounded-full px-5">
          {pending ? <Loader2 className="animate-spin" /> : <Send />} Send
        </Button>
        <input ref={input} type="file" multiple className="hidden" onChange={(e) => add(e.target.files)} />
        <Button variant="ghost" size="icon" onClick={() => input.current?.click()} aria-label="Attach files" title="Attach files (or drop them anywhere)">
          <Paperclip />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Sparkles /> Templates <ChevronDown />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Insert a template</DropdownMenuLabel>
            {templates.map((t) => (
              <DropdownMenuItem
                key={t.name}
                onSelect={() => {
                  setHtml(t.html);
                  if (!subject) setSubject(t.subject);
                  setEditorKey((k) => k + 1);
                }}
              >
                {t.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="ml-auto hidden text-[11px] text-muted-foreground sm:block">Drop files anywhere to attach · up to 35 MB</span>
      </div>
      {over ? (
        <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-xl border-2 border-dashed border-[var(--chart-2)] bg-background/80 text-sm font-medium backdrop-blur-sm">Drop to attach</div>
      ) : null}
    </div>
  );
}
