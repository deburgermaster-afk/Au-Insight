import { Download } from "lucide-react";
import { bytes, fileKind, fileUrl } from "@/components/mail/file-icon";
import { PortalUpload } from "@/components/portal/upload";
import { requireClient } from "@/lib/client-auth";
import { portalDocuments } from "@/lib/client-data";
import { dmy } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Files" };

export default async function Documents() {
  const c = await requireClient();
  const rows = await portalDocuments(c);
  const groups = [...new Set(rows.map((r) => r.ref ?? "General"))];
  const mine = rows.filter((r) => r.d.source === "portal").length;
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
      {groups.map((g) => {
        const list = rows.filter((r) => (r.ref ?? "General") === g);
        return (
          <section key={g} className="overflow-hidden rounded-xl border bg-card">
            <p className="flex items-center justify-between border-b bg-muted/30 px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="truncate">{list[0].matter ? `${list[0].matter} · ${g}` : g}</span>
              <span>{list.length}</span>
            </p>
            <ul className="divide-y">
              {list.map(({ d }) => {
                const k = fileKind(d.mimeType ?? "", d.name);
                return (
                  <li key={d.id}>
                    <a href={d.storageKey ? fileUrl(d.storageKey, d.name) : undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 px-3 py-2 active:bg-muted/50">
                      <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", k.tone)}>
                        <k.Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px]">{d.name}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {d.category ?? k.label} · {dmy(d.createdAt)}
                          {d.sizeBytes ? ` · ${bytes(d.sizeBytes)}` : ""}
                          {d.source === "portal" ? " · from you" : ""}
                        </span>
                      </span>
                      {d.storageKey ? <Download className="size-4 shrink-0 text-muted-foreground" /> : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {!rows.length ? <p className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">No files yet. Upload passports, certificates and anything your agent asks for.</p> : null}
      <p className="px-1 text-center text-[11px] text-muted-foreground">Files are stored privately in Australia and shared only with {c.agency.name}.</p>
    </div>
  );
}
