"""Minimal client for the token-protected worker_* database functions (Supabase REST RPC)."""

from __future__ import annotations

import asyncio
import os
from typing import Any

import httpx


class WorkerAPI:
    def __init__(self) -> None:
        self.url = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/"
        key = os.environ["SUPABASE_PUBLISHABLE_KEY"]
        self.token = os.environ["WORKER_TOKEN"]
        self.http = httpx.AsyncClient(
            timeout=httpx.Timeout(120, connect=20),
            headers={"apikey": key, "Content-Type": "application/json", "Prefer": "return=representation"},
        )

    async def call(self, fn: str, **params: Any) -> Any:
        body = {"p_token": self.token, **{f"p_{k}": v for k, v in params.items()}}
        for attempt in range(4):
            try:
                r = await self.http.post(self.url + fn, json=body)
            except httpx.TransportError:
                if attempt == 3:
                    raise
                await asyncio.sleep(2**attempt)
                continue
            if r.status_code >= 500 and attempt < 3:
                await asyncio.sleep(2**attempt)
                continue
            if r.status_code >= 400:
                raise RuntimeError(f"{fn}: {r.status_code} {r.text[:300]}")
            return r.json() if r.content else None
        return None

    async def close(self) -> None:
        await self.http.aclose()
