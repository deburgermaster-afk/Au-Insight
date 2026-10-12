import "server-only";
import { get, put } from "@vercel/blob";

// Client documents and mail attachments live in a private Vercel Blob store. Paths are always
// prefixed with the agency id, and files are only ever served through /api/files, which checks
// the caller belongs to that agency (or holds a valid portal link).

export const agencyPrefix = (agencyId: string) => `agency/${agencyId}/`;

export async function putFile(key: string, body: Blob | ArrayBuffer | Buffer | ReadableStream, contentType?: string) {
  return put(key, body, { access: "private", contentType, addRandomSuffix: true });
}

export async function readFile(key: string) {
  const res = await get(key, { access: "private" });
  return res && res.statusCode === 200 ? res : null;
}

export async function fileBytes(key: string) {
  const res = await readFile(key);
  if (!res) throw new Error("File not found");
  return Buffer.from(await new Response(res.stream).arrayBuffer());
}

export const safeName = (name: string) => name.replace(/[^\w.\- ()]+/g, "_").slice(0, 120) || "file";
