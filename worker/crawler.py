"""Crawl immigration sources into Supabase, keeping a version history.

Usage:
    python crawler.py                      # all sources
    python crawler.py --source homeaffairs --max-pages 20
    python crawler.py --url https://immi.homeaffairs.gov.au/visas/...  # one page

Env:
    DATABASE_URL         Postgres connection string (Supabase → Connect → Session pooler)
    EMBEDDING_BASE_URL   optional, OpenAI-compatible base URL (e.g. https://api.mistral.ai/v1)
    EMBEDDING_API_KEY    optional
    EMBEDDING_MODEL      optional; must output 1024-dimension vectors
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from collections import deque
from datetime import datetime
from pathlib import Path
from urllib.parse import urldefrag, urlparse

import httpx
import psycopg
import yaml
from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

from legislation import fetch_title
from sections import normalize, sha256, split_sections

USER_AGENT = "ImmiInsightBot/0.1 (+https://github.com/deburgermaster-afk/immi-insight)"
CONCURRENCY = 3
POLITE_DELAY_S = 1.0


def load_sources() -> list[dict]:
    return yaml.safe_load((Path(__file__).parent / "sources.yaml").read_text())["sources"]


def canonical(url: str) -> str:
    url, _ = urldefrag(url)
    p = urlparse(url)
    host = p.hostname or ""
    return f"{p.scheme}://{host}{p.path.rstrip('/') or '/'}"


def first_heading(markdown: str) -> str | None:
    for line in markdown.splitlines():
        if line.startswith("#"):
            return line.lstrip("#").strip() or None
    return None


def allowed(url: str, src: dict) -> bool:
    if not url.startswith(src["host"]):
        return False
    path = urlparse(url).path
    if any(path.startswith(d) for d in src.get("deny", [])):
        return False
    if path.lower().endswith((".pdf", ".docx", ".xlsx", ".jpg", ".png")):
        return False
    return any(path.startswith(a) for a in src.get("allow", []))


async def embed(texts: list[str]) -> list[list[float]] | None:
    base, model = os.getenv("EMBEDDING_BASE_URL"), os.getenv("EMBEDDING_MODEL")
    if not (base and model):
        return None
    async with httpx.AsyncClient(timeout=120) as http:
        out: list[list[float]] = []
        for i in range(0, len(texts), 64):
            r = await http.post(
                f"{base.rstrip('/')}/embeddings",
                headers={"Authorization": f"Bearer {os.getenv('EMBEDDING_API_KEY', '')}"},
                json={"model": model, "input": [t[:8000] for t in texts[i : i + 64]], "dimensions": 1024},
            )
            r.raise_for_status()
            out += [d["embedding"] for d in sorted(r.json()["data"], key=lambda d: d["index"])]
        return out


class Store:
    """Writes pages as versioned documents. Unchanged pages only bump last_seen_at."""

    def __init__(self, conn: psycopg.AsyncConnection | None):
        self.conn = conn

    async def start_run(self) -> int | None:
        if not self.conn:
            return None
        cur = await self.conn.execute("insert into crawl_runs default values returning id")
        (run_id,) = await cur.fetchone()
        await self.conn.commit()
        return run_id

    async def finish_run(self, run_id: int | None, seen: int, changed: int, errors: list[dict]) -> None:
        if not self.conn or run_id is None:
            return
        await self.conn.execute(
            "update crawl_runs set finished_at = now(), pages_seen = %s, pages_changed = %s, errors = %s where id = %s",
            (seen, changed, json.dumps(errors), run_id),
        )
        await self.conn.commit()

    async def save(
        self, source_id: str, doc_type: str, url: str, title: str, markdown: str, valid_from: datetime | None = None
    ) -> bool:
        """Returns True when the page is new or changed."""
        sections = split_sections(markdown, title)
        if not self.conn:
            print(json.dumps({"url": url, "title": title, "sections": len(sections)}))
            return True

        content_hash = sha256(markdown)
        async with self.conn.transaction():
            cur = await self.conn.execute(
                """insert into law_documents (source_id, url, title, doc_type) values (%s, %s, %s, %s)
                   on conflict (url) do update set title = excluded.title, last_seen_at = now()
                   returning id, current_version_id""",
                (source_id, url, title, doc_type),
            )
            doc_id, old_version_id = await cur.fetchone()

            old_hashes: set[str] = set()
            if old_version_id:
                cur = await self.conn.execute(
                    "select v.content_hash, array_agg(s.content_hash) from law_document_versions v "
                    "left join law_sections s on s.version_id = v.id where v.id = %s group by v.content_hash",
                    (old_version_id,),
                )
                row = await cur.fetchone()
                if row and row[0] == content_hash:
                    return False
                old_hashes = set(filter(None, row[1] if row else []))
                await self.conn.execute("update law_document_versions set valid_to = now() where id = %s", (old_version_id,))

            cur = await self.conn.execute(
                """insert into law_document_versions (document_id, content_hash, markdown, valid_from)
                   values (%s, %s, %s, coalesce(%s, now()))
                   on conflict (document_id, content_hash) do update set valid_to = null, valid_from = excluded.valid_from
                   returning id""",
                (doc_id, content_hash, markdown, valid_from),
            )
            (version_id,) = await cur.fetchone()
            await self.conn.execute("delete from law_sections where version_id = %s", (version_id,))
            await self.conn.execute("update law_documents set current_version_id = %s where id = %s", (version_id, doc_id))

            vectors = await embed([" / ".join(s.heading_path) + "\n\n" + s.content for s in sections])
            async with self.conn.cursor() as c:
                await c.executemany(
                    """insert into law_sections (version_id, ordinal, heading_path, anchor, content, content_hash, embedding)
                       values (%s, %s, %s, %s, %s, %s, %s::extensions.vector)""",
                    [
                        (version_id, s.ordinal, s.heading_path, s.anchor, s.content, s.content_hash,
                         json.dumps(vectors[i]) if vectors else None)
                        for i, s in enumerate(sections)
                    ],
                )

            changed = [" / ".join(s.heading_path) for s in sections if s.content_hash not in old_hashes]
            await self.conn.execute(
                "insert into law_changes (document_id, old_version_id, new_version_id, changed_sections) values (%s, %s, %s, %s)",
                (doc_id, old_version_id, version_id, changed),
            )
        return True


async def crawl_source(crawler: AsyncWebCrawler, src: dict, store: Store, max_pages: int, only_url: str | None) -> tuple[int, int, list[dict]]:
    run_cfg = CrawlerRunConfig(
        cache_mode=CacheMode.BYPASS,
        wait_until="networkidle",
        page_timeout=90_000,
        js_code=src.get("expand_js") or None,
        css_selector=src.get("content_selector") or None,
        excluded_tags=["script", "style", "nav", "footer", "noscript"],
        check_robots_txt=True,
        user_agent=USER_AGENT,
    )
    queue = deque([only_url] if only_url else [canonical(src["host"] + s) for s in src["seeds"]])
    seen: set[str] = set(queue)
    pages = changed = 0
    errors: list[dict] = []

    async def visit(url: str) -> list[str]:
        nonlocal pages, changed
        r = await crawler.arun(url, config=run_cfg)
        if not r.success:
            errors.append({"url": url, "error": r.error_message})
            return []
        md = normalize(r.markdown.raw_markdown if r.markdown else "")
        if len(md) < 200:
            errors.append({"url": url, "error": "empty content"})
            return []
        title = ((r.metadata or {}).get("title") or first_heading(md) or url).split("|")[0].strip()
        pages += 1
        if await store.save(src["id"], src.get("doc_type", "page"), url, title, md):
            changed += 1
            print(f"  changed  {url}", file=sys.stderr)
        links = [canonical(link["href"]) for link in (r.links or {}).get("internal", []) if link.get("href")]
        return [link for link in links if allowed(link, src)]

    while queue and pages < max_pages:
        batch = [queue.popleft() for _ in range(min(CONCURRENCY, len(queue)))]
        results = await asyncio.gather(*(visit(u) for u in batch), return_exceptions=True)
        for url, res in zip(batch, results):
            if isinstance(res, Exception):
                errors.append({"url": url, "error": repr(res)})
                continue
            if only_url:
                continue
            for link in res:
                if link not in seen:
                    seen.add(link)
                    queue.append(link)
        await asyncio.sleep(POLITE_DELAY_S)
    return pages, changed, errors


async def import_legislation(src: dict, store: Store) -> tuple[int, int, list[dict]]:
    pages = changed = 0
    errors: list[dict] = []
    for title_id in src["titles"]:
        try:
            name, markdown, in_force_from, register_id = await fetch_title(title_id)
        except Exception as e:  # noqa: BLE001 - record and continue with the next title
            errors.append({"url": title_id, "error": repr(e)})
            continue
        pages += 1
        url = f"{src['host']}/{title_id}/latest/text"
        md = normalize(markdown)
        if await store.save(src["id"], "legislation", url, name, md, valid_from=in_force_from):
            changed += 1
            print(f"  changed  {name} ({register_id}, in force from {in_force_from:%Y-%m-%d})", file=sys.stderr)
    return pages, changed, errors


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source")
    ap.add_argument("--url")
    ap.add_argument("--max-pages", type=int)
    ap.add_argument("--dry-run", action="store_true", help="print sections instead of writing to the database")
    args = ap.parse_args()

    sources = [s for s in load_sources() if not args.source or s["id"] == args.source]
    if args.url:
        sources = [s for s in load_sources() if args.url.startswith(s["host"]) and s.get("kind") != "frl_api"][:1]

    dsn = os.getenv("DATABASE_URL")
    conn = None if args.dry_run or not dsn else await psycopg.AsyncConnection.connect(dsn)
    store = Store(conn)
    run_id = await store.start_run()
    total_seen = total_changed = 0
    all_errors: list[dict] = []

    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False, user_agent=USER_AGENT)) as crawler:
        for src in sources:
            print(f"Crawling {src['id']}", file=sys.stderr)
            if src.get("kind") == "frl_api":
                seen, changed, errors = await import_legislation(src, store)
            else:
                seen, changed, errors = await crawl_source(
                    crawler, src, store, args.max_pages or src.get("max_pages", 500), args.url
                )
            total_seen, total_changed = total_seen + seen, total_changed + changed
            all_errors += errors

    await store.finish_run(run_id, total_seen, total_changed, all_errors)
    print(f"Done: {total_seen} pages, {total_changed} new or changed, {len(all_errors)} errors", file=sys.stderr)
    for e in all_errors[:20]:
        print(f"  error {e['url']}: {e['error']}", file=sys.stderr)
    if conn:
        await conn.close()


if __name__ == "__main__":
    asyncio.run(main())
