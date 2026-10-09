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
        if m and m.group(2).strip():
            flush()
            level, text = len(m.group(1)), m.group(2).strip()
            while stack and stack[-1][0] >= level:
                stack.pop()
            stack.append((level, text))
        else:
            buf.append(line)
    flush()
    return out


def _chunk(body: str) -> list[str]:
    if len(body) <= MAX_SECTION_CHARS:
        return [body]
    parts, cur = [], ""
    for para in body.split("\n\n"):
        if cur and len(cur) + len(para) > MAX_SECTION_CHARS:
            parts.append(cur.strip())
            cur = ""
        cur += para + "\n\n"
    if cur.strip():
        parts.append(cur.strip())
    return parts
