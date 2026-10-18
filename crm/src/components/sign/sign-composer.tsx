"use client";

import { ArrowLeft, Calendar, Check, Plus, Receipt, UsersRound, X, CheckSquare, FileText, FileUp, FolderOpen, Hash, Loader2, PenLine, Search, Send, Sparkles, Trash2, Type, UserRound, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { ReadingAnimation } from "@/components/ai/reading";
import { uploadFile } from "@/components/mail/uploader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { SignField } from "@/db/crm-schema";
import type { ConsentTemplate } from "@/lib/consent-templates";
import { createSignDraft, prefillDraft, redetectFields, sendSignRequest, type SignDraft, voidSignRequest } from "@/lib/sign-actions";
import { cn } from "@/lib/utils";
import { PdfPages } from "./pdf-pages";
import { TemplatePicker } from "./template-picker";

type Client = { id: string; name: string; email: string | null };
type Matter = { id: string; clientId: string; reference: string; title: string; visaCode: string };
type Doc = { id: string; clientId: string | null; name: string; createdAt: string | Date };
type Invoice = { id: string; clientId: string; number: string; total: string; paid: string };

/** Each signer's colour on the field editor (client first). */
const SIGNER_DOT = ["bg-amber-500", "bg-fuchsia-500", "bg-teal-500", "bg-indigo-500", "bg-rose-500", "bg-lime-600"];
const OTHER_ROLES = ["Sponsor", "Partner", "Second parent", "Employer", "Guardian", "Witness", "Other signer"];

export const fieldMeta: Record<SignField["type"], { label: string; icon: typeof PenLine; size: [number, number]; color: string }> = {
  signature: { label: "Signature", icon: PenLine, size: [0.3, 0.05], color: "ring-amber-500 bg-amber-300/30" },
  initials: { label: "Initials", icon: Hash, size: [0.1, 0.034], color: "ring-orange-500 bg-orange-300/30" },
  date: { label: "Date", icon: Calendar, size: [0.18, 0.026], color: "ring-sky-500 bg-sky-300/25" },
  name: { label: "Full name", icon: UserRound, size: [0.3, 0.026], color: "ring-violet-500 bg-violet-300/25" },
  text: { label: "Text", icon: Type, size: [0.3, 0.026], color: "ring-slate-500 bg-slate-300/25" },
  checkbox: { label: "Checkbox", icon: CheckSquare, size: [0.022, 0.016], color: "ring-emerald-500 bg-emerald-300/25" },
};

const STEPS_PDF = ["Opening the PDF…", "Reading the text layer…", "Looking for signature lines…", "Working out which ones are for the client…", "Placing fields…"];
const STEPS_TPL = ["Filling in the agency and agent…", "Adding the client's details…", "Placing signature fields…"];

/** New signature request: pick the client and the document, check the fields, send. */
export function SignComposer({ agencyId, clients, matters, docs, invoices, templates, initial }: { agencyId: string; clients: Client[]; matters: Matter[]; docs: Doc[]; invoices: Invoice[]; templates: ConsentTemplate[]; initial: { clientId?: string; matterId?: string; templateKey?: string; documentId?: string; draft?: SignDraft } }) {
  const router = useRouter();
  const [clientId, setClientId] = useState(initial.clientId ?? "");
  const [matterId, setMatterId] = useState(initial.matterId ?? "");
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"template" | "file" | "upload">(initial.documentId ? "file" : "template");
  const [draft, setDraft] = useState<SignDraft | null>(initial.draft ?? null);
  const [working, setWorking] = useState<"template" | "pdf" | null>(null);
  const [fields, setFields] = useState<SignField[]>(initial.draft?.fields ?? []);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<SignField["type"] | null>(null);
  const [title, setTitle] = useState(initial.draft?.title ?? "");
  const [message, setMessage] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [others, setOthers] = useState<{ label: string; name: string; email: string }[]>([]);
  const [agentCountersign, setAgentCountersign] = useState(true);
  const [invoiceId, setInvoiceId] = useState("");
  const [placeFor, setPlaceFor] = useState("client");
  const [pdfVersion, setPdfVersion] = useState(0);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; el: HTMLElement } | null>(null);

  const client = clients.find((c) => c.id === clientId);
  const clientMatters = matters.filter((m) => m.clientId === clientId);
  const clientDocs = docs.filter((d) => d.clientId === clientId);
  const clientInvoices = invoices.filter((i) => i.clientId === clientId && Number(i.total) > Number(i.paid));
  const signerInput = { others: others.filter((o) => o.name.trim() && o.email.trim()), agentCountersign };
  const signers = draft?.signers?.length ? draft.signers : [{ id: "client", role: "client" as const, label: "Client", name: client?.name ?? "Client", email: null, status: "pending" as const }];
  const signerIdx = (id?: string) => Math.max(0, signers.findIndex((x) => x.id === (id ?? "client")));
  const shownClients = useMemo(() => (q ? clients.filter((c) => c.name.toLowerCase().includes(q.toLowerCase())) : clients).slice(0, 8), [clients, q]);

  const begin = (input: Parameters<typeof createSignDraft>[0], kind: "template" | "pdf") => {
    setWorking(kind);
    start(async () => {
      const r = await createSignDraft(input);
      setWorking(null);
      if (!r.ok || !r.draft) return void toast.error(r.ok ? "Couldn't prepare the document." : r.error);
      setDraft(r.draft);
      setFields(r.draft.fields);
      setTitle(r.draft.title);
      if (kind === "pdf") toast.success(`Found ${r.draft.fields.length} field${r.draft.fields.length === 1 ? "" : "s"} (${r.draft.method}). Check them before sending.`);
    });
  };

  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!/\.pdf$/i.test(f.name)) return void toast.error("Choose a PDF.");
    setWorking("pdf");
    try {
      const a = await uploadFile(agencyId, `client/${clientId}/signing-uploads`, f);
      begin({ clientId, matterId: matterId || null, origin: "upload", upload: { key: a.key, name: f.name }, signers: signerInput }, "pdf");
    } catch (e) {
      setWorking(null);
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
  };

  const update = (id: string, patch: Partial<SignField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const sel = fields.find((f) => f.id === selected);

  // ── Step 1: client and source ──
  if (!draft) {
    if (working)
      return (
        <div className="mx-auto grid max-w-md gap-2 rounded-xl border bg-card p-8 text-center">
          <ReadingAnimation steps={working === "pdf" ? STEPS_PDF : STEPS_TPL} />
          <p className="text-xs text-muted-foreground">{working === "pdf" ? "The AI finds every place the client has to sign, date, initial or tick." : "Every consent form fills in your agency, the registered agent and the client automatically."}</p>
        </div>
      );
    return (
      <div className="grid gap-4 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <section className="grid content-start gap-3 rounded-xl border bg-card p-4">
          <p className="text-[13px] font-medium">1 · Client</p>
          {client ? (
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-2.5">
              <UserRound className="size-4 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{client.name}</p>
                <p className="truncate text-xs text-muted-foreground">{client.email ?? "No email: add one to send"}</p>
              </div>
              <Button size="xs" variant="ghost" onClick={() => (setClientId(""), setMatterId(""))}>
                Change
              </Button>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search clients" className="pl-8" autoFocus />
              </div>
              <ul className="grid">
                {shownClients.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setClientId(c.id)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted">
                      <UserRound className="size-3.5 text-muted-foreground" /> {c.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {client && clientMatters.length ? (
            <label className="grid gap-1 text-[13px]">
              <span className="text-muted-foreground">Matter (fills in the visa and reference)</span>
              <select value={matterId} onChange={(e) => setMatterId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">No specific matter</option>
                {clientMatters.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.reference} · {m.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="pt-2 text-[13px] font-medium">2 · Document</p>
          <div className="grid gap-1">
            {(
              [
                ["template", Sparkles, "Consent form template", `${templates.length} forms, auto-filled`],
                ["file", FolderOpen, "From the client's files", `${clientDocs.length} PDF${clientDocs.length === 1 ? "" : "s"}`],
                ["upload", FileUp, "Upload a PDF", "AI finds where to sign"],
              ] as const
            ).map(([k, Icon, l, d]) => (
              <button key={k} type="button" onClick={() => setSource(k)} className={cn("flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition", source === k ? "border-foreground/40 bg-muted/50" : "hover:bg-muted/30")}>
                <Icon className="size-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{l}</span>
                  <span className="block text-xs text-muted-foreground">{d}</span>
                </span>
                {source === k ? <Check className="size-4" /> : null}
              </button>
            ))}
          </div>
          <p className="flex items-center gap-1.5 pt-2 text-[13px] font-medium">
            <UsersRound className="size-3.5" /> 3 · Who signs
          </p>
          <div className="grid gap-2 text-[13px]">
            <p className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1.5">
              <span className={cn("size-2 rounded-full", SIGNER_DOT[0])} /> {client?.name ?? "The client"} <span className="text-muted-foreground">· client portal</span>
            </p>
            {others.map((o, i) => (
              <div key={i} className="grid gap-1.5 rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 shrink-0 rounded-full", SIGNER_DOT[(i + 1) % SIGNER_DOT.length])} />
                  <select value={o.label} onChange={(e) => setOthers((xs) => xs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-8 flex-1 rounded-md border bg-background px-1.5 text-xs">
                    {OTHER_ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                  <button type="button" onClick={() => setOthers((xs) => xs.filter((_, j) => j !== i))} aria-label="Remove signer" className="text-muted-foreground">
                    <X className="size-4" />
                  </button>
                </div>
                <Input value={o.name} onChange={(e) => setOthers((xs) => xs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Full name" className="h-8 text-xs" />
                <Input type="email" value={o.email} onChange={(e) => setOthers((xs) => xs.map((x, j) => (j === i ? { ...x, email: e.target.value } : x)))} placeholder="Email (gets a personal signing link)" className="h-8 text-xs" />
              </div>
            ))}
            {others.length < 4 ? (
              <Button type="button" size="xs" variant="outline" className="justify-self-start" onClick={() => setOthers((xs) => [...xs, { label: "Sponsor", name: "", email: "" }])}>
                <Plus /> Add another signer
              </Button>
            ) : null}
            <label className="flex items-start gap-2 text-xs">
              <input type="checkbox" className="mt-0.5 size-3.5 accent-foreground" checked={agentCountersign} onChange={(e) => setAgentCountersign(e.target.checked)} />
              <span>
                Registered agent countersigns <span className="text-muted-foreground">(forms that need it: authority to act, fees, client account, conflict, termination)</span>
              </span>
            </label>
          </div>
        </section>

        <section className={cn("rounded-xl border bg-card p-4", !client && "pointer-events-none opacity-50")}>
          {source === "template" ? (
            <div className="grid gap-3">
              <p className="text-[13px] font-medium">Choose a consent form</p>
              {initial.templateKey && templates.some((t) => t.key === initial.templateKey) ? (
                <Button variant="outline" className="h-auto justify-start gap-2 border-[var(--chart-2)]/40 py-2.5 text-left" disabled={pending || !clientId} onClick={() => begin({ clientId, matterId: matterId || null, origin: "template", templateKey: initial.templateKey, signers: signerInput }, "template")}>
                  <Wand2 className="text-[var(--chart-2)]" />
                  <span className="min-w-0 flex-1 truncate">Continue with: {templates.find((t) => t.key === initial.templateKey)?.title}</span>
                </Button>
              ) : null}
              <TemplatePicker templates={templates} clientId={clientId || undefined} matterId={matterId || undefined} busy={pending} onPick={(key) => begin({ clientId, matterId: matterId || null, origin: "template", templateKey: key, signers: signerInput }, "template")} onPickMany={(keys) => begin({ clientId, matterId: matterId || null, origin: "template", templateKeys: keys, signers: signerInput }, "template")} />
            </div>
          ) : source === "file" ? (
            <div className="grid gap-2">
              <p className="text-[13px] font-medium">PDFs in {client?.name ?? "the client"}&apos;s files</p>
              {clientDocs.length ? (
                <ul className="grid gap-1">
                  {clientDocs.map((d) => (
                    <li key={d.id}>
                      <button type="button" disabled={pending} onClick={() => begin({ clientId, matterId: matterId || null, origin: "file", documentId: d.id, signers: signerInput }, "pdf")} className={cn("flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm hover:bg-muted/40", initial.documentId === d.id && "border-foreground/40")}>
                        <FileText className="size-4 text-rose-500" />
                        <span className="min-w-0 flex-1 truncate">{d.name}</span>
                        <span className="text-xs text-muted-foreground">{new Date(d.createdAt).toLocaleDateString("en-AU")}</span>
                        <Wand2 className="size-3.5 text-muted-foreground" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No PDFs on this client yet. Upload one instead.</p>
              )}
            </div>
          ) : (
            <div className="grid gap-3">
              <p className="text-[13px] font-medium">Upload a PDF to sign</p>
              <button type="button" onClick={() => fileInput.current?.click()} className="grid place-items-center gap-2 rounded-xl border-2 border-dashed p-10 text-sm text-muted-foreground hover:bg-muted/30" onDragOver={(e) => e.preventDefault()} onDrop={(e) => (e.preventDefault(), upload(e.dataTransfer.files[0]))}>
                <FileUp className="size-6" />
                Drop a PDF here or click to choose
                <span className="text-xs">Government forms, statutory declarations, agreements: the AI finds where the client signs.</span>
              </button>
              <input ref={fileInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => upload(e.target.files?.[0])} />
            </div>
          )}
        </section>
      </div>
    );
  }

  // ── Step 2: check fields and send ──
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="grid content-start gap-3">
        <div className="sticky top-14 z-20 flex flex-wrap items-center gap-1.5 rounded-xl border bg-card/95 p-2 backdrop-blur">
          <span className="px-1 text-xs text-muted-foreground">Add:</span>
          {(Object.keys(fieldMeta) as SignField["type"][]).map((t) => {
            const M = fieldMeta[t];
            return (
              <Button key={t} size="xs" variant={tool === t ? "default" : "outline"} onClick={() => setTool(tool === t ? null : t)}>
                <M.icon /> {M.label}
              </Button>
            );
          })}
          {signers.length > 1 ? (
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              for
              <select value={placeFor} onChange={(e) => setPlaceFor(e.target.value)} className="h-7 rounded-md border bg-background px-1.5 text-xs text-foreground">
                {signers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.label === "Client" ? `Client (${x.name})` : x.role === "agent" ? "Agent (countersign)" : `${x.label} (${x.name})`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {draft.formFields ? (
            <Button
              size="xs"
              variant="outline"
              className="ml-auto border-[var(--chart-2)]/40"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await prefillDraft(draft.id);
                  if (!r.ok || !r.fields) return void toast.error(r.ok ? "Nothing to fill." : r.error);
                  setFields(r.fields);
                  setPdfVersion((v) => v + 1);
                  setDraft({ ...draft, formFields: 0 });
                  toast.success(`Filled ${r.filled?.length} form boxes from the client record (${r.filled?.filter((f) => f.by === "ai").length ?? 0} by AI). Check them on the page.`);
                })
              }
            >
              <Wand2 /> Prefill {draft.formFields} form boxes
            </Button>
          ) : null}
          <Button
            size="xs"
            variant="ghost"
            className="ml-auto"
            disabled={pending || draft.method === "template"}
            onClick={() =>
              start(async () => {
                setWorking("pdf");
                const r = await redetectFields(draft.id);
                setWorking(null);
                if (!r.ok || !r.fields) return void toast.error(r.ok ? "No fields found." : r.error);
                setFields(r.fields);
                toast.success(`AI found ${r.fields.length} fields.`);
              })
            }
          >
            {working ? <Loader2 className="animate-spin" /> : <Sparkles />} Re-detect with AI
          </Button>
        </div>
        {tool ? <p className="text-xs text-sky-600">Click on the page where the {fieldMeta[tool].label.toLowerCase()} goes.</p> : <p className="text-xs text-muted-foreground">Drag fields to move them; click one to edit. Yellow fields are required.</p>}
        <PdfPages
          url={`/api/sign/${draft.id}?v=${pdfVersion}`}
          onPageClick={(page, x, y) => {
            if (!tool) return setSelected(null);
            const [w, h] = fieldMeta[tool].size;
            const id = `m${Date.now().toString(36)}`;
            setFields((fs) => [...fs, { id, page, x: Math.min(x, 1 - w), y: Math.min(Math.max(0, y - h / 2), 1 - h), w, h, type: tool, label: fieldMeta[tool].label, required: tool !== "checkbox" && tool !== "text", source: "manual", signer: placeFor }]);
            setSelected(id);
            setTool(null);
          }}
          overlay={(page) =>
            fields
              .filter((f) => f.page === page)
              .map((f) => {
                const M = fieldMeta[f.type];
                return (
                  <div
                    key={f.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      setSelected(f.id);
                      const host = e.currentTarget.parentElement!;
                      const r = host.getBoundingClientRect();
                      drag.current = { id: f.id, dx: (e.clientX - r.left) / r.width - f.x, dy: (e.clientY - r.top) / r.height - f.y, el: host };
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={(e) => {
                      const d = drag.current;
                      if (!d || d.id !== f.id) return;
                      const r = d.el.getBoundingClientRect();
                      update(f.id, { x: Math.max(0, Math.min(1 - f.w, (e.clientX - r.left) / r.width - d.dx)), y: Math.max(0, Math.min(1 - f.h, (e.clientY - r.top) / r.height - d.dy)) });
                    }}
                    onPointerUp={() => (drag.current = null)}
                    className={cn("absolute flex cursor-move items-center gap-1 overflow-hidden rounded-[3px] px-1 text-[10px] font-medium text-slate-800 ring-1 select-none", M.color, selected === f.id && "ring-2 ring-sky-600")}
                    style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                  >
                    {signers.length > 1 ? <span className={cn("size-1.5 shrink-0 rounded-full", SIGNER_DOT[signerIdx(f.signer) % SIGNER_DOT.length])} /> : null}
                    {f.type !== "checkbox" ? (
                      <>
                        <M.icon className="size-3 shrink-0" />
                        <span className="truncate">{f.label}</span>
                        {f.source === "ai" ? <Sparkles className="ml-auto size-2.5 shrink-0 text-violet-600" /> : null}
                      </>
                    ) : null}
                  </div>
                );
              })
          }
        />
      </section>

      <aside className="grid content-start gap-3 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-5rem)] lg:overflow-y-auto">
        <section className="grid gap-3 rounded-xl border bg-card p-4">
          <button type="button" className="flex items-center gap-1 text-xs text-muted-foreground" onClick={() => start(async () => (await voidSignRequest(draft.id), setDraft(null)))}>
            <ArrowLeft className="size-3.5" /> Start again
          </button>
          <label className="grid gap-1 text-[13px]">
            <span className="text-muted-foreground">Title</span>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="grid gap-1 text-[13px]">
            <span className="text-muted-foreground">Message to {client?.name.split(" ")[0] ?? "the client"} (optional)</span>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} placeholder="Please sign this so we can lodge your application this week." />
          </label>
          <label className="grid gap-1 text-[13px]">
            <span className="text-muted-foreground">Sign by (optional)</span>
            <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </label>
          {clientInvoices.length ? (
            <label className="grid gap-1 text-[13px]">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Receipt className="size-3.5" /> Ask to pay after signing (optional)
              </span>
              <select value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
                <option value="">No payment</option>
                {clientInvoices.map((i) => (
                  <option key={i.id} value={i.id}>
                    Invoice {i.number} · ${(Number(i.total) - Number(i.paid)).toLocaleString("en-AU", { minimumFractionDigits: 2 })} owing
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {signers.length > 1 ? (
            <div className="grid gap-1 rounded-lg bg-muted/40 p-2 text-xs">
              {signers.map((x, i) => (
                <p key={x.id} className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", SIGNER_DOT[i % SIGNER_DOT.length])} />
                  <span className="font-medium">{x.role === "agent" ? "Agent countersign" : x.label}</span>
                  <span className="truncate text-muted-foreground">{x.name}</span>
                  <span className="ml-auto text-muted-foreground">{fields.filter((f) => (f.signer ?? "client") === x.id).length} fields</span>
                </p>
              ))}
            </div>
          ) : null}
          <Button
            className="h-10 rounded-full"
            disabled={pending || !fields.length}
            onClick={() =>
              start(async () => {
                const r = await sendSignRequest(draft.id, { title, message, fields, dueAt: dueAt || null, invoiceId: invoiceId || null });
                if (!r.ok) return void toast.error(r.error);
                toast.success(r.id === "emailed" ? `Sent. ${client?.name} has an email with a link to sign.` : "Sent. It's waiting in the client's portal.");
                router.push("/app/sign");
                router.refresh();
              })
            }
          >
            {pending && !working ? <Loader2 className="animate-spin" /> : <Send />} Send for signature
          </Button>
          <p className="text-[11px] text-muted-foreground">The client is guided to each field one at a time on their phone, then the signed PDF (with a signing record page) is filed in their documents.</p>
        </section>

        {sel ? (
          <section className="grid gap-2 rounded-xl border bg-card p-4">
            <p className="text-[13px] font-medium">Selected field</p>
            <select value={sel.type} onChange={(e) => update(sel.id, { type: e.target.value as SignField["type"], ...(e.target.value === "checkbox" ? { w: 0.022, h: 0.016 } : {}) })} className="h-9 rounded-md border bg-background px-2 text-sm">
              {(Object.keys(fieldMeta) as SignField["type"][]).map((t) => (
                <option key={t} value={t}>
                  {fieldMeta[t].label}
                </option>
              ))}
            </select>
            <Input value={sel.label} onChange={(e) => update(sel.id, { label: e.target.value })} placeholder="Label the signer sees" />
            {signers.length > 1 ? (
              <select value={sel.signer ?? "client"} onChange={(e) => update(sel.id, { signer: e.target.value })} className="h-9 rounded-md border bg-background px-2 text-sm">
                {signers.map((x) => (
                  <option key={x.id} value={x.id}>
                    Completed by: {x.role === "agent" ? "agent (countersign)" : `${x.label.toLowerCase()} (${x.name})`}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex items-center gap-3 text-[13px]">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={sel.required} onChange={(e) => update(sel.id, { required: e.target.checked })} className="accent-foreground" /> Required
              </label>
              <label className="flex items-center gap-1.5">
                Size
                <input type="range" min={0.5} max={2} step={0.1} defaultValue={1} onChange={(e) => update(sel.id, { w: fieldMeta[sel.type].size[0] * Number(e.target.value), h: fieldMeta[sel.type].size[1] * Number(e.target.value) })} />
              </label>
              <Button size="icon-xs" variant="ghost" className="ml-auto text-rose-500" onClick={() => (setFields((fs) => fs.filter((f) => f.id !== sel.id)), setSelected(null))} aria-label="Remove field">
                <Trash2 />
              </Button>
            </div>
          </section>
        ) : null}

        <section className="grid gap-1.5 rounded-xl border bg-card p-4">
          <p className="text-[13px] font-medium">
            Fields for the client <span className="text-muted-foreground">({fields.length})</span>
          </p>
          <ul className="grid gap-0.5">
            {fields
              .slice()
              .sort((a, b) => a.page - b.page || a.y - b.y)
              .map((f) => {
                const M = fieldMeta[f.type];
                return (
                  <li key={f.id}>
                    <button type="button" onClick={() => setSelected(f.id)} className={cn("flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-muted", selected === f.id && "bg-muted")}>
                      {signers.length > 1 ? <span className={cn("size-1.5 shrink-0 rounded-full", SIGNER_DOT[signerIdx(f.signer) % SIGNER_DOT.length])} /> : null}
                      <M.icon className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{f.label}</span>
                      <span className="text-muted-foreground">p{f.page}</span>
                      {f.source === "ai" ? <Sparkles className="size-3 text-violet-500" /> : null}
                    </button>
                  </li>
                );
              })}
          </ul>
        </section>
      </aside>
    </div>
  );
}
