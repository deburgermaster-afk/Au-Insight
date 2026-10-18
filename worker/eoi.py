"""Imports the SkillSelect Expression of Interest (EOI) data into Supabase: how many EOIs are submitted, on hold,
invited, lodged or closed, by visa type, occupation, points score and month. It is the only official count of
invitations per occupation; the invitation round pages (worker/occupations.py) give round totals only.

    python eoi.py                    # import now
    python eoi.py --if-stale         # only when the last import is a week old (see refresh_if_stale)
    python eoi.py --dry-run          # read and print what would be written, write nothing
    python eoi.py --detail-months 3  # occupation-by-points detail for the latest 3 months (default 1; 0 = all)

Source: the SkillSelect EOI dashboard, an Australian Government Qlik report of Home Affairs' SkillSelect data,
linked as "SkillSelect Dashboard" from the SkillSelect previous rounds page (the link is read from there on each
run). The worker opens it in Chromium, which signs in the dashboard's anonymous Qlik session, then asks the Qlik
engine, over the same websocket the dashboard uses, for the tables its results sheet shows and exports them the
way its "Export data" menu does (CSV). Each table uses the dashboard's own dimensions and its own "Count EOIs"
measure, which publishes counts under 20 as "<20". Visa type and status are always shown and the dashboard lets
a user add up to two more fields, so these are the tables read:
    visa type x status, x occupation x status, x points x status    every month it keeps (24)
    visa type x occupation x points x status                        the latest month (--detail-months)
The second kind is about 29,000 rows a month, so its history grows a month per import rather than 600,000 rows
at once. Totals come from the dashboard, never from summing rows that hide counts under 20.

The dashboard's firewall turns away data-centre addresses (HTTP 403). To read it from a server, set
EOI_BROWSER_CDP (or --cdp) to the CDP websocket of a remote Chromium with an Australian connection, such as a
TinyFish browser session; without it the worker launches the local Chromium.

Rows go in through the token-protected worker_eoi_* database functions
(supabase/migrations/20261010114000_skillselect_eoi.sql).

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN; optional EOI_BROWSER_CDP
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import csv
import html as htmllib
import io
import json
import os
import re
import sys
from datetime import date, datetime, timezone

import httpx
from playwright.async_api import async_playwright

from supa import WorkerAPI

SOURCE = "skillselect_eoi"
PREVIOUS_URL = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds"
SKILLSELECT_URL = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect"
# Used when neither page links the dashboard (e.g. while Home Affairs is updating them).
DASHBOARD_URL = ("https://api.dynamic.reports.employment.gov.au/anonap/extensions/hSKLS02_SkillSelect_EOI_Data/"
                 "hSKLS02_SkillSelect_EOI_Data.html")
DASHBOARD_LINK = re.compile(r"https://[\w.-]*reports\.employment\.gov\.au/[^\s\"'<>]*SkillSelect[^\s\"'<>]*\.html", re.I)
BROWSER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-AU,en;q=0.9",
}
# The dashboard's library dimensions and measure, found by title so a republished app with new ids still works.
DIMENSIONS = {"month": "As At Month", "visa": "Visa Type", "occupation": "Occupation", "points": "Points",
              "status": "EOI Status"}
MEASURE = "Count EOIs"  # the masked one; "Count EOIs (No Mask)" would publish what the dashboard hides
VIEWS = {  # name -> the fields shown besides month and visa type
    "totals": ("status",),
    "occupations": ("occupation", "status"),
    "points": ("points", "status"),
    "detail": ("occupation", "points", "status"),
}
BATCH = 1000

# Runs in the dashboard page. One engine session of its own (its own identity, so the dashboard's default
# selection never applies to it), JSON-RPC as in the Qlik Engine API.
ENGINE_JS = r"""
async (task) => {
  if (!window.__eoi) {
    const ws = new WebSocket(`wss://${location.host}${task.prefix}app/${task.app}/identity/eoi${Date.now()}`);
    const pending = new Map();
    let seq = 0;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        const [ok, fail] = pending.get(m.id); pending.delete(m.id);
        m.error ? fail(new Error(JSON.stringify(m.error))) : ok(m.result);
      }
    };
    await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = () => fail(new Error('engine websocket refused')); });
    const call = (handle, method, params) => new Promise((ok, fail) => {
      const id = ++seq; pending.set(id, [ok, fail]);
      ws.send(JSON.stringify({jsonrpc: '2.0', id, handle, method, params}));
    });
    window.__eoi = {call, doc: (await call(-1, 'OpenDoc', [task.app])).qReturn.qHandle};
  }
  const {call, doc} = window.__eoi;
  const session = async (props) => (await call(doc, 'CreateSessionObject', [props])).qReturn.qHandle;

  if (task.kind === 'meta') {
    const layout = (await call(doc, 'GetAppLayout', [])).qLayout;
    const evaluate = async (expr) => { try { return (await call(doc, 'Evaluate', [expr])).qReturn; } catch (e) { return null; } };
    const dims = (await call(await session({qInfo: {qType: 'DimensionList'}, qDimensionListDef: {qType: 'dimension'}}),
                             'GetLayout', [])).qLayout.qDimensionList.qItems;
    const meas = (await call(await session({qInfo: {qType: 'MeasureList'}, qMeasureListDef: {qType: 'measure',
                             qData: {measure: '/qMeasure'}}}), 'GetLayout', [])).qLayout.qMeasureList.qItems;
    const months = (await call(await session({qInfo: {qType: 'Months'}, qListObjectDef: {qDef: {qFieldDefs: ['As At Month']},
                     qInitialDataFetch: [{qTop: 0, qLeft: 0, qWidth: 1, qHeight: 500}]}}), 'GetLayout', [])).qLayout;
    return {
      title: layout.qTitle, reloaded: layout.qLastReloadTime,
      current_to: await evaluate("Date('$(vDataMaxDate)')"), mask: await evaluate('vMinCountMask'),
      dimensions: dims.map(d => ({id: d.qInfo.qId, title: d.qMeta.title})),
      measures: meas.map(m => ({id: m.qInfo.qId, title: m.qMeta.title, def: m.qData.measure && m.qData.measure.qDef})),
      months: months.qListObject.qDataPages[0].qMatrix.map(r => ({text: r[0].qText, num: r[0].qNum})),
    };
  }

  // A table: clear, pick the months, then export it as the dashboard's "Export data" does.
  await call(doc, 'ClearAll', [false]);
  if (task.months) {
    const field = (await call(doc, 'GetField', ['As At Month'])).qReturn.qHandle;
    await call(field, 'SelectValues', [task.months.map(n => ({qText: '', qIsNumeric: true, qNumber: n})), false, false]);
  }
  const obj = await session({qInfo: {qType: 'eoi-table'}, qHyperCubeDef: {
    qDimensions: task.dims.map(id => ({qLibraryId: id, qNullSuppression: true})),
    qMeasures: [{qLibraryId: task.measure}], qSuppressZero: true, qSuppressMissing: true, qMode: 'S'}});
  const size = (await call(obj, 'GetLayout', [])).qLayout.qHyperCube.qSize;
  try {
    const out = await call(obj, 'ExportData', ['CSV_C', '/qHyperCubeDef', 'skillselect-eoi.csv', 'P']);
    const r = await fetch(task.prefix + out.qUrl.replace(/^\//, ''));
    if (!r.ok) throw new Error('export download HTTP ' + r.status);
    return {rows: size.qcy, csv: await r.text()};
  } catch (e) {
    // Export refused: page through the same table instead.
    const height = Math.floor(10000 / size.qcx), matrix = [];
    for (let top = 0; top < size.qcy; top += height) {
      const pages = (await call(obj, 'GetHyperCubeData', ['/qHyperCubeDef',
        [{qTop: top, qLeft: 0, qWidth: size.qcx, qHeight: height}]])).qDataPages;
      for (const row of pages[0].qMatrix) matrix.push(row.map(c => c.qText));
    }
    return {rows: size.qcy, matrix, export_error: String(e.message || e)};
  }
}
"""


def _space(s: str | None) -> str:
    return re.sub(r"[\s ​]+", " ", s or "").strip()


def month_end(text: str) -> date | None:
    """'09/2026' -> date(2026, 9, 30): the dashboard's snapshot is taken on the last day of the month."""
    m = re.fullmatch(r"(\d{1,2})/(\d{4})", _space(text))
    if not m or not 1 <= int(m.group(1)) <= 12:
        return None
    y, mo = int(m.group(2)), int(m.group(1))
    return date(y, mo, calendar.monthrange(y, mo)[1])


def parse_table(records: list[list[str]], fields: tuple[str, ...], source_url: str) -> tuple[list[dict], int]:
    """Rows for skillselect_eoi from one exported table (month, visa type, *fields, count), and how many were
    skipped. A field the table doesn't break down by is '' (all)."""
    rows, skipped = [], 0
    for rec in records:
        if len(rec) != len(fields) + 3:
            skipped += 1
            continue
        cells = dict(zip(("month", "visa", *fields, "count"), (_space(c) for c in rec)))
        as_at = month_end(cells["month"])
        sub = re.match(r"(\d{3}[A-Z]*)\b", cells["visa"])
        if not as_at or not sub or not cells["status"] or not cells["count"]:
            skipped += 1
            continue
        occ = cells.get("occupation")
        code = re.match(r"(\d{6})\s+(.+)$", occ or "")
        rows.append({
            "as_at": as_at.isoformat(),
            "subclass": sub.group(1),
            "visa_type": cells["visa"],
            "anzsco": code.group(1) if code else (occ or ""),
            "occupation": code.group(2) if code else (occ or None),
            "points": cells.get("points", ""),
            "status": cells["status"],
            "count_text": cells["count"],
            "source_url": source_url,
        })
    return rows, skipped


async def find_dashboard(http: httpx.AsyncClient) -> str:
    """The dashboard link Home Affairs currently gives (previous rounds page, then the SkillSelect page)."""
    for page in (PREVIOUS_URL, SKILLSELECT_URL):
        try:
            r = await http.get(page, headers=BROWSER)
            r.raise_for_status()
        except httpx.HTTPError as e:
            print(f"  eoi: could not read {page}: {e!r}", file=sys.stderr)
            continue
        # The page keeps some of its content HTML-escaped inside a JSON field.
        m = DASHBOARD_LINK.search(htmllib.unescape(htmllib.unescape(r.text)))
        if m:
            return m.group(0)
    print(f"  eoi: no dashboard link found on the SkillSelect pages; using {DASHBOARD_URL}", file=sys.stderr)
    return DASHBOARD_URL


async def read_dashboard(url: str, cdp: str | None = None, detail_months: int = 1) -> dict:
    """Every table in VIEWS, parsed, plus the dashboard's own dates."""
    async with async_playwright() as p:
        if cdp:
            browser = await p.chromium.connect_over_cdp(cdp, timeout=60000)
            ctx = browser.contexts[0] if browser.contexts else await browser.new_context()
        else:
            browser = await p.chromium.launch()
            ctx = await browser.new_context(locale="en-AU")
        page = await ctx.new_page()
        try:
            resp = await page.goto(url, wait_until="domcontentloaded", timeout=120000)
            if resp is None or resp.status >= 400:
                status = resp.status if resp else "no response"
                raise RuntimeError(f"the EOI dashboard refused the connection (HTTP {status}); its firewall turns away "
                                   "data-centre addresses: set EOI_BROWSER_CDP to a browser with an Australian connection")
            script = await page.evaluate("async (u) => { const r = await fetch(u); return r.ok ? r.text() : ''; }",
                                         re.sub(r"\.html?$", ".js", url.split("?")[0]))
            app = re.search(r"openApp\(\s*['\"]([0-9a-f-]{36})['\"]", script or "")
            if not app:
                raise RuntimeError("could not find the Qlik app id in the dashboard's script")
            prefix = re.match(r"https://[^/]+(/.*?/)extensions/", url)
            base = {"app": app.group(1), "prefix": prefix.group(1) if prefix else "/"}
            meta = await page.evaluate(ENGINE_JS, {**base, "kind": "meta"})

            dims = {d["title"]: d["id"] for d in meta["dimensions"]}
            missing = [t for t in DIMENSIONS.values() if t not in dims]
            measure = next((m for m in meta["measures"] if m["title"] == MEASURE), None)
            if missing or not measure:
                raise RuntimeError(f"the dashboard no longer has {missing or [MEASURE]}")
            if "vMinCountMask" not in (measure.get("def") or ""):
                raise RuntimeError(f"{MEASURE} no longer hides small counts: {measure.get('def')!r}")
            months = sorted((m for m in meta["months"] if month_end(m["text"])), key=lambda m: m["num"])
            detail = [m["num"] for m in months[-detail_months:]] if detail_months > 0 else None

            rows: list[dict] = []
            tables: dict[str, dict] = {}
            for name, fields in VIEWS.items():
                task = {**base, "kind": "table", "measure": measure["id"],
                        "dims": [dims[DIMENSIONS[f]] for f in ("month", "visa", *fields)],
                        "months": detail if name == "detail" else None}
                out = await page.evaluate(ENGINE_JS, task)
                if "csv" in out:
                    records = list(csv.reader(io.StringIO(out["csv"])))[1:]  # header: the field titles
                else:
                    print(f"  eoi: {name}: export refused ({out.get('export_error')}); read the table instead",
                          file=sys.stderr)
                    records = out["matrix"]
                if len(records) != out["rows"]:
                    raise RuntimeError(f"{name}: the dashboard has {out['rows']} rows but {len(records)} were read")
                parsed, skipped = parse_table(records, fields, url)
                tables[name] = {"rows": len(parsed), "skipped": skipped, "via": "export" if "csv" in out else "table"}
                rows += parsed
        finally:
            await page.close()
            if not cdp:
                await browser.close()
    return {"rows": rows, "tables": tables, "source_url": url, "title": meta["title"], "reloaded": meta["reloaded"],
            "data_current_to": meta["current_to"], "mask": meta["mask"], "months": [m["text"] for m in months]}


# ───────────────────────────── Import ─────────────────────────────


def _run(source: str) -> str:
    return f"{source}-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


async def import_eoi(api: WorkerAPI, url: str | None = None, cdp: str | None = None, detail_months: int = 1,
                     dry_run: bool = False) -> dict:
    run = _run(SOURCE)
    try:
        if not url:
            async with httpx.AsyncClient(timeout=60, follow_redirects=True) as http:
                url = await find_dashboard(http)
        data = await read_dashboard(url, cdp, detail_months)
        rows = data["rows"]
        latest = max((r["as_at"] for r in rows if r["anzsco"] == "" and r["points"] == ""), default=None)
        if not latest or not any(r["anzsco"] for r in rows if r["as_at"] == latest):
            raise RuntimeError("the dashboard returned no totals or no occupations for its latest month")
        counts = {k: data[k] for k in ("source_url", "title", "reloaded", "data_current_to", "mask", "tables")}
        counts["dashboard_months"] = [data["months"][0], data["months"][-1]] if data["months"] else []
        if dry_run:
            totals = [r for r in rows if r["as_at"] == latest and r["anzsco"] == "" and r["points"] == ""]
            return {**counts, "rows": len(rows), "latest": latest,
                    "latest_totals": {f"{r['subclass']} {r['status']}": r["count_text"] for r in totals},
                    "sample": [r for r in rows if r["anzsco"] == "261313" and r["as_at"] == latest][:6]}
        written = 0
        for i in range(0, len(rows), BATCH):
            written += await api.call("worker_eoi_upsert", rows=rows[i : i + BATCH], run=run) or 0
        result = await api.call("worker_eoi_finish", run=run, counts={**counts, "written": written})
    except Exception as e:
        if not dry_run:
            await api.call("worker_eoi_finish", run=run, error=repr(e)[:1500])
        raise
    print(f"  eoi: {result}", file=sys.stderr)
    return result


async def refresh_if_stale(api: WorkerAPI, max_age_days: int = 7) -> bool:
    """Imports the EOI data when its last import is older than max_age_days (the dashboard is refreshed once a
    month, early in the month). Returns whether it ran. Failures are logged, not raised, so the crawler keeps
    going."""
    try:
        last = await api.call("worker_occupations_last_run", kind=SOURCE)
        if last and last.get("finished_at"):
            finished = datetime.fromisoformat(last["finished_at"].replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - finished).days < max_age_days:
                return False
        await import_eoi(api, cdp=os.getenv("EOI_BROWSER_CDP"))
        return True
    except Exception as e:  # noqa: BLE001 - the crawler keeps going without this source
        print(f"  {SOURCE}: refresh failed: {e!r}", file=sys.stderr)
        return False


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--if-stale", action="store_true", help="only import when the last import is a week old")
    ap.add_argument("--dry-run", action="store_true", help="read and print, write nothing")
    ap.add_argument("--detail-months", type=int, default=1, help="months of occupation-by-points detail (0 = all)")
    ap.add_argument("--cdp", default=os.getenv("EOI_BROWSER_CDP"), help="CDP websocket of a remote browser")
    ap.add_argument("--url", help="the dashboard URL (default: the link on the SkillSelect pages)")
    args = ap.parse_args()
    api = WorkerAPI()
    try:
        if args.if_stale:
            print("imported" if await refresh_if_stale(api) else "up to date", file=sys.stderr)
            return
        result = await import_eoi(api, url=args.url, cdp=args.cdp, detail_months=args.detail_months,
                                  dry_run=args.dry_run)
        if args.dry_run:
            print(json.dumps(result, indent=1, default=str)[:6000])
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
