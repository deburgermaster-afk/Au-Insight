"use client";

import { upload } from "@vercel/blob/client";
import type { MailAttachment } from "@/db/crm-schema";

const SMALL = 4 * 1024 * 1024;

/** Sends small files through the app's own upload route, with progress. */
function viaServer(form: FormData, onProgress?: (pct: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/files/upload");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.((e.loaded / e.total) * 100);
    xhr.onload = () => {
      const body = JSON.parse(xhr.responseText || "{}") as { pathname?: string; error?: string };
      if (xhr.status < 300 && body.pathname) resolve(body.pathname);
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed: check your connection"));
    xhr.send(form);
  });
}

/**
 * Uploads a browser file to the agency's private store and returns its attachment record. Files
 * under 4 MB go through the app; larger ones go straight to Blob storage with a short-lived token.
 */
export async function uploadFile(agencyId: string, folder: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const name = f.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  const type = f.type || "application/octet-stream";
  const sub = `${folder}/${crypto.randomUUID().slice(0, 8)}`;
  let key: string;
  if (f.size <= SMALL) {
    const form = new FormData();
    form.set("file", f);
    form.set("agencyId", agencyId);
    form.set("folder", sub);
    key = await viaServer(form, onProgress);
  } else {
    const blob = await upload(`agency/${agencyId}/${sub}/${name}`, f, {
      access: "private",
      handleUploadUrl: "/api/upload",
      contentType: f.type || undefined,
      multipart: f.size > 8 * 1024 * 1024,
      onUploadProgress: (p) => onProgress?.(p.percentage),
    });
    key = blob.pathname;
  }
  return { name: f.name, size: f.size, type, key };
}

/** The client-portal variant: authorised by the portal token instead of a session. */
export async function uploadPortalFile(token: string, agencyId: string, linkId: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const type = f.type || "application/octet-stream";
  if (f.size <= SMALL) {
    const form = new FormData();
    form.set("file", f);
    form.set("token", token);
    return { name: f.name, size: f.size, type, key: await viaServer(form, onProgress) };
  }
  const blob = await upload(`agency/${agencyId}/portal/${linkId}/${f.name.replace(/[^\w.\- ()]+/g, "_")}`, f, {
    access: "private",
    handleUploadUrl: "/api/upload",
    clientPayload: JSON.stringify({ token }),
    contentType: f.type || undefined,
    multipart: f.size > 8 * 1024 * 1024,
    onUploadProgress: (p) => onProgress?.(p.percentage),
  });
  return { name: f.name, size: f.size, type, key: blob.pathname };
}
