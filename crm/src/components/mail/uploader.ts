"use client";

import { upload } from "@vercel/blob/client";
import type { MailAttachment } from "@/db/crm-schema";

/** Uploads a browser file to the agency's private store and returns its attachment record. */
export async function uploadFile(agencyId: string, folder: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const name = f.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  const blob = await upload(`agency/${agencyId}/${folder}/${crypto.randomUUID().slice(0, 8)}/${name}`, f, {
    access: "private",
    handleUploadUrl: "/api/upload",
    contentType: f.type || undefined,
    multipart: f.size > 8 * 1024 * 1024,
    onUploadProgress: (p) => onProgress?.(p.percentage),
  });
  return { name: f.name, size: f.size, type: f.type || "application/octet-stream", key: blob.pathname };
}
