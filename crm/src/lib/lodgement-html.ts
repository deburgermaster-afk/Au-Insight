import "server-only";
import { immiDate, type Pack } from "@/lib/lodgement";

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);

/** A printable data sheet (opens in any browser, prints to one or two A4 pages). */
export function packSheetHtml(p: NonNullable<Pack>) {
  const sections = p.sheet
    .map(
      (sec) => `<section><h2>${esc(sec.title)}</h2><table>${sec.fields
        .map((f) => `<tr><th>${esc(f.label)}</th><td class="${f.value ? "" : "missing"}">${f.value ? esc(f.value) : f.required ? "Missing" : "—"}</td></tr>`)
        .join("")}</table></section>`,
    )
    .join("");
  const docs = p.docs.map((d) => `<tr><td>${d.order}</td><td>${esc(d.file)}</td><td>${esc(d.evidence)}</td><td>${d.issues.length ? `<span class="missing">${esc(d.issues.join("; "))}</span>` : "OK"}</td></tr>`).join("");
  const gaps = p.gaps.length ? `<section><h2>Before lodging</h2><ul>${p.gaps.map((g) => `<li class="${g.level}">${esc(g.text)}</li>`).join("")}</ul></section>` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(p.matter.reference)} data sheet</title><style>
body{font:13px/1.45 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;margin:32px auto;max-width:820px;padding:0 16px}
h1{font-size:20px;margin:0}p.sub{color:#71717a;margin:4px 0 20px}h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#52525b;margin:18px 0 6px}
table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:5px 8px;border-bottom:1px solid #e4e4e7;vertical-align:top}th{width:38%;font-weight:500;color:#52525b}
.missing{color:#e11d48}li.block{color:#e11d48}li.warn{color:#b45309}section{break-inside:avoid}
@media print{body{margin:0}}</style></head><body>
<h1>${esc(p.client.name)}</h1><p class="sub">${esc(p.matter.visaName)} · ${esc(p.matter.reference)} · prepared ${esc(immiDate(new Date()))}</p>
${gaps}${sections}<section><h2>Documents, in attach order</h2><table><tr><th style="width:5%">#</th><th style="width:45%">File</th><th>ImmiAccount attachment type</th><th style="width:15%">Check</th></tr>${docs}</table></section>
<p class="sub" style="margin-top:24px">Attachment types are suggestions; choose the closest match ImmiAccount offers. Check every value against the client's documents before lodging.</p>
</body></html>`;
}
