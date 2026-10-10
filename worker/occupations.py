"""Imports the skilled occupation list and the SkillSelect invitation rounds into Supabase.

    python occupations.py                 # import both now
    python occupations.py --only sol      # just the occupation list (or: --only skillselect)
    python occupations.py --if-stale      # only what is out of date (see refresh_if_stale)
    python occupations.py --dry-run       # parse and print what would be written, write nothing

Sources:
- Home Affairs skilled occupation list (every occupation with its lists, visas, caveats and assessing
  authority), read from the JSON service behind https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list
- SkillSelect invitation rounds: the current round page and the previous rounds page, read from the law
  corpus copy the crawler keeps (worker_law_markdown), or from the live pages when the corpus has none.
  Gives each round's invitations and tie-break date, the minimum points each occupation was invited at,
  the next round date, monthly totals per program year and state and territory nominations.

Rows go in through the token-protected worker_occupations_* database functions
(supabase/migrations/20261009130000_occupations.sql). Jobs and Skills Australia data (shortage ratings,
occupation profiles) is imported by the data-import edge function instead.

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
"""

from __future__ import annotations

import argparse
import asyncio
import html as htmllib
import json
import re
import sys
from datetime import date, datetime, timezone

import httpx
from bs4 import BeautifulSoup

from supa import WorkerAPI

SOL_PAGE = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skill-occupation-list"
SOL_API = "https://immi.homeaffairs.gov.au/_layouts/15/api/Data.aspx/GetSkillOccupation"
ROUNDS_URL = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/invitation-rounds"
PREVIOUS_URL = "https://immi.homeaffairs.gov.au/visas/working-in-australia/skillselect/previous-rounds"
BROWSER = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Accept-Language": "en-AU,en;q=0.9",
}
BATCH = 200
MONTHS = {m: i for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
STATES = {"act": "ACT", "nsw": "NSW", "nt": "NT", "qld": "QLD", "sa": "SA", "tas": "TAS", "vic": "VIC", "wa": "WA"}


def _space(s: str | None) -> str:
    return re.sub(r"[\s ​]+", " ", s or "").strip()


def _date(text: str) -> date | None:
    """'4 June 2026' -> date(2026, 6, 4)."""
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", text or "")
    if not m or m.group(2).lower() not in MONTHS:
        return None
    try:
        return date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1)))
    except ValueError:
        return None


def program_year(d: date) -> str:
    """Australian migration program years run July to June: 4 June 2026 is in 2025-26."""
    start = d.year if d.month >= 7 else d.year - 1
    return f"{start}-{(start + 1) % 100:02d}"


# ───────────────────────────── Skilled occupation list ─────────────────────────────


def _codes(anzsco_html: str) -> tuple[str | None, str | None]:
    """(ANZSCO 2013 code, ANZSCO 2022 code). The 2022 code is the one for subclass 186 and 482 nominations;
    the 2013 code is for all other visas. One listing labels both of its codes "2022" (the second has no
    visa label): the unlabelled one is then the all-other-visas code."""
    text = _space(BeautifulSoup(anzsco_html or "", "html.parser").get_text(" "))
    c13: str | None = None
    c22: list[tuple[str, bool]] = []
    for edition, segment in re.findall(r"ANZSCO (2013|2022)((?:(?!ANZSCO).)*)", text):
        m = re.search(r"\b(\d{6})\b", segment)
        if not m:
            continue
        if edition == "2013":
            c13 = c13 or m.group(1)
        else:
            c22.append((m.group(1), "subclass" in segment.lower()))
    labelled = next((c for c, lab in c22 if lab), None)
    if c13 is None and len(c22) == 2 and labelled:
        other = next(c for c, lab in c22 if not lab)
        return other, labelled
    return c13, labelled or (c22[0][0] if c22 else None)


def _links(fragment: str) -> list[dict]:
    soup = BeautifulSoup(fragment or "", "html.parser")
    out = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("http"):
            out.append({"label": _space(a.get_text(" ")), "url": href})
    return out


def _caveats(visacaveats_html: str) -> tuple[list[str], list[dict]]:
    """Visa names as listed in the caveat column, and every caveat: [{visa, title, text}]."""
    soup = BeautifulSoup(visacaveats_html or "", "html.parser")
    ul = soup.find("ul")
    visas: list[str] = []
    caveats: list[dict] = []
    for li in ul.find_all("li", recursive=False) if ul else []:
        hidden = li.find("div", class_="hide")
        if hidden:
            hidden.extract()
        link = li.find("span", class_="table-search-caveat-link")
        if link:
            link.extract()
        visa = _space(li.get_text(" "))
        visas.append(visa)
        if hidden:
            for title in hidden.find_all("span", class_="clickbot-skill-caveat-title"):
                body = title.find_next("p")
                caveats.append({"visa": visa, "title": _space(title.get_text(" ")),
                                "text": _space(body.get_text(" ")) if body else ""})
    return visas, caveats


def _authorities(assessauth_html: str) -> list[dict]:
    """[{short, name, url, details?}]; details carries contact text when the authority has no website."""
    soup = BeautifulSoup(assessauth_html or "", "html.parser")
    ul = soup.find("ul")
    out = []
    for li in ul.find_all("li", recursive=False) if ul else []:
        first = li.find("a")
        short = _space(first.get_text(" ")) if first else _space(li.get_text(" "))[:80]
        sub = li.find("span", class_="clickbot-skill-sub-heading")
        name = _space(sub.get_text(" ")) if sub else short
        url = next((a["href"].strip() for a in li.find_all("a", href=True) if a["href"].strip().startswith("http")), None)
        entry = {"short": short, "name": name, "url": url}
        if not url:
            hidden = li.find("div", class_="hide")
            if hidden:
                for h in hidden.find_all(["span"], class_=["clickbot-skill-heading", "clickbot-skill-sub-heading"]):
                    h.extract()
                details = _space(hidden.get_text(" "))
                if details:
                    entry["details"] = details[:600]
        if short:
            out.append(entry)
    return out


def parse_sol(items: list[dict]) -> list[dict]:
    rows: list[dict] = []
    for it in items:
        title = _space(it.get("occupation"))
        c13, c22 = _codes(it.get("anzscocode", ""))
        if not title or not (c13 or c22):
            print(f"  sol: skipped {title!r}: no ANZSCO code", file=sys.stderr)
            continue
        caveat_visas, caveats = _caveats(it.get("visacaveats", ""))
        visas = [_space(v) for v in (it.get("visas") or "").split(";") if _space(v)] or caveat_visas
        subclasses = []
        for v in visas:
            m = re.match(r"(\d{3})\b", v)
            if m and m.group(1) not in subclasses:
                subclasses.append(m.group(1))
        auth = _authorities(it.get("assessauth", ""))
        rows.append({
            "anzsco": c13 or c22,
            "title": title,
            "anzsco_2013": c13,
            "anzsco_2022": c22,
            "lists": [_space(x) for x in (it.get("list") or "").split(";") if _space(x)],
            "visas": visas,
            "visa_subclasses": sorted(subclasses),
            "caveats": caveats,
            "assessing_authorities": auth,
            "authorities": [a["short"] for a in auth],
            "anzsco_links": _links(it.get("anzscocode", "")),
            "source_url": SOL_PAGE,
        })
    # A 2022-only listing whose code is another listing's 2013 code keeps its own row.
    seen: dict[str, dict] = {}
    for r in sorted(rows, key=lambda r: (r["anzsco_2013"] is None, r["title"])):
        key = r["anzsco"]
        if key in seen:
            if r["anzsco_2013"] is None:
                key = f"{r['anzsco']}-2022"
            n = 2
            while key in seen:
                key = f"{r['anzsco']}-{n}"
                n += 1
            r["anzsco"] = key
        seen[key] = r
    return list(seen.values())


async def fetch_sol(http: httpx.AsyncClient) -> list[dict]:
    r = await http.post(SOL_API, json={"webUrl": "/work-in-australia", "listname": "Occupations"},
                        headers={**BROWSER, "Content-Type": "application/json; charset=utf-8", "Referer": SOL_PAGE})
    r.raise_for_status()
    body = r.json().get("d") or {}
    if not body.get("success") or not isinstance(body.get("data"), list):
        raise RuntimeError(f"skilled occupation list API returned no data: {str(body)[:200]}")
    return body["data"]


# ───────────────────────────── SkillSelect pages ─────────────────────────────


def _cell(c: str) -> str:
    """Plain text of a markdown table cell: links to their text, no bold, no stray asterisks."""
    c = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", c)
    c = c.replace("**", "")
    return _space(c).strip("* ").strip()


def _int(c: str) -> int | None:
    c = _cell(c).replace(",", "")
    return int(c) if re.fullmatch(r"\d+", c) else None


def _points(c: str) -> int | None:
    c = _cell(c)
    return int(c) if re.fullmatch(r"\d{2,3}", c) else None


def _subclass(text: str) -> str | None:
    m = re.search(r"\b(189|190|491|489|188|887)\b", text or "")
    return m.group(1) if m else None


def blocks(markdown: str) -> list[tuple]:
    """The page as ('h', level, text), ('t', rows) and ('p', text) blocks. Table cells that wrap onto the
    next line (a row not yet closed with '|') are joined back together."""
    out: list[tuple] = []
    rows: list[list[str]] = []
    pending = ""

    def flush() -> None:
        nonlocal rows
        if rows:
            out.append(("t", rows))
            rows = []

    for raw in markdown.splitlines():
        line = raw.strip()
        if pending:
            pending += " " + line
            if not pending.endswith("|"):
                continue
            line, pending = pending, ""
        if line.startswith("|"):
            if not line.endswith("|") or line == "|":
                pending = line
                continue
            cells = [c.strip() for c in line[1:-1].split("|")]
            if all(re.fullmatch(r":?-{3,}:?", c) for c in cells if c):
                continue  # header separator
            rows.append(cells)
            continue
        flush()
        m = re.match(r"^(#{1,6})\s+(.*)$", line)
        if m:
            out.append(("h", len(m.group(1)), _cell(m.group(2))))
        elif line:
            out.append(("p", line))
    if pending:
        rows.append([c.strip() for c in pending.strip("|").split("|")])
    flush()
    return out


def html_to_markdown(page: str) -> str:
    """Fallback for the live pages: headings, paragraphs and tables of the page content (including the tab
    content Home Affairs keeps as HTML inside a JSON hidden field), in the same shape the corpus uses."""
    parts = [page]
    for value in re.findall(r'PageSchemaHiddenField_Input" value="([^"]*)"', page):
        try:
            schema = json.loads(htmllib.unescape(value))
        except ValueError:
            continue

        def walk(node) -> None:
            if isinstance(node, dict):
                if isinstance(node.get("title"), str) and isinstance(node.get("description"), str):
                    parts.append(f"<h2>{node['title']}</h2>")
                for v in node.values():
                    walk(v)
            elif isinstance(node, list):
                for v in node:
                    walk(v)
            elif isinstance(node, str) and "<" in node:
                parts.append(node)

        walk(schema)
    soup = BeautifulSoup("\n".join(parts), "html.parser")
    for t in soup(["script", "style", "noscript", "nav", "header", "footer"]):
        t.decompose()
    lines: list[str] = []
    for el in soup.find_all(["h1", "h2", "h3", "h4", "p", "table"]):
        if el.find_parent("table") or (el.name == "p" and el.find_parent("p")):
            continue
        if el.name == "table":
            for tr in el.find_all("tr"):
                cells = [_space(td.get_text(" ")).replace("|", "/") for td in tr.find_all(["th", "td"])]
                lines.append("| " + " | ".join(cells) + " |")
            lines.append("")
        elif el.name.startswith("h"):
            lines.append("#" * int(el.name[1]) + " " + _space(el.get_text(" ")))
        else:
            lines.append(_space(el.get_text(" ")))
    return "\n".join(lines)


def _table_kind(rows: list[list[str]]) -> str:
    head = " ".join(_cell(c) for c in rows[0]).lower()
    if "jul" in head.split() and "jun" in head.split():
        return "monthly"
    if "occupation id" in head:
        return "pro_rata"
    if "minimum points score" in head and "visa subclass" in head:
        return "cutoffs"
    if "act" in head.split() and "nsw" in head.split():
        return "nominations"
    if head.startswith("visa subclass"):
        return "summary"
    return "occupations"


def _occupation_rows(rows: list[list[str]], default_subclass: str) -> list[tuple[str, str, int]]:
    """(occupation, subclass, minimum points) from an occupation table in any of the formats used since
    2020: one column per subclass, offshore/onshore pairs per subclass, an extra "invited for subclass"
    column, or a single unlabelled column."""
    header = [_cell(c) for c in rows[0]]
    data = rows[1:]
    # A second header row (offshore / onshore) has no scores in it.
    if data and not any(_points(c) or _cell(c).lower() in ("n/a", "not invited") for c in data[0][1:]):
        data = data[1:]
    width = max((len(r) for r in data), default=1) - 1
    labels = [_subclass(h) for h in header[1:]]
    named = [s for s in labels if s]
    if len(labels) == width:
        cols = labels
    elif named and width % len(named) == 0:
        cols = [s for s in named for _ in range(width // len(named))]
    else:
        cols = [default_subclass] * width if width == 1 else [None] * width
    out: dict[tuple[str, str], int] = {}
    for r in data:
        name = _cell(r[0])
        if not name or name.lower() == "occupation":
            continue
        for sub, c in zip(cols, r[1:]):
            p = _points(c)
            if sub and p is not None:
                key = (name, sub)
                out[key] = min(p, out.get(key, p))
    return [(name, sub, p) for (name, sub), p in out.items()]


def parse_rounds(markdown: str, source_url: str) -> dict:
    """Rounds, occupation minimums, monthly totals, state nominations and the next round date."""
    rounds: dict[tuple[str, str], dict] = {}
    occupations: dict[tuple[str, str, str], dict] = {}
    monthly: dict[str, dict] = {}
    nominations: list[dict] = []
    meta: dict[str, str] = {}
    current: date | None = None
    summary: dict[str, dict] = {}
    year_heading: str | None = None
    in_nominations = False
    nominations_as_of: str | None = None

    for b in blocks(markdown):
        if b[0] == "h":
            text = b[2]
            m = re.search(r"invitations issued on (\d{1,2} \w+ \d{4})", text, re.I)
            if m:
                current = _date(m.group(1))
                summary = {}
                in_nominations = False
                continue
            if re.search(r"state and territory nominations", text, re.I):
                in_nominations = True
                current = None
            ym = re.search(r"(\d{4})-(\d{2})\s+program year", text, re.I)
            if ym:
                year_heading = f"{ym.group(1)}-{ym.group(2)}"
            continue
        if b[0] == "p":
            text = _space(re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", b[1]))
            nm = re.search(r"next invitation round for the (.+?) will be held on (\d{1,2} \w+ \d{4})", text, re.I)
            if nm and _date(nm.group(2)):
                key = _subclass(nm.group(1)) or "all"
                meta[f"next_round_{key}"] = _date(nm.group(2)).isoformat()
                meta[f"next_round_{key}_text"] = text[:400]
            am = re.search(r"from (\d{1,2} \w+ \d{4}) to (\d{1,2} \w+ \d{4})", text)
            if in_nominations and am:
                nominations_as_of = f"{am.group(1)} to {am.group(2)}"
            continue

        rows = b[1]
        kind = _table_kind(rows)
        if kind == "nominations" and in_nominations and year_heading:
            states = [STATES.get(_cell(c).lower()) for c in rows[0][1:]]
            for r in rows[1:]:
                sub = _subclass(_cell(r[0]))
                if not sub:
                    continue
                for st, c in zip(states, r[1:]):
                    if st:
                        nominations.append({"program_year": year_heading, "as_of": nominations_as_of,
                                            "subclass": sub, "state": st, "nominations": _cell(c) or None})
        elif kind == "monthly" and year_heading:
            if year_heading in monthly:  # the newest table for each program year comes first
                continue
            months = [_cell(c) for c in rows[0][1:]]
            table = []
            for r in rows[1:]:
                label = _cell(r[0])
                sub = _subclass(label) or ("total" if label.lower() == "total" else None)
                if not sub:
                    continue
                values = {m: _int(c) for m, c in zip(months, r[1:]) if m}
                table.append({"subclass": sub, "label": label, "months": values})
            monthly[year_heading] = {"program_year": year_heading, "from_round": current.isoformat() if current else None,
                                     "source_url": source_url, "rows": table}
        elif current is None:
            continue
        elif kind == "summary":
            head = [_cell(c).lower() for c in rows[0]]
            i_inv = next((i for i, h in enumerate(head) if "invited" in h or h == "number" or "total" in h), 1)
            i_tie = next((i for i, h in enumerate(head) if "tie break" in h or "date of effect" in h), None)
            for r in rows[1:]:
                sub = _subclass(_cell(r[0]))
                if not sub:
                    continue
                tie = _cell(r[i_tie]) if i_tie is not None and i_tie < len(r) else None
                summary[sub] = {
                    "round_date": current.isoformat(), "subclass": sub, "subclass_name": _cell(r[0]),
                    "invited": _int(r[i_inv]) if i_inv < len(r) else None,
                    "tie_break": tie if tie and tie.upper() != "N/A" else None,
                    "min_points": None, "program_year": program_year(current), "source_url": source_url,
                }
                rounds[(current.isoformat(), sub)] = summary[sub]
        elif kind == "cutoffs":
            for r in rows[1:]:
                sub = _subclass(_cell(r[0]))
                if sub and (current.isoformat(), sub) in rounds:
                    row = rounds[(current.isoformat(), sub)]
                    row["min_points"] = _points(r[1]) if len(r) > 1 else None
                    doe = _cell(r[2]) if len(r) > 2 else ""
                    if doe and doe.upper() != "N/A" and not row["tie_break"]:
                        row["tie_break"] = doe
        elif kind == "pro_rata":
            for r in rows[1:]:
                if len(r) < 4:
                    continue
                p = _points(r[3])
                if p is None:
                    continue
                name = f"{_cell(r[2])} (ANZSCO unit group {_cell(r[1])})"
                for sub in re.findall(r"\d{3}", _cell(r[0])):
                    occupations[(current.isoformat(), sub, name)] = {
                        "round_date": current.isoformat(), "subclass": sub, "occupation": name, "min_points": p}
        elif kind == "occupations":
            invited = [s for s, v in summary.items() if v.get("invited")]
            default = invited[0] if len(invited) == 1 else "189"
            for name, sub, p in _occupation_rows(rows, default):
                occupations[(current.isoformat(), sub, name)] = {
                    "round_date": current.isoformat(), "subclass": sub, "occupation": name, "min_points": p}
    # Rounds whose tables list a subclass the summary did not (never seen, but keep the data consistent).
    for (d, sub, _), _row in list(occupations.items()):
        rounds.setdefault((d, sub), {"round_date": d, "subclass": sub, "subclass_name": None, "invited": None,
                                     "tie_break": None, "min_points": None,
                                     "program_year": program_year(date.fromisoformat(d)), "source_url": source_url})
    return {"rounds": rounds, "occupations": occupations, "monthly": monthly, "nominations": nominations, "meta": meta}


async def read_page(api: WorkerAPI, http: httpx.AsyncClient, url: str) -> tuple[str, str, str | None]:
    """(markdown, method, fetched_at): the corpus copy when there is one, else the live page."""
    try:
        doc = await api.call("worker_law_markdown", url=url)
    except RuntimeError as e:
        print(f"  skillselect: corpus read failed for {url}: {e}", file=sys.stderr)
        doc = None
    if doc and (doc.get("markdown") or "").strip():
        return doc["markdown"], "corpus", doc.get("fetched_at")
    r = await http.get(url, headers=BROWSER)
    r.raise_for_status()
    return html_to_markdown(r.text), "live", datetime.now(timezone.utc).isoformat()


async def load_skillselect(api: WorkerAPI, http: httpx.AsyncClient) -> dict:
    current_md, m1, f1 = await read_page(api, http, ROUNDS_URL)
    previous_md, m2, f2 = await read_page(api, http, PREVIOUS_URL)
    cur = parse_rounds(current_md, ROUNDS_URL)
    prev = parse_rounds(previous_md, PREVIOUS_URL)
    if not cur["rounds"] and m1 == "corpus":  # corpus copy unreadable: try the live page once
        r = await http.get(ROUNDS_URL, headers=BROWSER)
        if r.status_code == 200:
            cur, m1 = parse_rounds(html_to_markdown(r.text), ROUNDS_URL), "live"
    merged = {k: {**prev[k], **cur[k]} for k in ("rounds", "occupations", "monthly", "meta")}
    years = {n["program_year"] for n in cur["nominations"]}
    merged["nominations"] = cur["nominations"] + [n for n in prev["nominations"] if n["program_year"] not in years]
    merged["meta"]["rounds_source"] = json.dumps({
        "current": {"url": ROUNDS_URL, "method": m1, "fetched_at": f1},
        "previous": {"url": PREVIOUS_URL, "method": m2, "fetched_at": f2}})
    for year, table in merged["monthly"].items():
        merged["meta"][f"monthly_totals_{year}"] = json.dumps(table)
    merged["source_fetched_at"] = max(x for x in (f1, f2) if x) if (f1 or f2) else None
    return merged


# ───────────────────────────── Import ─────────────────────────────


def _run(source: str) -> str:
    return f"{source}-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


async def _upsert(api: WorkerAPI, kind: str, rows: list[dict], run: str) -> int:
    written = 0
    for i in range(0, len(rows), BATCH):
        written += await api.call("worker_occupations_upsert", kind=kind, rows=rows[i : i + BATCH], run=run) or 0
    return written


async def import_sol(api: WorkerAPI, http: httpx.AsyncClient, dry_run: bool = False) -> dict:
    run = _run("sol")
    try:
        rows = parse_sol(await fetch_sol(http))
        if len(rows) < 300:
            raise RuntimeError(f"only {len(rows)} occupations parsed")
        if dry_run:
            return {"occupations": len(rows), "sample": rows[:2]}
        written = await _upsert(api, "occupations", rows, run)
        result = await api.call("worker_occupations_finish", kind="sol", run=run, counts={"written": written})
    except Exception as e:
        if not dry_run:
            await api.call("worker_occupations_finish", kind="sol", run=run, error=repr(e)[:1500])
        raise
    print(f"  sol: {result}", file=sys.stderr)
    return result


async def import_skillselect(api: WorkerAPI, http: httpx.AsyncClient, dry_run: bool = False) -> dict:
    run = _run("skillselect")
    try:
        data = await load_skillselect(api, http)
        if not data["rounds"]:
            raise RuntimeError("no invitation rounds found on the SkillSelect pages")
        rounds = sorted(data["rounds"].values(), key=lambda r: (r["round_date"], r["subclass"]))
        occs = sorted(data["occupations"].values(), key=lambda r: (r["round_date"], r["subclass"], r["occupation"]))
        meta = [{"key": k, "value": v} for k, v in sorted(data["meta"].items())]
        if dry_run:
            return {"rounds": len(rounds), "round_occupations": len(occs), "meta": [m["key"] for m in meta],
                    "state_nominations": len(data["nominations"]), "latest": rounds[-2:]}
        counts = {
            "rounds_written": await _upsert(api, "rounds", rounds, run),
            "round_occupations_written": await _upsert(api, "round_occupations", occs, run),
            "meta_written": await _upsert(api, "meta", meta, run),
            "state_nominations_written": await _upsert(api, "state_nominations", data["nominations"], run),
            "source_fetched_at": data["source_fetched_at"],
        }
        result = await api.call("worker_occupations_finish", kind="skillselect", run=run, counts=counts)
    except Exception as e:
        if not dry_run:
            await api.call("worker_occupations_finish", kind="skillselect", run=run, error=repr(e)[:1500])
        raise
    print(f"  skillselect: {result}", file=sys.stderr)
    return result


async def refresh_if_stale(api: WorkerAPI, max_age_days: int = 7) -> bool:
    """Imports the occupation list when its last import is older than max_age_days, and the rounds when
    theirs is, or when the crawler has fetched a newer copy of a SkillSelect page since. Returns whether
    anything ran. Failures are logged, not raised, so the crawler keeps going."""
    ran = False
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
        for source, job in (("sol", import_sol), ("skillselect", import_skillselect)):
            try:
                last = await api.call("worker_occupations_last_run", kind=source)
                due = True
                if last and last.get("finished_at"):
                    finished = datetime.fromisoformat(last["finished_at"].replace("Z", "+00:00"))
                    due = (datetime.now(timezone.utc) - finished).days >= max_age_days
                    if not due and source == "skillselect":
                        seen = (last.get("counts") or {}).get("source_fetched_at")
                        newest = []
                        for url in (ROUNDS_URL, PREVIOUS_URL):
                            doc = await api.call("worker_law_markdown", url=url)
                            if doc and doc.get("fetched_at"):
                                newest.append(doc["fetched_at"])
                        due = bool(newest) and (not seen or max(newest) > seen)
                if due:
                    await job(api, http)
                    ran = True
            except Exception as e:  # noqa: BLE001 - the crawler keeps going without this source
                print(f"  {source}: refresh failed: {e!r}", file=sys.stderr)
    return ran


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["sol", "skillselect"])
    ap.add_argument("--if-stale", action="store_true", help="only import what is out of date")
    ap.add_argument("--dry-run", action="store_true", help="parse and print, write nothing")
    args = ap.parse_args()
    api = WorkerAPI()
    try:
        if args.if_stale:
            print("imported" if await refresh_if_stale(api) else "up to date", file=sys.stderr)
            return
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
            for source, job in (("sol", import_sol), ("skillselect", import_skillselect)):
                if args.only in (None, source):
                    result = await job(api, http, dry_run=args.dry_run)
                    if args.dry_run:
                        print(json.dumps(result, indent=1, default=str)[:4000])
    finally:
        await api.close()


if __name__ == "__main__":
    asyncio.run(main())
