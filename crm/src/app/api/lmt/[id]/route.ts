import { and, asc, eq } from "drizzle-orm";
import { db, schema as s } from "@/db";
import { aud, dmy, todayIso } from "@/lib/format";
import { adProblems, assessLmt, daysOpen, type LmtAd, platformLabel } from "@/lib/lmt";
import { programLabel } from "@/lib/nominations";
import { requireCap } from "@/lib/session";

const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// A printable summary of a nomination's labour market testing, to save as PDF and attach to the nomination.
export async function GET(_req: Request, { params }: RouteContext<"/api/lmt/[id]">) {
  let ctx;
  try {
    ctx = await requireCap("clients");
  } catch {
    return new Response("Sign in to view this.", { status: 401 });
  }
  const { id } = await params;
  const [row] = await db
    .select({ n: s.nominations, employer: s.employers.name, abn: s.employers.abn, first: s.clients.firstName, last: s.clients.lastName, agency: s.organization.name })
    .from(s.nominations)
    .innerJoin(s.employers, eq(s.employers.id, s.nominations.employerId))
    .innerJoin(s.organization, eq(s.organization.id, s.nominations.agencyId))
    .leftJoin(s.clients, eq(s.clients.id, s.nominations.clientId))
    .where(and(eq(s.nominations.agencyId, ctx.agencyId), eq(s.nominations.id, id)));
  if (!row) return new Response("Not found", { status: 404 });
  const { n } = row;
  const ads = (await db.select().from(s.lmtAds).where(eq(s.lmtAds.nominationId, n.id)).orderBy(asc(s.lmtAds.publishedOn))) as LmtAd[];
  const salary = n.salary ? Number(n.salary) : null;
  const at = n.lodgedAt ?? todayIso();
  const r = assessLmt(ads, { salary, lodgeOn: n.lodgedAt, today: todayIso() });
  const yes = (b: boolean) => (b ? "Yes" : "No");
  const rows = ads
    .map((a) => {
      const p = adProblems(a, salary);
      return `<tr><td><b>${esc(platformLabel(a.platform))}</b><br>${esc(a.adTitle)}${a.url ? `<br><span class="m">${esc(a.url)}</span>` : ""}</td><td>${dmy(a.publishedOn)}</td><td>${a.endsOn ? dmy(a.endsOn) : "Open"}</td><td>${Math.max(0, daysOpen(a, at))}</td><td>${yes(a.showsTitle)} / ${yes(a.showsEmployer)} / ${yes(a.showsSkills)} / ${yes(a.showsSalary)}</td><td>${a.applicants ?? "–"}</td><td>${a.evidence.map((f) => esc(f.name)).join("<br>") || "–"}${p.length ? `<br><span class="bad">${esc(p.join("; "))}</span>` : ""}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Labour market testing: ${esc(n.positionTitle)}</title>
<style>body{font:13px/1.5 system-ui,sans-serif;color:#111;background:#fff;margin:32px;max-width:1000px}h1{font-size:20px;margin:0 0 4px}.m{color:#666;font-size:12px}table{border-collapse:collapse;width:100%;margin-top:12px}th,td{border:1px solid #ddd;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f5f5f5;font-size:12px}.ok{color:#047857}.bad{color:#b91c1c}ul{padding-left:18px}button{margin-bottom:16px;padding:6px 14px;border-radius:999px;border:1px solid #ccc;background:#fff;cursor:pointer}@media print{button{display:none}body{margin:0}}</style></head><body>
<button onclick="print()">Print or save as PDF</button>
<h1>Labour market testing summary</h1>
<p class="m">${esc(row.employer)}${row.abn ? ` · ABN ${esc(row.abn)}` : ""} · ${esc(programLabel(n.program))} · ${esc(n.positionTitle)}${n.anzsco ? ` (ANZSCO ${esc(n.anzsco)})` : ""}${salary ? ` · ${aud(salary)} p.a.` : ""}${row.first ? ` · Nominee ${esc(row.first)} ${esc(row.last ?? "")}` : ""}</p>
${n.lmtExemption ? `<p><b>Exempt from labour market testing:</b> ${esc(n.lmtExemption)}</p>` : `<ul>${r.checks.map((c) => `<li class="${c.ok ? "ok" : "bad"}"><b>${c.ok ? "Met" : "Not met"}: ${esc(c.label)}.</b> <span style="color:#444">${esc(c.detail)}</span></li>`).join("")}</ul>
<p>${r.complete ? `Testing is complete${r.lodgeBy ? `. Lodge the nomination by <b>${dmy(r.lodgeBy)}</b>` : ""}.` : "Testing is not complete yet."} ${n.lodgedAt ? `Assessed as at lodgement on ${dmy(n.lodgedAt)}.` : `Assessed as at ${dmy(at)}.`}</p>
<table><thead><tr><th>Ad</th><th>Published</th><th>Closed</th><th>Days</th><th>Shows title / sponsor / skills / salary</th><th>Applicants</th><th>Evidence</th></tr></thead><tbody>${rows || `<tr><td colspan="7">No ads recorded.</td></tr>`}</tbody></table>`}
<p class="m" style="margin-top:20px">Prepared by ${esc(row.agency)} with Lodgely on ${dmy(todayIso())}. Checks follow the requirements in force from 7 December 2024; confirm against the current instrument.</p>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}
