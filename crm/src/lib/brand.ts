import "server-only";
import { eq } from "drizzle-orm";
import type { PDFDocument, PDFPage } from "pdf-lib";
import { db, schema as s } from "@/db";
import { fileBytes } from "@/lib/files";

// The agency's logo, uploaded in Settings → Agency profile, for the letterhead of every PDF Lodgely
// makes (consent forms, letters, receipts, agreements). PNG or JPG only: pdf-lib embeds those natively.

export const LOGO_TYPES = ["image/png", "image/jpeg"] as const;
// Server actions accept up to 1 MB per request, so keep a margin for the form encoding.
export const LOGO_MAX = 900 * 1024;

/** The logo's bytes, or null when the agency hasn't uploaded one (or it can't be read). */
export async function agencyLogo(agencyId: string): Promise<Uint8Array | null> {
  const [p] = await db.select({ key: s.agencyProfile.logoKey }).from(s.agencyProfile).where(eq(s.agencyProfile.agencyId, agencyId));
  if (!p?.key) return null;
  return fileBytes(p.key)
    .then((b) => new Uint8Array(b))
    .catch(() => null);
}

export const isPng = (b: Uint8Array) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
export const isJpg = (b: Uint8Array) => b[0] === 0xff && b[1] === 0xd8;

/**
 * Draws the logo with its top-left corner at (x, top), fitted inside maxW × maxH without
 * stretching. Returns the width used (0 when there's no usable logo), so text can follow it.
 */
export async function drawLogo(pdf: PDFDocument, page: PDFPage, logo: Uint8Array | null | undefined, x: number, top: number, maxW: number, maxH: number) {
  if (!logo) return 0;
  const img = await (isPng(logo) ? pdf.embedPng(logo) : isJpg(logo) ? pdf.embedJpg(logo) : null)?.catch(() => null);
  if (!img) return 0;
  const k = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * k;
  const h = img.height * k;
  page.drawImage(img, { x, y: top - h, width: w, height: h });
  return w;
}
