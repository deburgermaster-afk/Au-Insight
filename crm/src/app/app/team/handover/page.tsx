import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { Suspense } from "react";
import { Guard } from "@/components/app/guard";
import { PageSkeleton } from "@/components/app/skeletons";
import { HandoverHistory, HandoverPlanner } from "@/components/edit/handover";
import { db, schema as s } from "@/db";
import { staffOf } from "@/lib/handover";
import { getCtx } from "@/lib/session";

export const metadata = { title: "Handover & swaps" };

async function Handover({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  await connection();
  const [ctx, sp] = await Promise.all([getCtx(), searchParams]);
  const [staff, rows] = await Promise.all([staffOf(ctx.agencyId), db.select().from(s.handovers).where(eq(s.handovers.agencyId, ctx.agencyId)).orderBy(desc(s.handovers.createdAt)).limit(40)]);
  const people = staff.map((x) => ({ id: x.id, name: x.name, registered: x.registered })).sort((a, b) => a.name.localeCompare(b.name));
  const name = (id: string | null) => people.find((p) => p.id === id)?.name ?? "someone";
  return (
    <div className="grid gap-4">
      <HandoverPlanner people={people} initialFrom={people.some((p) => p.id === sp.from) ? sp.from! : null} />
      <HandoverHistory
        rows={rows.map((h) => ({ id: h.id, mode: h.mode, status: h.status, from: name(h.fromUserId), to: h.toUserId ? name(h.toUserId) : "several people", returnOn: h.returnOn, reason: h.reason, note: h.note, count: h.items.length, by: h.createdByName, at: h.createdAt.toISOString(), returnedAt: h.returnedAt?.toISOString() ?? null, items: h.items.map((i) => ({ label: i.label, field: i.field, entity: i.entity, to: name(i.to) })) }))}
      />
    </div>
  );
}

export default function Page(props: { searchParams: Promise<{ from?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Guard cap="team">
        <Handover {...props} />
      </Guard>
    </Suspense>
  );
}
