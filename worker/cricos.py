"""Imports the official CRICOS register (every provider, course, campus and declared fee for
international students) from data.gov.au into Supabase.

    python cricos.py              # import now
    python cricos.py --if-stale   # import only when the last import is older than 7 days

Source: data.gov.au dataset "cricos" (Department of Education), published as four CSVs:
institutions, courses, locations and course locations. Rows go in through the token-protected
worker_cricos_* database functions (see supabase/migrations/20261009110000_education.sql).

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import io
import re
import sys
from datetime import date, datetime, timezone
from urllib.parse import urlparse

import httpx

from supa import WorkerAPI

CKAN = "https://data.gov.au/data/api/3/action/package_show?id=cricos"
FILES = {
    "providers": "CRICOS Institutions",
    "courses": "CRICOS Courses",
    "locations": "CRICOS Locations",
    "course_locations": "CRICOS Course Locations",
}
BATCH = 1000
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; ImmiInsight/1.0; +https://au-insight.vercel.app)"}


def _text(v: str | None) -> str | None:
    v = (v or "").strip()
    return v or None


def _money(v: str | None) -> float | None:
    v = (v or "").replace("$", "").replace(",", "").strip()
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _num(v: str | None) -> float | None:
    v = (v or "").replace(",", "").strip()
    try:
        return float(v) if v else None
    except ValueError:
        return None


def _int(v: str | None) -> int | None:
    n = _num(v)
    return int(n) if n is not None else None


def _bool(v: str | None) -> bool | None:
    v = (v or "").strip().lower()
    return True if v == "yes" else False if v == "no" else None


def _code(v: str | None) -> str | None:
    """'08 - Management and Commerce' stays as written; empty becomes None."""
    return _text(v)


def websites(raw: str | None) -> tuple[str | None, list[str]]:
    """The register's website field can hold several sites. Returns the first as a URL, and every host."""
    parts = [p for p in re.split(r"[\s,;]+", raw or "") if "." in p]
    hosts: list[str] = []
    first = None
    for p in parts:
        url = p if re.match(r"^https?://", p, re.I) else "https://" + p
        host = (urlparse(url).hostname or "").lower().rstrip(".")
        host = re.sub(r"^www\d?\.", "", host)
        if not host:
            continue
        first = first or url
        if host not in hosts:
            hosts.append(host)
    return first, hosts


def provider_row(r: dict) -> dict:
    site, hosts = websites(r.get("Website"))
    return {
        "code": _text(r.get("CRICOS Provider Code")),
        "name": _text(r.get("Institution Name")),
        "trading_name": _text(r.get("Trading Name")),
        "type": _text(r.get("Institution Type")),
        "capacity": _int(r.get("Institution Capacity")),
        "website": site,
        "domains": hosts,
        "city": _text(r.get("Postal Address City")),
        "state": _text(r.get("Postal Address State")),
        "postcode": _text(r.get("Postal Address Postcode")),
    }


def course_row(r: dict) -> dict:
    return {
        "code": _text(r.get("CRICOS Course Code")),
        "provider_code": _text(r.get("CRICOS Provider Code")),
        "name": _text(r.get("Course Name")),
        "vet_code": _text(r.get("VET National Code")),
        "dual_qualification": _bool(r.get("Dual Qualification")),
        "foe1_broad": _code(r.get("Field of Education 1 Broad Field")),
        "foe1_narrow": _code(r.get("Field of Education 1 Narrow Field")),
        "foe1_detailed": _code(r.get("Field of Education 1 Detailed Field")),
        "foe2_broad": _code(r.get("Field of Education 2 Broad Field")),
        "foe2_narrow": _code(r.get("Field of Education 2 Narrow Field")),
        "foe2_detailed": _code(r.get("Field of Education 2 Detailed Field")),
        "level": _text(r.get("Course Level")),
        "foundation": _bool(r.get("Foundation Studies")),
        "work_component": _bool(r.get("Work Component")),
        "work_hours_week": _num(r.get("Work Component Hours/Week")),
        "work_weeks": _int(r.get("Work Component Weeks")),
        "work_total_hours": _num(r.get("Work Component Total Hours")),
        "language": _text(r.get("Course Language")),
        "duration_weeks": _int(r.get("Duration (Weeks)")),
        "tuition_fee": _money(r.get("Tuition Fee")),
        "non_tuition_fee": _money(r.get("Non Tuition Fee")),
        "total_cost": _money(r.get("Estimated Total Course Cost")),
        "expired": bool(_bool(r.get("Expired"))),
    }


def location_row(r: dict) -> dict:
    address = ", ".join(x for x in (_text(r.get(f"Address Line {i}")) for i in range(1, 5)) if x) or None
    return {
        "provider_code": _text(r.get("CRICOS Provider Code")),
        "name": _text(r.get("Location Name")),
        "type": _text(r.get("Location Type")),
        "address": address,
        "city": _text(r.get("City")),
        "state": _text(r.get("State")),
        "postcode": _text(r.get("Postcode")),
    }


def course_location_row(r: dict) -> dict:
    return {
        "provider_code": _text(r.get("CRICOS Provider Code")),
        "course_code": _text(r.get("CRICOS Course Code")),
        "location_name": _text(r.get("Location Name")),
        "city": _text(r.get("Location City")),
        "state": _text(r.get("Location State")),
    }


PARSERS = {
    "providers": provider_row,
    "courses": course_row,
    "locations": location_row,
    "course_locations": course_location_row,
}


async def latest_files(http: httpx.AsyncClient) -> tuple[dict[str, str], date]:
    """URLs of the four CSVs and the dataset's last-modified date."""
    r = await http.get(CKAN)
    r.raise_for_status()
    pkg = r.json()["result"]
    urls: dict[str, str] = {}
    for kind, name in FILES.items():
        for res in pkg["resources"]:
            if (res.get("format") or "").upper() == "CSV" and (res.get("name") or "").strip().startswith(name) and (
                res.get("name") or ""
            ).strip().removesuffix(".csv") == name:
                urls[kind] = res["url"]
                break
        if kind not in urls:
            raise RuntimeError(f"CRICOS dataset has no CSV named {name!r}")
    modified = (pkg.get("metadata_modified") or "")[:10]
    as_at = date.fromisoformat(modified) if modified else date.today()
    return urls, as_at


async def download(http: httpx.AsyncClient, url: str) -> list[dict]:
    r = await http.get(url, timeout=300)
    r.raise_for_status()
    text = r.content.decode("utf-8-sig", errors="replace")
    return list(csv.DictReader(io.StringIO(text)))


async def has_upsert(api: WorkerAPI) -> bool:
    """Whether the full refresh functions are installed. An empty run is rejected before anything is written."""
    try:
        await api.call("worker_cricos_upsert", kind="providers", rows=[], run="")
        return True
    except RuntimeError as e:
        return "run required" in str(e)


async def run_import(api: WorkerAPI) -> dict:
    run = "cricos-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    async with httpx.AsyncClient(timeout=120, headers=HEADERS, follow_redirects=True) as http:
        urls, as_at = await latest_files(http)
        rows = {kind: [PARSERS[kind](r) for r in await download(http, url)] for kind, url in urls.items()}

    # Full refresh functions (update + expire) when installed; otherwise the insert-only first import.
    full = await has_upsert(api)
    upsert = "worker_cricos_upsert" if full else "worker_cricos_insert"
    counts: dict[str, int] = {}
    for kind in ("providers", "courses", "locations", "course_locations"):
        batch = [r for r in rows[kind] if all(v is not None for k, v in r.items() if k in ("code", "name", "provider_code", "course_code", "location_name"))]
        written = 0
        for i in range(0, len(batch), BATCH):
            written += await api.call(upsert, kind=kind, rows=batch[i : i + BATCH], run=run) or 0
        counts[kind] = len(batch)
        print(f"  {kind}: {len(batch)} rows from the register, {written} written", file=sys.stderr)

    if full:
        result = await api.call("worker_cricos_finish", run=run, as_at=as_at.isoformat())
    else:
        await api.call("worker_cricos_record", run=run, as_at=as_at.isoformat(), counts=counts)
        result = counts
    print(f"CRICOS register as at {as_at}: {result}", file=sys.stderr)
    return result


async def refresh_if_stale(api: WorkerAPI, max_age_days: int = 7) -> bool:
    """Imports the register when the last import is older than max_age_days. Returns whether it ran."""
    try:
        last = await api.call("worker_cricos_last_run")
    except Exception as e:  # noqa: BLE001 - the crawler keeps going without CRICOS
        print(f"  cricos: can't read last run: {e}", file=sys.stderr)
        return False
    if last and last.get("finished_at"):
        finished = datetime.fromisoformat(last["finished_at"].replace("Z", "+00:00"))
        if (datetime.now(timezone.utc) - finished).days < max_age_days:
            return False
    await run_import(api)
    return True


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--if-stale", action="store_true", help="only import when the last import is over 7 days old")
    args = ap.parse_args()
    api = WorkerAPI()
    try:
        if args.if_stale:
            ran = await refresh_if_stale(api)
            print("imported" if ran else "up to date", file=sys.stderr)
        else:
            await run_import(api)
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
