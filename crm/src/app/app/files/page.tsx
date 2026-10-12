import { asc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { Skeleton } from "@/components/ui/skeleton";
import { db, schema as s } from "@/db";
import { getDrive } from "@/lib/data";
import { getCtx } from "@/lib/session";
import { Drive } from "./drive";

export const metadata = { title: "Files" };

const starter = [
  { name: "Agency policies", minRole: "staff" },
  { name: "Templates & forms", minRole: "staff" },
  { name: "Service agreements", minRole: "agent" },
  { name: "Marketing", minRole: "staff" },
  { name: "HR & contracts", minRole: "admin" },
];

const levels = ["client", "staff", "agent", "supervisor", "admin", "owner"];

async function Files() {
  await connection();
  const ctx = await getCtx();
  // Folders are read fresh (they're few, and the starter set is created on first visit).
  let folders = await db.select().from(s.folders).where(eq(s.folders.agencyId, ctx.agencyId)).orderBy(asc(s.folders.name));
  if (!folders.length) {
    await db.insert(s.folders).values(starter.map((f) => ({ ...f, agencyId: ctx.agencyId, createdBy: "Lodgely" })));
    folders = await db.select().from(s.folders).where(eq(s.folders.agencyId, ctx.agencyId)).orderBy(asc(s.folders.name));
  }
  const rank = levels.indexOf(ctx.role);
  const visible = folders.filter((f) => levels.indexOf(f.minRole) <= rank);
  const ids = new Set(visible.map((f) => f.id));
  const drive = await getDrive();
  return <Drive folders={visible} docs={drive.docs.filter((d) => !d.folderId || ids.has(d.folderId))} clients={drive.clients} agencyId={ctx.agencyId} />;
}

export default function FilesPage() {
  return (
    <Suspense fallback={<Skeleton className="-m-3 h-[calc(100dvh-4.25rem)] rounded-none" />}>
      <Guard cap="files">
        <Files />
      </Guard>
    </Suspense>
  );
}
