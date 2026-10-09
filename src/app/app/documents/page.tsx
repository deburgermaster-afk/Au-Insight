"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2Icon, ChevronLeftIcon, FileIcon, FolderPlusIcon, LoaderIcon, UploadIcon } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { spring } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Folder = { id: string; name: string };
type Doc = { id: string; folder_id: string | null; filename: string; mime_type: string; size_bytes: number; status: string; created_at: string };

const UNSORTED: Folder = { id: "unsorted", name: "Unsorted" };
const tints = ["bg-sky-300/80", "bg-brand", "bg-amber-200/90", "bg-rose-200/90", "bg-violet-300/80", "bg-emerald-200/90"];
const filters = ["All", "Processed", "Pending"] as const;

function FolderCard({ folder, docs, index, onOpen }: { folder: Folder; docs: Doc[]; index: number; onOpen: () => void }) {
  const peek = docs.slice(0, 3);
  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...spring.soft, delay: index * 0.04 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.97 }}
      onClick={onOpen}
      className="group text-left"
    >
      <div className="relative h-36">
        {peek.map((d, i) => (
          <motion.div
            key={d.id}
            className={cn("absolute top-1 h-16 w-1/2 rounded-lg shadow-md", i === 0 ? tints[index % tints.length] : "bg-white/90")}
            style={{ left: `${14 + i * 14}%`, rotate: (i - 1) * 6 }}
            whileHover={{ y: -8 }}
          >
            {d.status === "extracted" && <CheckCircle2Icon className="m-1.5 size-4 text-emerald-600" />}
          </motion.div>
        ))}
        <div className="absolute inset-x-0 bottom-0 h-24 rounded-3xl border border-white/10 bg-white/[0.07] backdrop-blur-xl transition-colors group-hover:bg-white/10">
          <FileIcon className="absolute right-4 bottom-4 size-6 text-white/60" />
        </div>
      </div>
      <p className="mt-2 text-center text-sm">
        {folder.name} <span className="ml-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground tabular-nums">{docs.length}</span>
      </p>
    </motion.button>
  );
}

export default function DocumentsPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [filter, setFilter] = useState<(typeof filters)[number]>("All");
  const [open, setOpen] = useState<Folder | null>(null);
  const [uploading, setUploading] = useState<{ name: string; done: boolean }[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const [f, d] = await Promise.all([
      supabase.from("folders").select("id, name").order("created_at"),
      supabase.from("documents").select("id, folder_id, filename, mime_type, size_bytes, status, created_at").order("created_at", { ascending: false }),
    ]);
    setFolders(f.data ?? []);
    setDocs(d.data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch
    load();
  }, [load]);

  const visible = useMemo(
    () => docs.filter((d) => filter === "All" || (filter === "Processed" ? d.status === "extracted" : d.status !== "extracted")),
    [docs, filter],
  );
  const inFolder = (id: string) => visible.filter((d) => (id === UNSORTED.id ? !d.folder_id : d.folder_id === id));
  const allFolders = [...folders, ...(docs.some((d) => !d.folder_id) ? [UNSORTED] : [])];

  async function newFolder() {
    const name = prompt("Folder name", "Identity documents")?.trim();
    if (!name) return;
    const { error } = await createClient().from("folders").insert({ name });
    if (error) return toast.error(error.message);
    load();
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    const supabase = createClient();
    const { data } = await supabase.auth.getClaims();
    const uid = data?.claims.sub;
    if (!uid) return;
    const list = Array.from(files);
    setUploading(list.map((f) => ({ name: f.name, done: false })));

    // Upload the batch in parallel; each file lands under the user's private prefix.
    await Promise.all(
      list.map(async (file, i) => {
        const path = `${uid}/${crypto.randomUUID()}/${file.name}`;
        const { error } = await supabase.storage.from("case-documents").upload(path, file, { contentType: file.type });
        if (!error) {
          await supabase.from("documents").insert({
            storage_path: path,
            filename: file.name,
            mime_type: file.type || "application/octet-stream",
            size_bytes: file.size,
            folder_id: open && open.id !== UNSORTED.id ? open.id : null,
          });
        } else toast.error(`${file.name}: ${error.message}`);
        setUploading((u) => u.map((x, j) => (j === i ? { ...x, done: true } : x)));
      }),
    );
    setTimeout(() => setUploading([]), 800);
    load();
  }

  async function view(doc: Doc & { storage_path?: string }) {
    const supabase = createClient();
    const { data: row } = await supabase.from("documents").select("storage_path").eq("id", doc.id).single();
    if (!row) return;
    const { data } = await supabase.storage.from("case-documents").createSignedUrl(row.storage_path, 60);
    if (data) window.open(data.signedUrl, "_blank", "noopener");
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="flex items-center gap-2">
          <AnimatePresence mode="popLayout" initial={false}>
            {open ? (
              <motion.button key="back" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} onClick={() => setOpen(null)} className="-ml-1 flex items-center text-muted-foreground">
                <ChevronLeftIcon className="size-6" />
              </motion.button>
            ) : null}
          </AnimatePresence>
          <motion.h1 layout className="text-3xl font-semibold tracking-tight">
            {open ? open.name : "Documents"}
          </motion.h1>
          <div className="ml-auto flex gap-2">
            {!open && (
              <Button variant="secondary" size="icon" className="rounded-full" onClick={newFolder} aria-label="New folder">
                <FolderPlusIcon className="size-4" />
              </Button>
            )}
            <Button size="icon" className="rounded-full" onClick={() => fileInput.current?.click()} aria-label="Upload">
              <UploadIcon className="size-4" />
            </Button>
            <input ref={fileInput} type="file" multiple hidden accept="application/pdf,image/*,.doc,.docx" onChange={(e) => upload(e.target.files)} />
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          {filters.map((f) => (
            <button key={f} onClick={() => setFilter(f)} className="relative rounded-full px-4 py-1.5 text-sm">
              {filter === f && <motion.span layoutId="doc-filter" className="absolute inset-0 rounded-full bg-foreground" transition={spring.snappy} />}
              <span className={cn("relative", filter === f ? "text-background" : "text-muted-foreground")}>{f}</span>
            </button>
          ))}
        </div>

        <AnimatePresence>
          {uploading.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mt-4 space-y-1 overflow-hidden rounded-2xl border bg-card p-3 text-sm">
              {uploading.map((u) => (
                <div key={u.name} className="flex items-center gap-2">
                  {u.done ? <CheckCircle2Icon className="size-4 text-success" /> : <LoaderIcon className="size-4 animate-spin text-muted-foreground" />}
                  <span className="truncate">{u.name}</span>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {!open ? (
            <motion.div key="grid" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.98 }} className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3">
              {allFolders.map((f, i) => (
                <FolderCard key={f.id} folder={f} docs={inFolder(f.id)} index={i} onOpen={() => setOpen(f)} />
              ))}
              {allFolders.length === 0 && (
                <div className="col-span-full rounded-3xl border border-dashed p-10 text-center text-sm text-muted-foreground">
                  Create a folder (e.g. Identity, English test, Employment) and upload your documents in batches.
                </div>
              )}
            </motion.div>
          ) : (
            <motion.ul key="list" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring.soft} className="mt-6 divide-y rounded-3xl border bg-card">
              {inFolder(open.id).map((d) => (
                <li key={d.id}>
                  <button onClick={() => view(d)} className="flex w-full items-center gap-3 px-4 py-3 text-left">
                    <FileIcon className="size-5 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{d.filename}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{(d.size_bytes / 1024 / 1024).toFixed(1)} MB</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-xs", d.status === "extracted" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground")}>{d.status}</span>
                  </button>
                </li>
              ))}
              {inFolder(open.id).length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">No documents yet. Tap upload to add a batch.</li>}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
