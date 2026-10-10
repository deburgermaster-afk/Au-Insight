"""Imports Home Affairs visa processing times (and citizenship processing times) into Supabase.

    python processing_times.py              # import now
    python processing_times.py --if-stale   # only when the last import is older than a week
    python processing_times.py --dry-run    # fetch, parse and print, write nothing

Sources:
- The JSON service behind the visa processing times guide
  (https://immi.homeaffairs.gov.au/visas/getting-a-visa/visa-processing-times/global-visa-processing-times).
  The page shows only the 50% and 90% marks of the visa picked in its dropdown; the service has every
  subclass and stream with the 25%, 50%, 75% and 90% marks, the date they were updated and the date the
  figures run to. GPT.aspx/GetProcessGuideVisas lists the visas the guide offers, GetVisaGlobalProcessingTime
  gives the published times (a request with an empty stream returns every stream of that subclass, including
  closed ones published as "Processing times are not available") and GetProcessGuideInfo gives one visa's
  name, link, note and the same times in whole days.
- Citizenship: the table on https://immi.homeaffairs.gov.au/citizenship/citizenship-processing-times/citizenship-processing-times
  (plain page content, not the service).

Rows go in through the token-protected worker_processing_times_* database functions
(supabase/migrations/20261010110000_processing_times.sql).

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
"""

from __future__ import annotations

import argparse
import asyncio
import json
import re
import sys
from datetime import date, datetime, timezone

import httpx
from bs4 import BeautifulSoup

from occupations import BROWSER, _date, _space, blocks, html_to_markdown
from supa import WorkerAPI

SITE = "https://immi.homeaffairs.gov.au"
GUIDE_PAGE = SITE + "/visas/getting-a-visa/visa-processing-times/global-visa-processing-times"
GPT_API = SITE + "/_layouts/15/api/GPT.aspx/"
CITIZENSHIP_PAGE = SITE + "/citizenship/citizenship-processing-times/citizenship-processing-times"
NOT_AVAILABLE = "processing times are not available"
# Every three-digit code is asked for (a few requests), so subclasses the guide does not offer still come back.
ALL_CODES = [str(c) for c in range(100, 1000)]
REQUEST_BATCH = 150
BATCH = 200
MARKS = ("25", "50", "75", "90")


def _post_headers() -> dict:
    return {**BROWSER, "Content-Type": "application/json; charset=utf-8", "Referer": GUIDE_PAGE}


async def _gpt(http: httpx.AsyncClient, method: str, body: dict) -> list[dict]:
    # The site's bot protection answers some rapid requests with 403; they go through after a pause.
    for attempt in range(5):
        r = await http.post(GPT_API + method, json=body, headers=_post_headers())
        if r.status_code in (403, 429) or r.status_code >= 500:
            if attempt < 4:
                await asyncio.sleep(3 * 2**attempt)
                continue
        r.raise_for_status()
        break
    d = r.json().get("d") or {}
    if not d.get("success"):
        raise RuntimeError(f"{method} failed: {str(d)[:200]}")
    return d.get("data") or []


def _days(text: str, guide_days: str | None) -> int | None:
    """Whole days for a published time. "N days" is exact. Otherwise the guide's own day figure, when it
    agrees with the text: it gives 1 for "Less than 1 Day", and for "N Months" a figure within a month and
    a half of N (hand-entered texts round up: "4 months" for 92 days). One listing pairs "12 Months" with
    258 days; such a contradiction stays null. Months are never converted by us."""
    t = _space(text).lower()
    m = re.fullmatch(r"(\d+) days?", t)
    if m:
        return int(m.group(1))
    g = int(guide_days) if (guide_days or "").strip().isdigit() else None
    if g is None:
        return None
    if t == "less than 1 day":
        return g if g <= 1 else None
    m = re.fullmatch(r"(\d+) months?", t)
    if m and abs(g / 30.44 - int(m.group(1))) <= 1.5:
        return g
    return None


def _text(html: str | None) -> str | None:
    t = _space(BeautifulSoup(html or "", "html.parser").get_text(" "))
    return t[:2000] or None


def _url(path: str | None) -> str | None:
    path = (path or "").strip()
    if not path:
        return None
    return path if path.startswith("http") else SITE + ("" if path.startswith("/") else "/") + path


def parse_visas(times: list[dict], guide: list[dict], infos: dict[tuple[str, str], dict]) -> list[dict]:
    """One row per (visa code, stream code) the service publishes."""
    offered = {(g["VisaSubclassCode"], g.get("StreamCode") or ""): g for g in guide}
    rows: dict[tuple[str, str], dict] = {}
    for x in times:
        code = _space(x.get("VisaSubclassCode"))
        stream_code = _space(x.get("StreamCode"))
        m = re.match(r"(\d{3})", code)
        if not m:
            print(f"  processing_times: skipped visa code {code!r}", file=sys.stderr)
            continue
        key = (code, stream_code)
        info = infos.get(key) or {}
        g = offered.get(key) or {}
        published = {p: _space(x.get(f"Percent{p}")) or None for p in MARKS}
        row = {
            "subclass": m.group(1),
            "stream": _space(x.get("StreamText") or info.get("StreamText") or g.get("StreamText")),
            "visa_code": code,
            "stream_code": stream_code,
            "visa_name": _space(info.get("VisaSubclassText") or g.get("VisaSubclassText")) or None,
            "updated": _space(x.get("Updated")) or None,
            "as_at": None,
            "period_end": None,
            "guide_max_days": int(info["ProcessGuideMaxDays"]) if str(info.get("ProcessGuideMaxDays") or "").isdigit() else None,
            "in_guide": key in offered,
            "note": _text(info.get("ProcessGuideInfo")),
            "visa_url": _url(info.get("VisaUrl")),
            "source_url": GUIDE_PAGE,
        }
        for p in MARKS:
            row[f"p{p}"] = published[p]
            row[f"p{p}_days"] = _days(published[p] or "", info.get(f"Percent{p}"))
        d = _date(row["updated"] or "")
        row["as_at"] = d.isoformat() if d else None
        d = _date(x.get("EndDate") or "")
        row["period_end"] = d.isoformat() if d else None
        rows[key] = row
    return list(rows.values())


async def fetch_visas(http: httpx.AsyncClient) -> list[dict]:
    guide = await _gpt(http, "GetProcessGuideVisas", {})
    if len(guide) < 30:
        raise RuntimeError(f"the processing times guide lists only {len(guide)} visas")
    asked = [{"VisaSubclassCode": g["VisaSubclassCode"], "StreamCode": g.get("StreamCode") or ""} for g in guide]
    asked += [{"VisaSubclassCode": c, "StreamCode": ""} for c in ALL_CODES]
    times: list[dict] = []
    for i in range(0, len(asked), REQUEST_BATCH):
        times += await _gpt(http, "GetVisaGlobalProcessingTime", {"gptRequest": asked[i : i + REQUEST_BATCH]})
    pairs = {(_space(t.get("VisaSubclassCode")), _space(t.get("StreamCode"))) for t in times}
    missing = [(g["VisaSubclassCode"], g.get("StreamCode") or "") for g in guide
               if (g["VisaSubclassCode"], g.get("StreamCode") or "") not in pairs]
    if missing:
        raise RuntimeError(f"no processing times for visas the guide offers: {missing[:10]}")

    infos: dict[tuple[str, str], dict] = {}
    gate = asyncio.Semaphore(2)

    async def info(code: str, stream: str) -> None:
        async with gate:
            try:
                data = await _gpt(http, "GetProcessGuideInfo", {"gptRequest": {"VisaSubclassCode": code, "StreamCode": stream}})
            except (httpx.HTTPError, RuntimeError, ValueError) as e:
                print(f"  processing_times: no guide info for {code}/{stream}: {e!r}", file=sys.stderr)
                return
            if data:
                infos[(code, stream)] = data[0]

    await asyncio.gather(*(info(c, s) for c, s in sorted(pairs)))
    # Without its guide info a row would lose its day figures, name and note: better to try again later.
    lost = [(g["VisaSubclassCode"], g.get("StreamCode") or "") for g in guide
            if (g["VisaSubclassCode"], g.get("StreamCode") or "") not in infos]
    if lost:
        raise RuntimeError(f"no guide info for {len(lost)} visas the guide offers: {lost[:10]}")
    return parse_visas(times, guide, infos)


def _footnote(cell: str) -> str:
    """'... other situations) 1' -> '... other situations)': the page's footnote marks."""
    return re.sub(r"(?<=[A-Za-z)])\s*\d$", "", _space(cell))


def parse_citizenship(page: str) -> list[dict]:
    """Rows of the citizenship processing times table: one per application type and period counted (the
    conferral rows after the first leave the application type cell out)."""
    m = re.search(r'id="pageModified"[^>]*>\s*(\d{1,2})/(\d{1,2})/(\d{4})', page)
    as_at = date(int(m.group(3)), int(m.group(2)), int(m.group(1))) if m else None
    rows = []
    kind = None
    for b in blocks(html_to_markdown(page)):
        if b[0] != "t" or "period counted" not in " ".join(b[1][0]).lower():
            continue
        for r in b[1][1:]:
            cells = [_footnote(c) for c in r]
            if len(cells) == 6:
                kind = cells[0]
                cells = cells[1:]
            if len(cells) != 5 or not kind:
                continue
            period = cells[0]
            row = {
                "subclass": "citizenship", "visa_code": "citizenship",
                "stream": f"{kind}: {period[:1].lower() + period[1:]}",
                "stream_code": re.sub(r"[^a-z0-9]+", "-", f"{kind} {period}".lower()).strip("-")[:120],
                "visa_name": "Australian citizenship",
                "updated": f"{as_at.day} {as_at.strftime('%B %Y')}" if as_at else None,
                "as_at": as_at.isoformat() if as_at else None,
                "period_end": None, "guide_max_days": None, "in_guide": False, "note": None,
                "visa_url": SITE + "/citizenship", "source_url": CITIZENSHIP_PAGE,
            }
            for p, c in zip(MARKS, cells[1:]):
                row[f"p{p}"] = c or None
                row[f"p{p}_days"] = _days(c, None)
            rows.append(row)
        break
    return rows


async def fetch_citizenship(http: httpx.AsyncClient) -> list[dict]:
    r = await http.get(CITIZENSHIP_PAGE, headers=BROWSER)
    r.raise_for_status()
    return parse_citizenship(r.text)


# ───────────────────────────── Import ─────────────────────────────


async def import_processing_times(api: WorkerAPI, http: httpx.AsyncClient, dry_run: bool = False) -> dict:
    run = "processing_times-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    try:
        rows = await fetch_visas(http)
        try:
            citizenship = await fetch_citizenship(http)
        except (httpx.HTTPError, ValueError) as e:  # the visa times still go in
            print(f"  processing_times: citizenship page failed: {e!r}", file=sys.stderr)
            citizenship = []
        if not citizenship:
            print("  processing_times: no citizenship times found", file=sys.stderr)
        rows += citizenship
        # Published times with no day figure: citizenship months, and guide figures that contradict the text.
        no_days = [f"{r['visa_code']}/{r['stream_code'] or '-'} p{p}" for r in rows for p in MARKS
                   if r[f"p{p}"] and r[f"p{p}_days"] is None and NOT_AVAILABLE not in r[f"p{p}"].lower()]
        counts = {"fetched": len(rows), "no_days": len(no_days),
                  "no_days_visas": [x for x in no_days if not x.startswith("citizenship")][:50]}
        if dry_run:
            return {**counts, "sample": [r for r in rows if r["subclass"] in ("189", "190")] + citizenship[:1]}
        written = 0
        for i in range(0, len(rows), BATCH):
            written += await api.call("worker_processing_times_upsert", rows=rows[i : i + BATCH], run=run) or 0
        result = await api.call("worker_processing_times_finish", run=run, counts={**counts, "written": written})
    except Exception as e:
        if not dry_run:
            await api.call("worker_processing_times_finish", run=run, error=repr(e)[:1500])
        raise
    print(f"  processing_times: {result}", file=sys.stderr)
    return result


async def refresh_if_stale(api: WorkerAPI, max_age_days: int = 7) -> bool:
    """Imports the processing times when the last import is older than max_age_days (Home Affairs updates
    them monthly). Returns whether it ran. Failures are logged, not raised, so the crawler keeps going."""
    try:
        last = await api.call("worker_occupations_last_run", kind="processing_times")
        if last and last.get("finished_at"):
            finished = datetime.fromisoformat(last["finished_at"].replace("Z", "+00:00"))
            if (datetime.now(timezone.utc) - finished).days < max_age_days:
                return False
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
            await import_processing_times(api, http)
        return True
    except Exception as e:  # noqa: BLE001 - the crawler keeps going without this source
        print(f"  processing_times: refresh failed: {e!r}", file=sys.stderr)
        return False


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--if-stale", action="store_true", help="only import when the last import is a week old")
    ap.add_argument("--dry-run", action="store_true", help="parse and print, write nothing")
    args = ap.parse_args()
    api = WorkerAPI()
    try:
        if args.if_stale:
            print("imported" if await refresh_if_stale(api) else "up to date", file=sys.stderr)
            return
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
            result = await import_processing_times(api, http, dry_run=args.dry_run)
        if args.dry_run:
            print(json.dumps(result, indent=1, default=str)[:6000])
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
