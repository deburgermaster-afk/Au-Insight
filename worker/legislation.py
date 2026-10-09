"""Import Commonwealth legislation from the Federal Register of Legislation API.

The website blocks headless browsers, but the public OData API serves the
official Word compilations. Their paragraph styles map cleanly to structure:
ActHead 1 = Chapter/Schedule, 2 = Part, 3 = Division, 4 = Subdivision,
5 = section/regulation/clause.
"""

from __future__ import annotations

import io
from datetime import datetime

import docx
import httpx
from docx.table import Table
from docx.text.paragraph import Paragraph

API = "https://api.prod.legislation.gov.au/v1"
SKIP_STYLES = ("toc ", "Header", "Footer")


async def latest_version(http: httpx.AsyncClient, title_id: str) -> dict:
    r = await http.get(f"{API}/Versions/Find(titleId='{title_id}',asAtSpecification='Latest')")
    r.raise_for_status()
    return r.json()


async def download_volumes(http: httpx.AsyncClient, title_id: str) -> list[bytes]:
    vols: list[bytes] = []
    for n in range(1, 20):
        r = await http.get(
            f"{API}/Documents/Find(titleid='{title_id}',asatspecification='Latest',type='Primary',"
            f"format='Word',uniqueTypeNumber=0,volumeNumber={n},rectificationVersionNumber=0)"
        )
        if r.status_code == 404:
            break
        r.raise_for_status()
        vols.append(r.content)
    return vols


def _cell_text(text: str) -> str:
    return " ".join(text.split()).replace("|", "\\|")


def docx_to_markdown(data: bytes) -> str:
    d = docx.Document(io.BytesIO(data))
    out: list[str] = []
    for block in d.iter_inner_content():
        if isinstance(block, Paragraph):
            style = block.style.name if block.style is not None else ""
            text = block.text.strip()
            if not text or style.startswith(SKIP_STYLES):
                continue
            if style.startswith("ActHead "):
                level = int(style.split()[1]) if style.split()[1].isdigit() else 5
                out.append(f"\n{'#' * min(level, 6)} {' '.join(text.split())}\n")
            elif style in ("SubsectionHead", "TofSectsHeading"):
                out.append(f"**{text}**")
            elif style.startswith("note"):
                out.append(f"> {text}")
            else:
                out.append(text)
        elif isinstance(block, Table):
            rows = [[_cell_text(c.text) for c in row.cells] for row in block.rows]
            rows = [r for r in rows if any(r)]
            if not rows:
                continue
            width = max(len(r) for r in rows)
            rows = [r + [""] * (width - len(r)) for r in rows]
            out.append("")
            out.append("| " + " | ".join(rows[0]) + " |")
            out.append("|" + " --- |" * width)
            out += ["| " + " | ".join(r) + " |" for r in rows[1:]]
            out.append("")
    return "\n".join(out)


async def fetch_title(title_id: str) -> tuple[str, str, datetime, str]:
    """Returns (name, markdown, in_force_from, register_id) for the latest compilation."""
    async with httpx.AsyncClient(timeout=300, follow_redirects=True) as http:
        version = await latest_version(http, title_id)
        volumes = await download_volumes(http, title_id)
    markdown = "\n\n".join(docx_to_markdown(v) for v in volumes)
    return version["name"], markdown, datetime.fromisoformat(version["start"]), version["registerId"]


# Names of in-force principal titles that belong in the corpus.
RELEVANT = ("Migration", "Australian Citizenship", "Citizenship", "Immigration")
COLLECTIONS = {"Act", "LegislativeInstrument", "NotifiableInstrument"}


async def discover_titles() -> list[tuple[str, str]]:
    """Every in-force principal Act/instrument about migration or citizenship: [(title_id, name)]."""
    found: dict[str, str] = {}
    async with httpx.AsyncClient(timeout=120) as http:
        for term in ("Migration", "Citizenship", "Immigration"):
            for skip in range(0, 5000, 500):
                r = await http.get(
                    f"{API}/Titles",
                    params={
                        "$filter": f"contains(name,'{term}')",
                        "$select": "id,name,collection,isPrincipal,isInForce",
                        "$top": "500",
                        "$skip": str(skip),
                    },
                )
                r.raise_for_status()
                page = r.json().get("value", [])
                for t in page:
                    if t.get("isPrincipal") and t.get("isInForce") and t.get("collection") in COLLECTIONS and t["name"].startswith(RELEVANT):
                        found[t["id"]] = t["name"]
                if len(page) < 500:
                    break
    return sorted(found.items())
