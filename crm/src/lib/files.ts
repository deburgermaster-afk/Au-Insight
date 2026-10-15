import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Client documents and mail attachments live in a private Cloudflare R2 bucket (binding FILES).
// Paths are always prefixed with the agency id, and files are only ever served through
// /api/files, which checks the caller belongs to that agency (or holds a valid portal link).

type R2Object = { size: number; httpMetadata?: { contentType?: string }; body: ReadableStream; arrayBuffer(): Promise<ArrayBuffer> };
type R2Bucket = {
  put(key: string, value: ArrayBuffer | ArrayBufferView | ReadableStream | Blob | string, opts?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string): Promise<R2Object | null>;
};

function bucket(): R2Bucket {
  const files = (getCloudflareContext().env as { FILES?: R2Bucket }).FILES;
  if (!files) throw new Error("File storage (R2 binding FILES) is not configured");
  return files;
}

export const agencyPrefix = (agencyId: string) => `agency/${agencyId}/`;

/** `report.pdf` → `report-Xy12ab34.pdf`, so uploads never overwrite each other. */
function withSuffix(key: string) {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  const slash = key.lastIndexOf("/");
  const dot = key.lastIndexOf(".");
  return dot > slash + 1 ? `${key.slice(0, dot)}-${suffix}${key.slice(dot)}` : `${key}-${suffix}`;
}

export async function putFile(key: string, body: Blob | ArrayBuffer | Buffer | ReadableStream, contentType?: string) {
  const pathname = withSuffix(key);
  const value = body instanceof Uint8Array ? new Uint8Array(body.buffer, body.byteOffset, body.byteLength) : body;
  await bucket().put(pathname, value, { httpMetadata: contentType ? { contentType } : undefined });
  return { pathname };
}

export async function readFile(key: string) {
  const obj = await bucket().get(key);
  return obj ? { stream: obj.body, blob: { contentType: obj.httpMetadata?.contentType, size: obj.size } } : null;
}

export async function fileBytes(key: string) {
  const obj = await bucket().get(key);
  if (!obj) throw new Error("File not found");
  return Buffer.from(await obj.arrayBuffer());
}

export const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
