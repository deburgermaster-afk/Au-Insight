"use server";

import { eq } from "drizzle-orm";
import { updateTag } from "next/cache";
import { db, schema as s } from "@/db";
import type { ActionResult } from "@/lib/actions";
import { isJpg, isPng, LOGO_MAX } from "@/lib/brand";
import { agencyTag } from "@/lib/data";
import { agencyPrefix, putFile } from "@/lib/files";
import { requireRole } from "@/lib/session";

/** Admin: upload the agency logo (PNG or JPG, up to 900 KB). It appears on every PDF letterhead. */
export async function uploadLogo(form: FormData): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    const file = form.get("logo");
    if (!(file instanceof File) || !file.size) return { ok: false, error: "Choose an image." };
    if (file.size > LOGO_MAX) return { ok: false, error: "Logos must be 900 KB or smaller." };
    const bytes = new Uint8Array(await file.arrayBuffer());
    const png = isPng(bytes);
    if (!png && !isJpg(bytes)) return { ok: false, error: "Use a PNG or JPG. (SVG and WebP can't be embedded in PDFs.)" };
    const { pathname } = await putFile(`${agencyPrefix(ctx.agencyId)}brand/logo.${png ? "png" : "jpg"}`, Buffer.from(bytes), png ? "image/png" : "image/jpeg");
    await db.insert(s.agencyProfile).values({ agencyId: ctx.agencyId, logoKey: pathname }).onConflictDoUpdate({ target: s.agencyProfile.agencyId, set: { logoKey: pathname } });
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agency_profile", entityId: ctx.agencyId, detail: { logo: "uploaded" } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function removeLogo(): Promise<ActionResult> {
  try {
    const ctx = await requireRole("admin");
    await db.update(s.agencyProfile).set({ logoKey: null }).where(eq(s.agencyProfile.agencyId, ctx.agencyId));
    await db.insert(s.auditLog).values({ agencyId: ctx.agencyId, actorId: ctx.userId, actorName: ctx.name, action: "update", entity: "agency_profile", entityId: ctx.agencyId, detail: { logo: "removed" } });
    updateTag(agencyTag(ctx.agencyId));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
