"""Loads the skills assessment facts for the assessing authorities on the skilled occupation list into Supabase.

    python authorities.py              # load worker/data/assessing_authorities.json
    python authorities.py --dry-run    # validate and print what would be written, write nothing
    python authorities.py --check      # also re-fetch every source page and report the ones that fail

The facts (what each authority assesses for migration, processing times, priority options, fees, how long
an outcome stays valid, other requirements and links) are researched by hand from each authority's own
website and kept in the JSON file with their source pages and as_at date: the sites differ too much, and
change too often, to scrape reliably. A figure an authority doesn't publish is null, and its text field
says so. Re-research an authority when --check reports its pages changed or gone.

Rows go in through the token-protected worker_authorities_* database functions
(supabase/migrations/20261010111000_assessing_authorities.sql), which also count the listed occupations
each authority assesses and report authorities on the list that have no row.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
"""

from __future__ import annotations

import argparse
import asyncio
import json
import pathlib
import sys
from datetime import date, datetime, timezone

import httpx

from supa import WorkerAPI

DATA = pathlib.Path(__file__).with_name("data") / "assessing_authorities.json"
BROWSER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-AU,en;q=0.9",
}
TEXT = ("name", "url", "assesses", "processing_text", "priority_text", "fee_text", "validity_text", "requirements")
NUMBERS = ("processing_min_days", "processing_max_days", "fee_aud", "validity_years")
FIELDS = {"short", "aliases", "links", "source_urls", "as_at", *TEXT, *NUMBERS}


def load(path: pathlib.Path = DATA) -> list[dict]:
    """The authorities in the file, checked: one row per short name, known fields only, numbers that are
    numbers, an as_at date and at least one source page for every row that states a fact."""
    rows = json.loads(path.read_text())["authorities"]
    problems, seen = [], set()
    for r in rows:
        who = r.get("short") or "?"
        if not r.get("short") or not r.get("name"):
            problems.append(f"{who}: short and name are required")
        if r.get("short") in seen:
            problems.append(f"{who}: listed twice")
        seen.add(r.get("short"))
        if extra := set(r) - FIELDS:
            problems.append(f"{who}: unknown fields {sorted(extra)}")
        for k in NUMBERS:
            if r.get(k) is not None and not isinstance(r[k], (int, float)):
                problems.append(f"{who}: {k} must be a number or null")
        lo, hi = r.get("processing_min_days"), r.get("processing_max_days")
        if lo is not None and hi is not None and lo > hi:
            problems.append(f"{who}: processing_min_days > processing_max_days")
        try:
            date.fromisoformat(r.get("as_at") or "")
        except ValueError:
            problems.append(f"{who}: as_at must be a YYYY-MM-DD date")
        if any(r.get(k) is not None for k in (*TEXT[2:], *NUMBERS)) and not r.get("source_urls"):
            problems.append(f"{who}: facts without source_urls")
        for link in r.get("links") or []:
            if not (isinstance(link, dict) and link.get("label") and str(link.get("url", "")).startswith("http")):
                problems.append(f"{who}: links must be [{{label, url}}]")
    if problems:
        raise ValueError("assessing_authorities.json: " + "; ".join(problems))
    return rows


async def check_sources(rows: list[dict]) -> list[str]:
    """Source pages that no longer load. Some authority sites refuse data-centre addresses (403), so a
    failure here means "look at it", not "it's gone"."""
    urls = sorted({u for r in rows for u in r.get("source_urls") or []})
    failed: list[str] = []
    sem = asyncio.Semaphore(6)

    async def one(http: httpx.AsyncClient, url: str) -> None:
        async with sem:
            try:
                r = await http.get(url, headers=BROWSER)
                if r.status_code >= 400:
                    failed.append(f"{r.status_code} {url}")
            except httpx.HTTPError as e:
                failed.append(f"{type(e).__name__} {url}")

    async with httpx.AsyncClient(timeout=40, follow_redirects=True) as http:
        await asyncio.gather(*(one(http, u) for u in urls))
    print(f"  sources: {len(urls) - len(failed)}/{len(urls)} load", file=sys.stderr)
    return sorted(failed)


async def import_authorities(api: WorkerAPI, dry_run: bool = False, check: bool = False) -> dict:
    run = "authorities-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    try:
        rows = load()
        failed = await check_sources(rows) if check else []
        if dry_run:
            return {"authorities": len(rows), "failed_sources": failed,
                    "with_fee": sum(r.get("fee_aud") is not None for r in rows),
                    "with_processing_days": sum(r.get("processing_max_days") is not None for r in rows),
                    "with_validity": sum(r.get("validity_years") is not None for r in rows),
                    "sample": rows[:1]}
        written = await api.call("worker_authorities_upsert", rows=rows, run=run) or 0
        counts = {"rows_in_file": len(rows), "rows_written": written}
        if check:
            counts["failed_sources"] = failed
        result = await api.call("worker_authorities_finish", run=run, counts=counts)
    except Exception as e:
        if not dry_run:
            await api.call("worker_authorities_finish", run=run, error=repr(e)[:1500])
        raise
    print(f"  authorities: {result}", file=sys.stderr)
    return result


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="validate and print, write nothing")
    ap.add_argument("--check", action="store_true", help="re-fetch every source page and report failures")
    args = ap.parse_args()
    api = None if args.dry_run else WorkerAPI()  # a dry run needs no database
    try:
        result = await import_authorities(api, dry_run=args.dry_run, check=args.check)  # type: ignore[arg-type]
    finally:
        if api:
            await api.close()
    print(json.dumps(result, indent=1, default=str)[:4000])


if __name__ == "__main__":
    asyncio.run(main())
