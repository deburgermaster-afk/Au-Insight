"""Immi Insight crawl worker.

Pulls work from the shared queue in Supabase, so it can stop at any time and
pick up where it left off, and several workers can run at once.

    python crawler.py                     # run until the queue is empty or --minutes is up
    python crawler.py --forever           # keep running; idle-poll when the queue is empty
    python crawler.py --source legislation   # re-seed one source only
    python crawler.py --dry-run --url https://immi.homeaffairs.gov.au/visas/...   # inspect one page, no writes
    python crawler.py --dry-run --sitemap unimelb   # list the pages a sitemap source would pick, no writes

Source kinds: crawl (follow links from seed paths), frl_api (Federal Register titles),
sitemap (pick pages from the site's sitemaps by path regex; no link following).

Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, WORKER_TOKEN
     optional EMBEDDING_BASE_URL / EMBEDDING_API_KEY / EMBEDDING_MODEL (1024-dim vectors)
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import html
import io
import json
import os
import re
import socket
import sys
import time
import xml.etree.ElementTree as ET
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from typing import Awaitable, Callable
from urllib import robotparser
from urllib.parse import urldefrag, urljoin, urlparse

import httpx
from crawl4ai import AsyncWebCrawler, BrowserConfig, CacheMode, CrawlerRunConfig

from legislation import discover_titles, fetch_title
from sections import PARSER_VERSION, content_hash, normalize, split_sections, title_for
from supa import WorkerAPI

try:  # CRICOS register import (worker/cricos.py); the crawler runs without it
    import cricos
except ImportError:  # pragma: no cover
    cricos = None
try:  # skilled occupation list and SkillSelect rounds (worker/occupations.py); optional too
    import occupations
except ImportError:  # pragma: no cover
    occupations = None
try:  # Home Affairs visa and citizenship processing times (worker/processing_times.py)
    import processing_times
except ImportError:  # pragma: no cover
    processing_times = None

# The browser keeps its own user agent: a custom one that disagrees with its other
# headers gets flagged by bot protection (Akamai on Home Affairs).
CONCURRENCY = int(os.getenv("CRAWL_CONCURRENCY", "4"))
SECTION_BATCH = 80
SKIP_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".zip", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".mp4", ".mp3", ".ics")

# Plain HTTP (robots.txt, sitemaps) says who it is; robots.txt groups are matched on ROBOTS_AGENT, else "*".
ROBOTS_AGENT = "ImmiInsightBot"
HTTP_HEADERS = {"User-Agent": f"Mozilla/5.0 (compatible; {ROBOTS_AGENT}/1.0; +https://au-insight.vercel.app)"}
ROBOTS_TTL = 12 * 3600
SITEMAP_MAX_URLS = 20_000  # matching page URLs kept per source, across all its sitemaps
SITEMAP_MAX_FILES = 20  # sitemap files fetched per source (indexes and nested sitemaps)
SITEMAP_MAX_BYTES = 60_000_000  # a sitemap may hold 50k URLs / 50 MB uncompressed
BOT_WALL = (401, 403, 429, 503)  # how bot protection (Cloudflare, Akamai) turns away plain HTTP clients
DAY = 24 * 3600

# Nested sitemaps that rarely hold policy pages are read last; ones named like a topic first.
SITEMAP_NOISE = re.compile(r"news|event|stor(y|ies)|blog|media|image|video|people|staff|profile|expert|author|tag|categor|archive|alumni", re.I)
SITEMAP_USEFUL = re.compile(r"page|study|stud|polic|research|international|course|fee|scholar|admission|current", re.I)

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


def site_domain(base_url: str) -> str:
    """unimelb.edu.au for https://www.unimelb.edu.au: a sitemap source covers the site and its subdomains."""
    host = urlparse(base_url).hostname or ""
    return host[4:] if host.startswith("www.") else host


def on_site(url: str, base_url: str) -> bool:
    host, domain = urlparse(url).hostname or "", site_domain(base_url)
    return bool(domain) and (host == domain or host.endswith("." + domain))


@lru_cache(maxsize=512)
def path_regexes(patterns: tuple[str, ...]) -> tuple[re.Pattern, ...]:
    out = []
    for p in patterns:
        try:
            out.append(re.compile(p, re.I))
        except re.error as e:
            print(f"  bad path regex {p!r}: {e}", file=sys.stderr)
    return tuple(out)


def allowed(url: str, src: dict) -> bool:
    """Crawl sources: allow/deny are path prefixes under base_url. Sitemap sources: case-insensitive
    path regexes, on the site's domain or any subdomain."""
    path = urlparse(url).path
    if path.lower().endswith(SKIP_EXTENSIONS):
        return False
    if src.get("kind") == "sitemap":
        if not on_site(url, src["base_url"]):
            return False
        if any(r.search(path) for r in path_regexes(tuple(src.get("deny") or []))):
            return False
        return any(r.search(path) for r in path_regexes(tuple(src.get("allow") or [])))
    if not url.startswith(src["base_url"]):
        return False
    if any(path.startswith(d) for d in src.get("deny") or []):
        return False
    return any(path.startswith(a) for a in src.get("allow") or ["/"])


def pick_pages(urls: list[str], src: dict, limit: int) -> list[str]:
    """Spends a sitemap source's page budget evenly across its allow patterns (one per topic), so
    a site with thousands of scholarship pages still gets its credit and study-load pages. Within a
    topic, shorter and more general paths (and international-student pages) come first."""

    def rank(url: str) -> tuple[int, int, int]:
        path = urlparse(url).path.lower()
        general = 0 if re.search(r"international|polic|procedure|rules|guideline", path) else 1
        return (path.count("/"), general, len(path))

    buckets = []
    for rx in path_regexes(tuple(src.get("allow") or [])):
        buckets.append(sorted({u for u in urls if rx.search(urlparse(u).path)}, key=rank))
    out: list[str] = []
    seen: set[str] = set()
    cursors = [0] * len(buckets)
    while len(out) < limit and any(c < len(b) for c, b in zip(cursors, buckets)):
        for i, bucket in enumerate(buckets):
            while cursors[i] < len(bucket) and bucket[cursors[i]] in seen:
                cursors[i] += 1
            if cursors[i] < len(bucket) and len(out) < limit:
                seen.add(bucket[cursors[i]])
                out.append(bucket[cursors[i]])
    return out


def _rule_matchers(rp: robotparser.RobotFileParser) -> None:
    """Gives every rule a matcher with RFC 9309 semantics (* and $ wildcards; the match length, so the
    longest rule wins where the stdlib ranks rules). crawl4ai monkeypatches RuleLine.applies_to to
    return a bool, which on newer stdlib versions lets "Allow: /" beat every wildcard Disallow."""
    for entry in rp.entries + ([rp.default_entry] if rp.default_entry else []):
        for line in entry.rulelines:
            path, full = line.path.replace("%2A", "*"), bool(getattr(line, "fullmatch", False))
            if path.endswith(("$", "%24")):
                path, full = path.removesuffix("$").removesuffix("%24"), True
            rx = re.compile(re.escape(path).replace(r"\*", ".*") + ("$" if full else ""), re.DOTALL)
            line.applies_to = lambda filename, rx=rx: (m.end() + 1) if (m := rx.match(filename)) else 0


class Robots:
    """robots.txt rules per origin, read with urllib.robotparser and cached. A missing (4xx) or
    unreadable robots.txt means no rules, as the browser crawler (crawl4ai) has always treated it;
    an explicit Disallow is always respected."""

    def __init__(self, fetch: Callable[[str], Awaitable[str]]):
        self.fetch = fetch  # robots.txt URL -> its text ("" when there is none)
        self.cache: dict[str, tuple[float, robotparser.RobotFileParser]] = {}
        self.locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)

    async def rules(self, url: str) -> robotparser.RobotFileParser:
        p = urlparse(url)
        origin = f"{p.scheme}://{p.netloc}"
        async with self.locks[origin]:
            hit = self.cache.get(origin)
            if hit and time.monotonic() - hit[0] < ROBOTS_TTL:
                return hit[1]
            rp = robotparser.RobotFileParser(origin + "/robots.txt")
            rp.parse((await self.fetch(origin + "/robots.txt")).splitlines())  # also marks it read
            _rule_matchers(rp)
            self.cache[origin] = (time.monotonic(), rp)
            return rp

    async def allowed(self, url: str) -> bool:
        return (await self.rules(url)).can_fetch(ROBOTS_AGENT, url)

    async def sitemaps(self, url: str) -> list[str]:
        return list((await self.rules(url)).site_maps() or [])


def parse_sitemap(data: bytes) -> tuple[bool, list[str]]:
    """(is_index, locs). Handles gzip, XML sitemaps and sitemap indexes, plain-text URL lists, and
    a sitemap the browser returned wrapped in HTML."""
    if data[:2] == b"\x1f\x8b":
        with gzip.GzipFile(fileobj=io.BytesIO(data)) as gz:
            data = gz.read(SITEMAP_MAX_BYTES)
    data = data.lstrip().removeprefix(b"\xef\xbb\xbf").lstrip()
    if not data.startswith(b"<"):
        lines = data.decode("utf-8", "replace").splitlines()
        return False, [s.strip() for s in lines if s.strip().startswith(("http://", "https://"))]
    try:
        root = ET.fromstring(data)  # the stdlib parser never fetches external entities
        if root.tag.rsplit("}", 1)[-1].lower() in ("urlset", "sitemapindex"):
            locs = [el.text.strip() for el in root.iter() if el.tag.rsplit("}", 1)[-1].lower() == "loc" and el.text and el.text.strip()]
            return root.tag.rsplit("}", 1)[-1].lower() == "sitemapindex", locs
    except ET.ParseError:
        pass
    # Not a plain sitemap: the browser's rendering of one (XML tags, or a text list inside <pre>).
    text = html.unescape(data.decode("utf-8", "replace"))
    locs = re.findall(r"<loc>\s*(?:<!\[CDATA\[)?\s*([^<\s\]]+)", text, re.I)
    if locs:
        return "<sitemapindex" in text.lower(), locs
    pre = re.search(r"<pre[^>]*>(.*?)</pre>", text, re.S | re.I)
    if not pre:
        raise ValueError("not a sitemap")
    return False, [s.strip() for s in pre.group(1).splitlines() if s.strip().startswith(("http://", "https://"))]


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
    def __init__(self, api: WorkerAPI | None, crawler: AsyncWebCrawler | None, name: str):
        self.api, self.crawler, self.name = api, crawler, name
        self.sources: dict[str, dict] = {}
        self.done = self.changed = self.failed = 0
        self.current = ""
        self.last_hit: dict[str, float] = defaultdict(float)
        self.http = httpx.AsyncClient(timeout=httpx.Timeout(60, connect=20), follow_redirects=True, headers=HTTP_HEADERS)
        self.robots = Robots(self.robots_txt)

    async def close(self) -> None:
        await self.http.aclose()

    # ── discovery ──────────────────────────────────────────────────────
    async def load_sources(self) -> None:
        rows = await self.api.call("worker_sources")
        self.sources = {s["id"]: s for s in rows}

    async def seed(self, only: str | None) -> None:
        sitemap_jobs = []
        for src in self.sources.values():
            if only and src["id"] != only:
                continue
            if src["kind"] == "sitemap":
                sitemap_jobs.append(self.seed_sitemap(src, force=bool(only)))
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
        # Each sitemap source is a different site, so they are read side by side (still 1 req/s per host).
        gate = asyncio.Semaphore(8)

        async def gated(job):
            async with gate:
                await job

        await asyncio.gather(*(gated(j) for j in sitemap_jobs))

    async def seed_sitemap(self, src: dict, force: bool = False) -> None:
        """Reads the site's sitemaps and queues the pages whose path matches the source's allow
        regexes. Runs only when the source is due (every recrawl_hours), since every queued page
        is a seed that becomes due again when re-seeded."""
        seeded_at = src.get("seeded_at")
        if not force and seeded_at:
            last = datetime.fromisoformat(seeded_at.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - last < timedelta(hours=src["recrawl_hours"]):
                return
        try:
            urls = await self.sitemap_pages(src)
            if not urls:
                print(f"  seeded {src['id']}: no matching pages in its sitemaps", file=sys.stderr)
                return
            n = await self.api.call("worker_enqueue", source=src["id"], urls=urls, depth=0)
            await self.api.call("worker_source_seeded", source=src["id"])
            print(f"  seeded {src['id']}: {len(urls)} pages from sitemaps, {n} new", file=sys.stderr)
        except Exception as e:  # noqa: BLE001 - one unreachable site must not stop the others
            print(f"  seeding {src['id']} failed: {e!r}"[:300], file=sys.stderr)

    async def sitemap_pages(self, src: dict) -> list[str]:
        """Page URLs for a sitemap source: seeds are sitemap URLs (absolute, or paths under base_url);
        with none, the site's robots.txt Sitemap: lines, else /sitemap.xml. Follows sitemap indexes
        (at most SITEMAP_MAX_FILES files; topic-named ones first, news and people last), keeps up to
        SITEMAP_MAX_URLS pages that pass allowed() and robots.txt, and returns the best max_pages."""
        base = src["base_url"].rstrip("/")
        roots = [urljoin(base + "/", s) for s in src["seeds"]] or await self.robots.sitemaps(base) or [base + "/sitemap.xml"]
        todo, fetched, total = list(dict.fromkeys(roots)), set(), 0
        keep: set[str] = set()
        while todo and len(fetched) < SITEMAP_MAX_FILES and len(keep) < SITEMAP_MAX_URLS:
            sm = todo.pop(0)
            if sm in fetched:
                continue
            fetched.add(sm)
            try:
                is_index, locs = parse_sitemap(await self.get_bytes(sm))
            except (httpx.HTTPError, RuntimeError, ValueError, OSError, EOFError) as e:
                print(f"  sitemap {sm}: {e!r}"[:200], file=sys.stderr)
                continue
            if is_index:
                todo += [u for u in locs if u not in fetched]
                todo.sort(key=lambda u: (u not in roots, bool(SITEMAP_NOISE.search(u)), not SITEMAP_USEFUL.search(u)))
                continue
            total += len(locs)
            for u in locs:
                c = canonical(u)
                if c.startswith(("http://", "https://")) and allowed(c, src):
                    keep.add(c)
        out: list[str] = []
        for u in pick_pages(sorted(keep), src, len(keep)):
            if len(out) >= src["max_pages"]:
                break
            if await self.robots.allowed(u):
                out.append(u)
        print(f"  {src['id']}: {len(fetched)} sitemaps, {total} URLs, {len(keep)} match", file=sys.stderr)
        return out

    async def browser_get(self, url: str) -> str | None:
        """The page's HTML as a real browser gets it (bot walls usually let a browser through)."""
        if self.crawler is None:
            return None
        cfg = CrawlerRunConfig(cache_mode=CacheMode.BYPASS, wait_until="load", page_timeout=60_000, delay_before_return_html=1.0)
        await self.polite(url)
        try:
            res = await self.crawler.arun(url, config=cfg)
        except Exception as e:  # noqa: BLE001
            print(f"  browser fetch {url}: {e!r}"[:200], file=sys.stderr)
            return None
        return res.html if res.success and res.html else None

    async def get_bytes(self, url: str) -> bytes:
        """GET over plain HTTP; falls back to the browser when a bot wall turns the request away."""
        await self.polite(url)
        try:
            r = await self.http.get(url)
            if r.status_code == 200:
                return r.content
            if r.status_code not in BOT_WALL:
                r.raise_for_status()
        except httpx.TransportError:
            pass
        page = await self.browser_get(url)
        if page is None:
            raise RuntimeError(f"blocked or unreachable: {url}")
        return page.encode()

    async def robots_txt(self, url: str) -> str:
        """robots.txt text, or "" for no rules (a 4xx, or nothing readable)."""
        await self.polite(url)
        try:
            r = await self.http.get(url)
            if r.status_code == 200:
                return "" if "html" in r.headers.get("content-type", "") else r.text
            if r.status_code not in BOT_WALL:
                return ""
        except httpx.HTTPError as e:
            print(f"  robots.txt {url}: {e!r}"[:200], file=sys.stderr)
        page = await self.browser_get(url)  # the browser shows plain text inside <pre>
        m = re.search(r"<pre[^>]*>(.*?)</pre>", page or "", re.S | re.I)
        return html.unescape(re.sub(r"<[^>]+>", "", m.group(1))) if m else ""

    # ── fetching ───────────────────────────────────────────────────────
    async def polite(self, url: str) -> None:
        """At most one request per second per host, or slower when its robots.txt sets a Crawl-delay."""
        p = urlparse(url)
        host, gap = p.hostname or "", 1.0
        hit = self.robots.cache.get(f"{p.scheme}://{p.netloc}")
        if hit:
            try:
                gap = min(max(gap, float(hit[1].crawl_delay(ROBOTS_AGENT) or 0)), 30.0)
            except (TypeError, ValueError):
                pass
        now = time.monotonic()
        slot = max(now, self.last_hit[host] + gap)
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
        title = title_for(md, url, (r.metadata or {}).get("title"))
        links = [canonical(link["href"]) for link in (r.links or {}).get("internal", []) if link.get("href")]
        return title, md, links

    # ── saving ─────────────────────────────────────────────────────────
    async def save(self, queue_id: int | None, src: dict, url: str, title: str, md: str, doc_type: str, valid_from=None) -> bool:
        res = await self.api.call(
            "worker_begin_page", queue_id=queue_id, source=src["id"], url=url, title=title[:500],
            doc_type=doc_type, hash=content_hash(md), markdown=md, valid_from=valid_from.isoformat() if valid_from else None,
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
                if not await self.robots.allowed(url):
                    await self.api.call("worker_fail", queue_id=item["id"], error="disallowed by robots.txt", skip=True)
                    return
                title, md, links = await self.fetch_page(src, url)
                if len(md) < 200:
                    await self.api.call("worker_fail", queue_id=item["id"], error="no readable content", skip=True)
                    return
                changed = await self.save(item["id"], src, url, title, md, "page")
                # Sitemap sources never follow links: their pages were chosen from the sitemaps.
                if src["kind"] == "crawl" and item["depth"] < src["max_depth"]:
                    nxt = [link for link in sorted({link for link in links if allowed(link, src)}) if await self.robots.allowed(link)]
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

    async def reparse(self) -> int:
        """Re-split stored pages that an older parser produced. No network fetch, no law-change entries."""
        total = 0
        while True:
            batch = await self.api.call("worker_reparse_batch", parser=PARSER_VERSION, limit=20) or []
            if not batch:
                return total
            for d in batch:
                src = self.sources.get(d["source_id"]) or {"id": d["source_id"]}
                self.current = d["url"]
                title = d["title"] if len(d["title"]) <= 150 and d["doc_type"] == "legislation" else title_for(d["markdown"], d["url"])
                valid_from = datetime.fromisoformat(d["valid_from"]) if d["doc_type"] == "legislation" else None
                await self.save(None, src, d["url"], title, d["markdown"], d["doc_type"], valid_from)
                total += 1
            await self.heartbeat()
            print(f"  re-parsed {total}", file=sys.stderr)

    async def heartbeat(self) -> None:
        try:
            await self.api.call("worker_heartbeat", worker=self.name, current_url=self.current,
                                done=self.done, changed=self.changed, failed=self.failed)
        except Exception:  # noqa: BLE001
            pass

    async def refresh_data(self) -> None:
        """Imports the CRICOS register, the occupation list and SkillSelect rounds, and the visa processing
        times when their last import is stale (each module decides). Cheap when nothing is due."""
        for name, module in (("cricos", cricos), ("occupations", occupations), ("processing_times", processing_times)):
            if module is None:
                continue
            try:
                await module.refresh_if_stale(self.api)
            except Exception as e:  # noqa: BLE001 - a data import must never stop the crawl
                print(f"  {name} refresh failed: {e!r}", file=sys.stderr)

    async def daily(self, reseed: bool) -> None:
        """Once a day in --forever mode: pick up new sources, re-seed (sitemap sources only when due)
        and refresh the data imports that are stale."""
        if reseed:
            try:
                await self.load_sources()
                await self.seed(None)
            except Exception as e:  # noqa: BLE001
                print(f"  daily re-seed failed: {e!r}", file=sys.stderr)
        await self.refresh_data()

    async def run(self, deadline: float, forever: bool) -> None:
        idle = 0
        next_daily, reseed = time.monotonic(), False  # main() has just seeded; data imports are checked now
        if not forever:
            await self.refresh_data()  # scheduled runs (GitHub Actions) check the data imports once each
        while time.monotonic() < deadline:
            if forever and time.monotonic() >= next_daily:
                await self.daily(reseed)
                next_daily, reseed = time.monotonic() + DAY, True
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
        w = Worker(None, crawler, "dry")
        title, md, links = await w.fetch_page(src, url)
        await w.close()
    sections = split_sections(md, title)
    print(json.dumps({"title": title, "chars": len(md), "sections": len(sections), "links": len(links)}, indent=2))
    for s in sections[:60]:
        print("  " + " › ".join(s.heading_path))


async def dry_run_sitemap(source_id: str) -> None:
    """Prints the pages a sitemap source would queue, best first. Reads the source row; writes nothing."""
    api = WorkerAPI()
    w = Worker(api, None, "dry")
    try:
        await w.load_sources()
        src = w.sources.get(source_id)
        if not src or src["kind"] != "sitemap":
            raise SystemExit(f"{source_id} is not an enabled sitemap source")
        for u in await w.sitemap_pages(src):
            print(u)
    finally:
        await w.close()
        await api.close()


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="only seed this source id (the queue is shared, so all due work is processed)")
    ap.add_argument("--minutes", type=float, default=330, help="stop after this long (GitHub Actions jobs max out at 6h)")
    ap.add_argument("--forever", action="store_true")
    ap.add_argument("--no-seed", action="store_true")
    ap.add_argument("--reparse", action="store_true", help="re-split stored pages with the current parser, then exit")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--url")
    ap.add_argument("--sitemap", metavar="SOURCE", help="with --dry-run: list the pages this sitemap source would queue")
    args = ap.parse_args()

    if args.dry_run:
        await (dry_run_sitemap(args.sitemap) if args.sitemap else dry_run(args.url))
        return

    api = WorkerAPI()
    name = os.getenv("WORKER_NAME") or f"{socket.gethostname()}-{os.getpid()}"
    deadline = time.monotonic() + (10**9 if args.forever else args.minutes * 60)
    async with AsyncWebCrawler(config=BrowserConfig(headless=True, verbose=False)) as crawler:
        w = Worker(api, crawler, name)
        await w.load_sources()
        if args.reparse:
            n = await w.reparse()
            print(f"Re-parsed {n} documents", file=sys.stderr)
            await w.close()
            await api.close()
            return
        if not args.no_seed:
            await w.seed(args.source)
        await w.run(deadline, args.forever)
        w.current = ""
        await w.heartbeat()
        await w.close()
    await api.close()
    print(f"Done: {w.done} pages, {w.changed} new or changed, {w.failed} failed", file=sys.stderr)


if __name__ == "__main__":
    asyncio.run(main())
