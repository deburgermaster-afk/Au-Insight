"use client";

import { ChevronRight, Download, Eye, Folder, FolderInput, FolderLock, FolderPlus, Home, MoreHorizontal, Search, Trash2, UsersRound } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { bytes, fileKind, fileUrl } from "@/components/mail/file-icon";
import { UploadButton } from "@/components/mail/upload-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { createFolder, deleteDocument, deleteFolder, moveDocument } from "@/lib/files-actions";
import { ago } from "@/lib/format";
import { cn } from "@/lib/utils";

type F = { id: string; name: string; parentId: string | null; minRole: string; createdBy: string | null };
type D = { id: string; name: string; mimeType: string | null; sizeBytes: number | null; storageKey: string | null; folderId: string | null; clientId: string | null; clientName: string | null; uploadedBy: string | null; createdAt: Date; source: string | null };
type C = { id: string; name: string; n: number };
type Here = { kind: "root" } | { kind: "folder"; id: string } | { kind: "clients" } | { kind: "client"; id: string };

const access: Record<string, string> = { staff: "Everyone", agent: "Agents and above", supervisor: "Supervisors and above", admin: "Admins only" };

export function Drive({ folders, docs, clients, agencyId }: { folders: F[]; docs: D[]; clients: C[]; agencyId: string }) {
  const [here, setHere] = useState<Here>({ kind: "root" });
  const [q, setQ] = useState("");
  const [, start] = useTransition();
  const folderId = here.kind === "folder" ? here.id : null;
  const trail = useMemo(() => {
    if (here.kind !== "folder") return [];
    const out: F[] = [];
    let f = folders.find((x) => x.id === here.id);
    while (f) {
      out.unshift(f);
      f = folders.find((x) => x.id === f!.parentId);
    }
    return out;
  }, [here, folders]);
  const t = q.trim().toLowerCase();
  const subfolders = here.kind === "root" ? folders.filter((f) => !f.parentId) : here.kind === "folder" ? folders.filter((f) => f.parentId === here.id) : [];
  const files = t
    ? docs.filter((d) => `${d.name} ${d.clientName ?? ""}`.toLowerCase().includes(t))
    : here.kind === "folder"
      ? docs.filter((d) => d.folderId === here.id)
      : here.kind === "client"
        ? docs.filter((d) => d.clientId === here.id)
        : here.kind === "root"
          ? docs.filter((d) => !d.folderId && !d.clientId)
          : [];
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) toast.error((r as { error: string }).error);
      else if (ok) toast.success(ok);
    });

  const Side = ({ k, label, icon: Icon, n, active, onClick }: { k: string; label: string; icon: typeof Folder; n?: number; active: boolean; onClick: () => void }) => (
    <button key={k} type="button" onClick={onClick} className={cn("flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-[13px]", active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60")}>
      <Icon className="size-4" /> <span className="truncate">{label}</span>
      {n ? <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">{n}</span> : null}
    </button>
  );

  return (
    <div className="-m-3 grid h-[calc(100dvh-3.25rem-1rem)] min-h-[32rem] md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="hidden min-h-0 flex-col gap-1 overflow-y-auto border-r p-3 md:flex">
        <Side k="root" label="Agency drive" icon={Home} active={here.kind === "root"} onClick={() => setHere({ kind: "root" })} />
        <div className="ml-3 border-l pl-2">
          {folders
            .filter((f) => !f.parentId)
            .map((f) => (
              <Side key={f.id} k={f.id} label={f.name} icon={f.minRole === "staff" ? Folder : FolderLock} n={docs.filter((d) => d.folderId === f.id).length} active={here.kind === "folder" && trail[0]?.id === f.id} onClick={() => setHere({ kind: "folder", id: f.id })} />
            ))}
        </div>
        <Side k="clients" label="Client files" icon={UsersRound} n={clients.length} active={here.kind === "clients" || here.kind === "client"} onClick={() => setHere({ kind: "clients" })} />
        <p className="mt-auto rounded-lg border bg-muted/30 p-3 text-[11px] text-muted-foreground">Client records are kept for 7 years (Code of Conduct s56); only admins can delete files.</p>
      </aside>
      <section className="flex min-h-0 flex-col">
        <div className="flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
          <nav className="flex min-w-0 items-center gap-1 text-[13px]">
            <button type="button" onClick={() => setHere({ kind: "root" })} className="text-muted-foreground hover:text-foreground">
              Drive
            </button>
            {here.kind === "clients" || here.kind === "client" ? (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
                <button type="button" onClick={() => setHere({ kind: "clients" })} className={here.kind === "clients" ? "" : "text-muted-foreground hover:text-foreground"}>
                  Client files
                </button>
              </>
            ) : null}
            {here.kind === "client" ? (
              <>
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
                <span>{clients.find((c) => c.id === here.id)?.name}</span>
              </>
            ) : null}
            {trail.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="size-3.5 text-muted-foreground/50" />
                <button type="button" onClick={() => setHere({ kind: "folder", id: f.id })} className={i === trail.length - 1 ? "" : "text-muted-foreground hover:text-foreground"}>
                  {f.name}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative ml-auto w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all files" className="h-8 pl-8 text-[13px]" />
          </div>
          {here.kind === "root" || here.kind === "folder" ? <NewFolder parentId={folderId} /> : null}
          {here.kind !== "clients" ? (
            <UploadButton agencyId={agencyId} folderId={folderId} clientId={here.kind === "client" ? here.id : null} label="Upload" />
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {here.kind === "clients" && !t ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {clients.map((c) => (
                <button key={c.id} type="button" onClick={() => setHere({ kind: "client", id: c.id })} className="flex items-center gap-2.5 rounded-xl border bg-card p-3 text-left transition hover:border-foreground/20">
                  <Folder className="size-5 shrink-0 fill-[var(--chart-3)]/20 text-[var(--chart-3)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium">{c.name}</span>
                    <span className="text-[11px] text-muted-foreground">{c.n} files</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}
          {subfolders.length && !t ? (
            <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {subfolders.map((f) => (
                <div key={f.id} className="group relative flex items-center gap-2.5 rounded-xl border bg-card p-3 transition hover:border-foreground/20">
                  <button type="button" onClick={() => setHere({ kind: "folder", id: f.id })} className="flex min-w-0 flex-1 items-center gap-2.5 text-left after:absolute after:inset-0">
                    {f.minRole === "staff" ? <Folder className="size-5 shrink-0 fill-[var(--chart-4)]/20 text-[var(--chart-4)]" /> : <FolderLock className="size-5 shrink-0 text-[var(--chart-2)]" />}
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{f.name}</span>
                      <span className="text-[11px] text-muted-foreground">{access[f.minRole]}</span>
                    </span>
                  </button>
                  <button type="button" className="relative z-10 grid size-6 place-items-center rounded opacity-0 hover:bg-muted group-hover:opacity-100" onClick={() => run(() => deleteFolder(f.id), "Folder deleted")} aria-label="Delete folder">
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {here.kind !== "clients" || t ? (
            files.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                <AnimatePresence initial={false}>
                  {files.map((d) => {
                    const k = fileKind(d.mimeType ?? "", d.name);
                    return (
                      <motion.div key={d.id} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", k.tone)}>
                          <k.Icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium">{d.name}</p>
                          <p className="truncate text-[11px] text-muted-foreground">
                            {[d.sizeBytes ? bytes(d.sizeBytes) : null, d.clientName, d.uploadedBy, ago(d.createdAt)].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="icon-xs" variant="ghost" aria-label="File actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            {d.storageKey ? (
                              <>
                                <DropdownMenuItem asChild>
                                  <a href={fileUrl(d.storageKey, d.name)} target="_blank" rel="noreferrer">
                                    <Eye /> Open
                                  </a>
                                </DropdownMenuItem>
                                <DropdownMenuItem asChild>
                                  <a href={fileUrl(d.storageKey, d.name, true)}>
                                    <Download /> Download
                                  </a>
                                </DropdownMenuItem>
                              </>
                            ) : null}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                              <FolderInput className="size-3.5" /> Move to
                            </DropdownMenuLabel>
                            <DropdownMenuItem onSelect={() => run(() => moveDocument(d.id, null), "Moved")}>Drive (top level)</DropdownMenuItem>
                            {folders.map((f) => (
                              <DropdownMenuItem key={f.id} onSelect={() => run(() => moveDocument(d.id, f.id), `Moved to ${f.name}`)}>
                                {f.name}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-rose-500" onSelect={() => run(() => deleteDocument(d.id), "File deleted")}>
                              <Trash2 /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            ) : (
              <p className="py-16 text-center text-sm text-muted-foreground">{t ? "No files match." : "No files here yet. Upload or drop files with the button above."}</p>
            )
          ) : null}
        </div>
      </section>
    </div>
  );
}

function NewFolder({ parentId }: { parentId: string | null }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("staff");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <FolderPlus /> New folder
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-3xl sm:max-w-sm">
        <DialogTitle>New folder</DialogTitle>
        <DialogDescription>Choose who in the agency can open it.</DialogDescription>
        <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Folder name" />
        <select value={role} onChange={(e) => setRole(e.target.value)} className="h-9 rounded-lg border bg-transparent px-2 text-sm">
          {Object.entries(access).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <Button
          className="rounded-full"
          disabled={pending || !name.trim()}
          onClick={() =>
            start(async () => {
              const r = await createFolder(name, parentId, role);
              if (!r.ok) return void toast.error(r.error);
              setOpen(false);
              setName("");
            })
          }
        >
          Create
        </Button>
      </DialogContent>
    </Dialog>
  );
}
