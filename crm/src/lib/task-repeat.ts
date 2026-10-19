import "server-only";
import { eq } from "drizzle-orm";
import { db, schema as s } from "@/db";

/** The next due date for a repeating task, counted from when this one was due (or today). */
function nextDue(from: Date, repeat: string) {
  const d = new Date(from);
  if (repeat === "daily") d.setUTCDate(d.getUTCDate() + 1);
  else if (repeat === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (repeat === "fortnightly") d.setUTCDate(d.getUTCDate() + 14);
  else if (repeat === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  else if (repeat === "quarterly") d.setUTCMonth(d.getUTCMonth() + 3);
  else if (repeat === "yearly") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else return null;
  return d;
}

/** When a repeating task is done, make the next one (once), unless it's past the repeat-until date. */
export async function repeatTask(t: typeof s.tasks.$inferSelect) {
  if (t.repeat === "none" || t.nextTaskId) return null;
  const due = nextDue(t.dueAt ?? new Date(), t.repeat);
  if (!due || (t.repeatUntil && due.toISOString().slice(0, 10) > t.repeatUntil)) return null;
  const [n] = await db
    .insert(s.tasks)
    .values({ agencyId: t.agencyId, title: t.title, description: t.description, priority: t.priority, dueAt: due, assignedTo: t.assignedTo, clientId: t.clientId, matterId: t.matterId, createdBy: t.createdBy, repeat: t.repeat, repeatUntil: t.repeatUntil })
    .returning({ id: s.tasks.id });
  await db.update(s.tasks).set({ nextTaskId: n.id }).where(eq(s.tasks.id, t.id));
  return n.id;
}

