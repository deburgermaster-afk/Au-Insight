import { File, FileArchive, FileAudio, FileImage, FileSpreadsheet, FileText, FileVideo, Presentation } from "lucide-react";

export function fileKind(type: string, name = "") {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("image/") || ["heic", "png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return { Icon: FileImage, tone: "text-sky-400 bg-sky-500/10", label: "Image" };
  if (type === "application/pdf" || ext === "pdf") return { Icon: FileText, tone: "text-rose-400 bg-rose-500/10", label: "PDF" };
  if (/sheet|excel|csv/.test(type) || ["xls", "xlsx", "csv"].includes(ext)) return { Icon: FileSpreadsheet, tone: "text-emerald-400 bg-emerald-500/10", label: "Spreadsheet" };
  if (/presentation|powerpoint/.test(type) || ["ppt", "pptx", "key"].includes(ext)) return { Icon: Presentation, tone: "text-orange-400 bg-orange-500/10", label: "Slides" };
  if (/word|document|text/.test(type) || ["doc", "docx", "txt", "rtf", "pages"].includes(ext)) return { Icon: FileText, tone: "text-blue-400 bg-blue-500/10", label: "Document" };
  if (/zip|compressed|tar|rar/.test(type) || ["zip", "rar", "7z"].includes(ext)) return { Icon: FileArchive, tone: "text-amber-400 bg-amber-500/10", label: "Archive" };
  if (type.startsWith("audio/")) return { Icon: FileAudio, tone: "text-violet-400 bg-violet-500/10", label: "Audio" };
  if (type.startsWith("video/")) return { Icon: FileVideo, tone: "text-fuchsia-400 bg-fuchsia-500/10", label: "Video" };
  return { Icon: File, tone: "text-muted-foreground bg-muted", label: "File" };
}

export const bytes = (n: number) => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 ** 2).toFixed(1)} MB`);

export const fileUrl = (key: string, name?: string, download = false) =>
  `/api/files/${key.split("/").map(encodeURIComponent).join("/")}?${new URLSearchParams({ ...(name ? { name } : {}), ...(download ? { download: "1" } : {}) })}`;
