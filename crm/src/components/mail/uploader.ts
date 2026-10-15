"use client";

import type { MailAttachment } from "@/db/crm-schema";

const MAX = 25 * 1024 * 1024;

function checkSize(f: File) {
  if (f.size > MAX) throw new Error(`${f.name} is larger than 25 MB`);
}

/** Sends a file through the app's own upload route (into R2), with progress. */
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
 * Uploads a browser file to the agency's private store and returns its attachment record.
 */
export async function uploadFile(agencyId: string, folder: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const name = f.name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
  const type = f.type || "application/octet-stream";
  const sub = `${folder}/${crypto.randomUUID().slice(0, 8)}`;
  checkSize(f);
  const form = new FormData();
  form.set("file", f, name);
  form.set("agencyId", agencyId);
  form.set("folder", sub);
  return { name: f.name, size: f.size, type, key: await viaServer(form, onProgress) };
}

/** The client-portal variant: authorised by the portal token instead of a session. */
export async function uploadPortalFile(token: string, agencyId: string, linkId: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const type = f.type || "application/octet-stream";
  checkSize(f);
  const form = new FormData();
  form.set("file", f);
  form.set("token", token);
  return { name: f.name, size: f.size, type, key: await viaServer(form, onProgress) };
}

/** The signed-in client portal variant: authorised by the client's session cookie. */
export async function uploadClientFile(agencyId: string, clientId: string, f: File, onProgress?: (pct: number) => void): Promise<MailAttachment> {
  const type = f.type || "application/octet-stream";
  checkSize(f);
  const form = new FormData();
  form.set("file", f);
  form.set("client", "1");
  return { name: f.name, size: f.size, type, key: await viaServer(form, onProgress) };
}
