"""Split crawled Markdown into sections with full heading paths."""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass

HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")
INVISIBLE = re.compile("[\u200b\u200c\u200d\u2060\ufeff]")
# Links like [VETASSESS](javascript:app.clickbot.addDynamicQuery\("<random id>"\);) change on every load.
JS_LINK = re.compile(r"\[([^\]]*)\]\(javascript:(?:\\.|[^)\\])*\)")
MAX_SECTION_CHARS = 6000
# A "heading" longer than this is a whole block the HTML converter wrapped in a
# heading tag (seen on some Home Affairs layouts); treat it as body text.
MAX_HEADING_CHARS = 150

# Bump when splitting changes; stored versions from an older parser get re-split.
PARSER_VERSION = "p3"


@dataclass
class Section:
    ordinal: int
    heading_path: list[str]
    anchor: str | None
    content: str

    @property
    def content_hash(self) -> str:
        return sha256(" / ".join(self.heading_path) + "\n" + self.content)


def sha256(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()


def normalize(markdown: str) -> str:
    """Remove noise that changes between fetches without the content changing."""
    text = INVISIBLE.sub("", markdown).replace("\u00a0", " ")
    text = JS_LINK.sub(r"\1", text)
    lines = [re.sub(r"[ \t]+", " ", line).rstrip() for line in text.splitlines()]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def split_sections(markdown: str, title: str) -> list[Section]:
    """One section per heading. Paths start with the document title."""
    stack: list[tuple[int, str]] = []
    buf: list[str] = []
    out: list[Section] = []

    def flush() -> None:
        body = "\n".join(buf).strip()
        buf.clear()
        if not body:
            return
        path = [title] + [h for _, h in stack]
        for i, part in enumerate(_chunk(body)):
            out.append(
                Section(
                    ordinal=len(out),
                    heading_path=path if i == 0 else path[:-1] + [f"{path[-1]} (part {i + 1})"],
                    anchor=slug(path[-1]) if len(path) > 1 else None,
                    content=part,
                )
            )

    for line in markdown.splitlines():
        m = HEADING.match(line)
        if m and m.group(2).strip() and len(m.group(2).strip()) <= MAX_HEADING_CHARS:
            flush()
            level, text = len(m.group(1)), m.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, text))
        else:
            buf.append(m.group(2) if m else line)
    flush()
    return out


def _chunk(body: str) -> list[str]:
    """Split at paragraph breaks, then at line breaks, then hard, so no part exceeds the limit."""
    if len(body) <= MAX_SECTION_CHARS:
        return [body]
    pieces: list[str] = []
    for para in body.split("\n\n"):
        if len(para) <= MAX_SECTION_CHARS:
            pieces.append(para)
            continue
        for line in para.split("\n"):  # long tables and lists have no blank lines
            pieces += [line[i : i + MAX_SECTION_CHARS] for i in range(0, max(len(line), 1), MAX_SECTION_CHARS)]
    parts, cur = [], ""
    for piece in pieces:
        if cur and len(cur) + len(piece) > MAX_SECTION_CHARS:
            parts.append(cur.strip())
            cur = ""
        cur += piece + "\n\n"
    if cur.strip():
        parts.append(cur.strip())
    return parts


def content_hash(markdown: str) -> str:
    """Version hash: includes the parser version so a new parser re-splits stored pages."""
    return f"{PARSER_VERSION}:{sha256(markdown)}"


def _humanize(segment: str) -> str:
    return re.sub(r"[-_]+", " ", segment).strip().capitalize()


def title_for(markdown: str, url: str, meta_title: str | None = None) -> str:
    """Page title from metadata, else a short first heading, else the URL slug.

    Sub-pages get their parent page's name appended when the title doesn't already
    say it, e.g. "Points-tested stream (Skilled independent 189)", so searches for
    "189" find them.
    """
    title = None
    if meta_title and len(meta_title.split("|")[0].strip()) <= MAX_HEADING_CHARS:
        title = meta_title.split("|")[0].strip()
    if not title:
        for line in markdown.splitlines():
            m = HEADING.match(line)
            if m and 0 < len(m.group(2).strip()) <= MAX_HEADING_CHARS:
                title = m.group(2).strip()
                break
    parts = [p for p in url.split("://", 1)[-1].split("/")[1:] if p]
    if not title:
        title = _humanize(parts[-1]) if parts else url
    if len(parts) >= 2:
        parent = _humanize(parts[-2])
        if parent.lower() not in title.lower() and parts[-2] not in ("visa-listing", "latest", "visas"):
            title = f"{title} ({parent})"
    return title[:200]
