"""Live market data via CoinGecko's free public API (no key required)."""

from __future__ import annotations

import time
from typing import Any

import httpx

from .config import held_coin_ids

COINGECKO_BASE = "https://api.coingecko.com/api/v3"


# Tiny in-memory cache so the dashboard polling loop doesn't hammer the
# free CoinGecko tier (which rate-limits aggressively).
_cache: dict[str, tuple[float, Any]] = {}
_CACHE_TTL_SECONDS = 30


async def _cached_get(url: str, params: dict) -> Any:
    key = url + str(sorted(params.items()))
    now = time.time()
    if key in _cache and now - _cache[key][0] < _CACHE_TTL_SECONDS:
        return _cache[key][1]

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError:
        # Free tier rate-limits (429). Serve the last good data if we have it.
        if key in _cache:
            return _cache[key][1]
        raise

    _cache[key] = (now, data)
    return data


async def get_market_overview(coin_ids: list[str] | None = None) -> list[dict]:
    """Price, 24h change, and market cap for a watchlist of coins."""
    ids = ",".join(coin_ids or held_coin_ids())
    data = await _cached_get(
        f"{COINGECKO_BASE}/coins/markets",
        {
            "vs_currency": "usd",
            "ids": ids,
            "order": "market_cap_desc",
            "price_change_percentage": "24h",
            "sparkline": "true",
        },
    )
    return [
        {
            "id": c["id"],
            "symbol": c["symbol"].upper(),
            "name": c["name"],
            "price": c["current_price"],
            "change_24h_pct": c.get("price_change_percentage_24h"),
            "market_cap": c["market_cap"],
            "sparkline_7d": (c.get("sparkline_in_7d") or {}).get("price", [])[-48:],
        }
        for c in data
    ]


async def get_trending() -> list[dict]:
    """Coins currently trending on CoinGecko (search activity based)."""
    data = await _cached_get(f"{COINGECKO_BASE}/search/trending", {})
    items = data.get("coins", [])[:8]
    return [
        {
            "id": item["item"]["id"],
            "symbol": item["item"]["symbol"].upper(),
            "name": item["item"]["name"],
            "market_cap_rank": item["item"].get("market_cap_rank"),
        }
        for item in items
    ]
