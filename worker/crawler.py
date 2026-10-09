"""Immi Insight crawl worker.

Pulls work from the shared queue in Supabase, so it can stop at any time and
pick up where it left off, and several workers can run at once.

    python crawler.py                     # run until the queue is empty or --minutes is up
    python crawler.py --forever           # keep running; idle-poll when the queue is empty
    python crawler.py --source legislation   # re-seed one source only
    python crawler.py --dry-run --url https://immi.homeaffairs.gov.au/visas/...   # inspect one page, no writes

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
     optional EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL (1024-dim vectors)
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import socket
import sys
import time
from collections import defaultdict
from urllib.parse import urldefrag, urlparse

import httpx
from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

from legislation import discover_titles, fetch_title
from sections import normalize, sha256, split_sections
from supa import WorkerAPI

# The browser keeps its own user agent: a custom one that disagrees with its other
# headers gets flagged by bot protection (Akamai on Home Affairs).
CONCURRENCY = int(os.getenv("CRAWL_CONCURRENCY", "4"))
SECTION_BATCH = 80
SKIP_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".zip", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".mp4", ".mp3", ".ics")

# Opens folded content on any site: <details>, Bootstrap collapses, ARIA accordions and tab panels.
GENERIC_EXPAND_JS = """
document.querySelectorAll('details').forEach(d => d.open = true);
document.querySelectorAll('.collapse').forEach(e => e.classList.add('show'));
document.querySelectorAll('[role="tabpanel"][hidden], .accordion [hidden], [data-accordion] [hidden]').forEach(e => e.removeAttribute('hidden'));
document.querySelectorAll('[role="tabpanel"]').forEach(p => {
  const id = p.getAttribute('aria-labelledby');
  const tab = id && document.getElementById(id);
  if (tab && tab.textContent.trim()) { const h = document.createElement('h2'); h.textContent = tab.textContent.trim(); p.prepend(h); }
  p.style.display = 'block';
});
"""


def canonical(url: str) -> str:
    url, _ = urldefrag(url)
    p = urlparse(url)
    return f"{p.scheme}://{p.hostname or ''}{p.path.rstrip('/') or '/'}"


def first_heading(markdown: str) -> str | None:
    for line in markdown.splitlines():
        if line.startswith("#"):
            return line.lstrip("#").strip() or None
    return None


def allowed(url: str, src: dict) -> bool:
    if not url.startswith(src["base_url"]):
        return False
    path = urlparse(url).path
    if path.lower().endswith(SKIP_EXTENSIONS):
        return False
    if any(path.startswith(d) for d in src.get("deny") or []):
        return False
    return any(path.startswith(a) for a in src.get("allow") or ["/"])


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


class Worker:
    def __init__(self, api: WorkerAPI | None, crawler: AsyncWebCrawler, name: str):
        self.api, self.crawler, self.name = api, crawler, name
        self.sources: dict[str, dict] = {}
        self.done = self.changed = self.failed = 0
        self.current = ""
        self.last_hit: dict[str, float] = defaultdict(float)

    # ── discovery ──────────────────────────────────────────────────────
    async def load_sources(self) -> None:
        rows = await self.api.call("worker_sources")
        self.sources = {s["id"]: s for s in rows}

    async def seed(self, only: str | None) -> None:
        for src in self.sources.values():
            if only and src["id"] != only:
                continue
            if src["kind"] == "frl_api":
                titles = {t: t for t in src["seeds"]}
                try:
                    titles.update(dict(await discover_titles()))
                except Exception as e:  # noqa: BLE001 - discovery is best effort; seeds still go in
                    print(f"  title discovery failed: {e!r}", file=sys.stderr)
                urls = [f"{src['base_url']}/{t}/latest/text" for t in titles]
            else:
                urls = [canonical(src["base_url"] + s) for s in src["seeds"]]
            n = await self.api.call("worker_enqueue", source=src["id"], urls=urls, depth=0)
            print(f"  seeded {src['id']}: {len(urls)} start points, {n} new", file=sys.stderr)

    # ── fetching ───────────────────────────────────────────────────────
    async def polite(self, url: str) -> None:
        """At most one request per second per host."""
        host = urlparse(url).hostname or ""
        now = time.monotonic()
        slot = max(now, self.last_hit[host] + 1.0)
        self.last_hit[host] = slot
        if slot > now:
            await asyncio.sleep(slot - now)

    async def fetch_page(self, src: dict, url: str) -> tuple[str, str, list[str]]:
        js = GENERIC_EXPAND_JS + "\n" + (src.get("expand_js") or "")

        async def run(selector: str | None, wait: str = "networkidle", timeout: int = 30_000, delay: float = 0.1):
            cfg = CrawlerRunConfig(
                cache_mode=CacheMode.BYPASS,
                wait_until=wait,
                page_timeout=timeout,
                delay_before_return_html=delay,
                js_code=js,
                css_selector=selector,
                excluded_tags=["script", "style", "nav", "footer", "noscript", "header"],
                check_robots_txt=True,
            )
            r = await self.crawler.arun(url, config=cfg)
            # Sites with constant analytics traffic never go network-idle: load, then give scripts time to render.
            if not r.success and wait == "networkidle" and "Timeout" in (r.error_message or ""):
                return await run(selector, wait="load", timeout=60_000, delay=3.0)
            return r

        await self.polite(url)
        r = await run(src.get("content_selector"))
        md = normalize(r.markdown.raw_markdown if r.success and r.markdown else "")
        if r.success and len(md) < 200 and src.get("content_selector"):
            r = await run(None)  # selector didn't match this page's layout: use the whole page
            md = normalize(r.markdown.raw_markdown if r.success and r.markdown else "")
        if not r.success:
            raise RuntimeError(r.error_message or "fetch failed")
        title = ((r.metadata or {}).get("title") or first_heading(md) or url).split("|")[0].strip()
        links = [canonical(link["href"]) for link in (r.links or {}).get("internal", []) if link.get("href")]
        return title, md, links

    # ── saving ─────────────────────────────────────────────────────────
    async def save(self, queue_id: int, src: dict, url: str, title: str, md: str, doc_type: str, valid_from=None) -> bool:
        res = await self.api.call(
            "worker_begin_page", queue_id=queue_id, source=src["id"], url=url, title=title[:500],
            doc_type=doc_type, hash=sha256(md), markdown=md, valid_from=valid_from.isoformat() if valid_from else None,
        )
        if res["unchanged"]:
            return False
        version_id = res["version_id"]
        if not res.get("has_sections"):
            sections = split_sections(md, title)
            vectors = await embed([" / ".join(s.heading_path) + "\n\n" + s.content for s in sections])
            rows = [
                {"ordinal": s.ordinal, "heading_path": s.heading_path, "anchor": s.anchor, "content": s.content,
                 "content_hash": s.content_hash, "embedding": vectors[i] if vectors else None}
                for i, s in enumerate(sections)
            ]
            for i in range(0, len(rows), SECTION_BATCH):
                await self.api.call("worker_add_sections", version_id=version_id, sections=rows[i : i + SECTION_BATCH])
        await self.api.call("worker_finish_page", queue_id=queue_id, version_id=version_id)
        return True

    # ── one queue item ─────────────────────────────────────────────────
    async def process(self, item: dict) -> None:
        src = self.sources.get(item["source_id"])
        url = item["url"]
        self.current = url
        if not src:
            return
        try:
            if src["kind"] == "frl_api":
                title_id = urlparse(url).path.strip("/").split("/")[0]
                name, markdown, in_force_from, _ = await fetch_title(title_id)
                changed = await self.save(item["id"], src, url, name, normalize(markdown), "legislation", in_force_from)
            else:
                title, md, links = await self.fetch_page(src, url)
                if len(md) < 200:
                    await self.api.call("worker_fail", queue_id=item["id"], error="no readable content", skip=True)
                    return
                changed = await self.save(item["id"], src, url, title, md, "page")
                if item["depth"] < src["max_depth"]:
                    nxt = sorted({link for link in links if allowed(link, src)})
                    if nxt:
                        await self.api.call("worker_enqueue", source=src["id"], urls=nxt, depth=item["depth"] + 1)
            self.done += 1
            if changed:
                self.changed += 1
                print(f"  changed  {url}", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - one bad page must never stop the worker
            self.failed += 1
            msg = str(e)
            skip = "robots" in msg.lower() or "disallowed" in msg.lower()
            print(f"  failed   {url}: {msg[:160]}", file=sys.stderr)
            try:
                await self.api.call("worker_fail", queue_id=item["id"], error=msg, skip=skip)
            except Exception:  # noqa: BLE001
                pass

    async def heartbeat(self) -> None:
        try:
            await self.api.call("worker_heartbeat", worker=self.name, current_url=self.current,
                                done=self.done, changed=self.changed, failed=self.failed)
        except Exception:  # noqa: BLE001
            pass

    async def run(self, deadline: float, forever: bool) -> None:
        idle = 0
        while time.monotonic() < deadline:
            batch = await self.api.call("worker_claim", worker=self.name, limit=CONCURRENCY) or []
            if not batch:
                await self.heartbeat()
                if not forever:
                    break
                idle = min(idle + 1, 10)
                await asyncio.sleep(30 * idle)
                continue
            idle = 0
            await asyncio.gather(*(self.process(item) for item in batch))
            await self.heartbeat()
            print(f"[{self.done} done · {self.changed} changed · {self.failed} failed]", file=sys.stderr)


async def dry_run(url: str) -> None:
    host = f"{urlparse(url).scheme}://{urlparse(url).hostname}"
    src = {"id": "dry", "base_url": host, "allow": ["/"], "expand_js": None,
           "content_selector": "#contentBox" if "homeaffairs" in url else "main"}
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        title, md, links = await Worker(None, crawler, "dry").fetch_page(src, url)
    sections = split_sections(md, title)
    print(json.dumps({"title": title, "chars": len(md), "sections": len(sections), "links": len(links)}, indent=2))
    for s in sections[:60]:
        print("  " + " › ".join(s.heading_path))


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="only seed this source id (the queue is shared, so all due work is processed)")
    ap.add_argument("--minutes", type=float, default=330, help="stop after this long (GitHub Actions jobs max out at 6h)")
    ap.add_argument("--forever", action="store_true")
    ap.add_argument("--no-seed", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--url")
    args = ap.parse_args()

    if args.dry_run:
        await dry_run(args.url)
        return

    api = WorkerAPI()
    name = os.getenv("WORKER_NAME") or f"{socket.gethostname()}-{os.getpid()}"
    deadline = time.monotonic() + (10**9 if args.forever else args.minutes * 60)
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        w = Worker(api, crawler, name)
        await w.load_sources()
        if not args.no_seed:
            await w.seed(args.source)
        await w.run(deadline, args.forever)
        w.current = ""
        await w.heartbeat()
    await api.close()
    print(f"Done: {w.done} pages, {w.changed} new or changed, {w.failed} failed", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
