"""AUD -> USD rate, for exchanges that only report Australian dollars."""

from __future__ import annotations

import time

import httpx

_cache: tuple[float, float] | None = None
_TTL = 600


async def aud_to_usd() -> float | None:
    """USD per 1 AUD, or None if it can't be fetched (never guess a rate)."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < _TTL:
        return _cache[1]
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.get("https://api.coinbase.com/v2/exchange-rates", params={"currency": "AUD"})
            r.raise_for_status()
            rate = float(r.json()["data"]["rates"]["USD"])
    except (httpx.HTTPError, KeyError, ValueError):
        return _cache[1] if _cache else None
    _cache = (now, rate)
    return rate
