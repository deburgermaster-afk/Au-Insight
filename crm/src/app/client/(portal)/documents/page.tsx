import { bytes, fileKind, fileUrl } from "@/components/mail/file-icon";
import { PortalUpload } from "@/components/portal/upload";
import { requireClient } from "@/lib/client-auth";
import { portalDocuments } from "@/lib/client-data";
import { dmy } from "@/lib/format";
import { type Folder, FolderView } from "@/components/portal/folders";

export const metadata = { title: "Files" };

export default async function Documents() {
  const c = await requireClient();
  const rows = await portalDocuments(c);
  const mine = rows.filter((r) => r.d.source === "portal" && r.d.category !== "Signed").length;
  // Folders by document type (category), like a drive: identity, education, signed forms…
  const palette = ["#0ea5e9", "#7c3aed", "#f97316", "#10b981", "#e11d48", "#14b8a6", "#6366f1", "#d97706"];
  const byCat = new Map<string, Folder>();
  for (const { d, matter } of rows) {
    const cat = d.category || fileKind(d.mimeType ?? "", d.name).label || "Other";
    if (!byCat.has(cat)) byCat.set(cat, { key: cat, name: cat, mark: cat.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""), color: palette[byCat.size % palette.length], items: [] });
    byCat.get(cat)!.items.push({ id: d.id, title: d.name, sub: `${matter ? `${matter} · ` : ""}${dmy(d.createdAt)}${d.sizeBytes ? ` · ${bytes(d.sizeBytes)}` : ""}${d.source === "portal" ? " · from you" : ""}`, state: d.source === "portal" && d.category !== "Signed" ? "paid" : "doc", href: d.storageKey ? fileUrl(d.storageKey, d.name) : undefined, external: true });
  }
  const folders = [...byCat.values()];
  return (
    <div className="grid gap-3">
      <div className="flex items-end justify-between gap-2 px-0.5 pt-1">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Files</h1>
          <p className="text-xs text-muted-foreground">
            {rows.length} files · {mine} from you
          </p>
        </div>
        <PortalUpload agencyId={c.client.agencyId} clientId={c.client.id} label="Upload" variant="default" size="sm" />
      </div>
      <FolderView folders={folders} filters={[{ key: "all", label: "All", states: ["doc", "paid"] }, { key: "mine", label: "From me", states: ["paid"] }, { key: "agency", label: "From agency", states: ["doc"] }]} empty="No files here." />
      {!rows.length ? <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">No files yet. Upload passports, certificates and anything your agent asks for.</p> : null}
      <p className="px-1 text-center text-[11px] text-muted-foreground">Files are stored privately in Australia and shared only with {c.agency.name}.</p>
    </div>
  );
}
