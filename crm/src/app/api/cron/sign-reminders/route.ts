import { inArray, sql } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { notifyStaff } from "@/lib/notify";
import { memberCtx } from "@/lib/session";
import { emailClient, emailOther, ev, hashToken, newToken, pendingSigners, signersOf } from "@/lib/sign-core";

// Hourly from the worker's cron, during Sydney business hours: reminds people who haven't signed.
//  - with a due date: 2 days before, and once when it's overdue (the agent is told too);
//  - without one: 3 days and 7 days after it was sent.
// Each reminder is recorded on the request ("auto:…" events) so it goes once.
export async function GET(req: Request) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) return new Response("Unauthorized", { status: 401 });
  const hour = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Sydney" }).format(new Date()));
  if (hour < 9 || hour >= 18) return Response.json({ skipped: "outside business hours" });
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const days = (a: string, b: string) => Math.round((new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime()) / 864e5);
  const open = await db.select().from(s.signRequests).where(inArray(s.signRequests.status, ["sent", "viewed"])).limit(500);
  const orgs = new Map((await db.select({ id: s.organization.id, name: s.organization.name }).from(s.organization)).map((o) => [o.id, o.name]));
  let sent = 0;
  for (const r of open) {
    const has = (k: string) => r.events.some((e) => e.kind === "reminded" && e.detail === k);
    const sentDay = r.createdAt.toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
    let kind: string | null = null;
    if (r.dueAt) {
      const d = days(r.dueAt, today);
      if (d < 0 && !has("auto:overdue")) kind = "auto:overdue";
      else if (d >= 0 && d <= 2 && !has("auto:due-soon") && days(today, sentDay) >= 1) kind = "auto:due-soon";
    } else {
      const age = days(today, sentDay);
      if (age >= 7 && !has("auto:7d")) kind = "auto:7d";
      else if (age >= 3 && age < 7 && !has("auto:3d")) kind = "auto:3d";
    }
    if (!kind) continue;
    try {
      const agencyName = orgs.get(r.agencyId) ?? "Your agency";
      const left = pendingSigners(r);
      const reminder = kind === "auto:overdue" ? "overdue" : kind === "auto:due-soon" ? "due-soon" : "nudge";
      let n = 0;
      if (left.some((x) => x.role === "client") && (await emailClient(r, { agencyName, reminder }))) n++;
      // Other signers get a fresh link in the email (it replaces the old one).
      let signers = signersOf(r);
      const [c] = await db.select({ f: s.clients.firstName, l: s.clients.lastName }).from(s.clients).where(sql`${s.clients.id} = ${r.clientId}`);
      for (const x of left.filter((y) => y.role === "other")) {
        const t = newToken();
        // Swap in the new link only once it has actually been emailed.
        if (await emailOther(r, x, t, { agencyName, clientName: `${c?.f ?? ""} ${c?.l ?? ""}`.trim(), reminder: true })) {
          signers = signers.map((y) => (y.id === x.id ? { ...y, tokenHash: hashToken(t) } : y));
          n++;
        }
      }
      await db.update(s.signRequests).set({ signers, events: sql`${s.signRequests.events} || ${JSON.stringify([ev("reminded", "Lodgely", kind)])}::jsonb` }).where(sql`${s.signRequests.id} = ${r.id}`);
      if (n) {
        await db.insert(s.activities).values({ agencyId: r.agencyId, clientId: r.clientId, matterId: r.matterId, kind: "email", title: `Automatic reminder to sign: ${r.title}`, body: kind === "auto:overdue" ? `Overdue since ${r.dueAt}.` : kind === "auto:due-soon" ? `Due ${r.dueAt}.` : `Sent ${sentDay}, not signed yet.`, actorName: "Lodgely" });
        sent += n;
      }
      // Overdue, or only the agent's countersignature left: tell the agent.
      const agentLeft = left.length === 1 && left[0].role === "agent";
      if (kind === "auto:overdue" || agentLeft) {
        const who = [...new Set([r.sentBy, agentLeft ? left[0].userId : null].filter((x): x is string => Boolean(x)))];
        const emails = (await Promise.all(who.map((u) => memberCtx(r.agencyId, u)))).filter(Boolean).map((x) => x!.email);
        await notifyStaff(emails, agentLeft ? `Countersign: ${r.title}` : `Overdue signature: ${r.title}`, { heading: agentLeft ? `${r.title} is waiting for your countersignature` : `${r.title} is overdue`, lines: agentLeft ? ["Everyone else has signed."] : [`It was due ${r.dueAt}. Waiting for ${left.map((x) => x.name).join(", ")}.`], cta: { label: "Open the request", path: `/app/sign/${r.id}` } });
      }
    } catch (e) {
      console.error("sign reminder", r.id, e);
    }
  }
  return Response.json({ checked: open.length, sent });
}
