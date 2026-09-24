"""Crypto news, pulled from public RSS feeds (no API key required).

Deliberately dependency-light: RSS is just XML, so this parses it with
the standard library instead of pulling in a feed-parsing package.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree

import httpx

FEEDS = {
    "CoinDesk": "https://www.coindesk.com/arc/outboundfeeds/rss/",
    "Cointelegraph": "https://cointelegraph.com/rss",
}


def _to_iso(pub_date: str | None) -> str | None:
    if not pub_date:
        return None
    try:
        return parsedate_to_datetime(pub_date).astimezone(timezone.utc).isoformat()
    except (TypeError, ValueError):
        return None


async def _fetch_one(client: httpx.AsyncClient, source: str, url: str, limit: int) -> list[dict]:
    try:
        resp = await client.get(url, timeout=10, headers={"User-Agent": "crypto-info-hub/1.0"})
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.content)
    except (httpx.HTTPError, ElementTree.ParseError):
        return []

    items = []
    for item in root.findall("./channel/item")[:limit]:
        title = item.findtext("title") or ""
        link = item.findtext("link") or ""
        pub_date = item.findtext("pubDate")
        items.append(
            {
                "source": source,
                "title": title.strip(),
                "link": link.strip(),
                "published": _to_iso(pub_date),
            }
        )
    return items


async def get_news(limit_per_source: int = 6) -> list[dict]:
    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *(_fetch_one(client, source, url, limit_per_source) for source, url in FEEDS.items())
        )
    merged = [item for group in results for item in group]
    merged.sort(key=lambda i: i["published"] or "", reverse=True)
    return merged


# ---------------------------------------------------------------------------
# News for the coins you actually hold (Google News RSS search, no key needed)
# ---------------------------------------------------------------------------

import time
from urllib.parse import quote_plus

from .config import load_holdings as _load_holdings

GOOGLE_NEWS = "https://news.google.com/rss/search?q={q}&hl=en-AU&gl=AU&ceid=AU:en"

# Search terms that work better than the CoinGecko id. Anything not listed
# falls back to the id with dashes turned into spaces plus "crypto".
QUERY_OVERRIDES = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "RETH": "Rocket Pool rETH",
    "USDC": "USDC stablecoin Circle",
    "HYPE": "Hyperliquid HYPE",
    "PUMP": "pump.fun PUMP token",
    "ZEC": "Zcash",
    "LIT": "Lighter LIT crypto exchange",
    "WLD": "Worldcoin",
    "PONS": "Pons PONS crypto",
    "CARDS": "Collector Crypt",
}

_HOLD_CACHE: tuple[float, list[dict]] | None = None
_HOLD_TTL = 600  # 10 minutes; be polite to the feed
_MAX_AGE_DAYS = 21


def _query_for(holding: dict) -> str:
    sym = holding["symbol"].upper()
    if holding.get("news_query"):
        return holding["news_query"]
    return QUERY_OVERRIDES.get(sym) or holding["coingecko_id"].replace("-", " ") + " crypto"


async def _fetch_google(client: httpx.AsyncClient, symbol: str, query: str, limit: int) -> list[dict]:
    try:
        resp = await client.get(
            GOOGLE_NEWS.format(q=quote_plus(query + " when:14d")),
            timeout=10,
            headers={"User-Agent": "crypto-info-hub/1.0"},
        )
        resp.raise_for_status()
        root = ElementTree.fromstring(resp.content)
    except (httpx.HTTPError, ElementTree.ParseError):
        return []

    out = []
    for item in root.findall("./channel/item")[:limit]:
        title = (item.findtext("title") or "").strip()
        publisher = (item.findtext("source") or "").strip()
        # Google appends " - Publisher" to titles; drop it, we show source separately.
        if publisher and title.endswith(" - " + publisher):
            title = title[: -len(publisher) - 3]
        out.append(
            {
                "symbol": symbol,
                "source": publisher or "News",
                "title": title,
                "link": (item.findtext("link") or "").strip(),
                "published": _to_iso(item.findtext("pubDate")),
            }
        )
    return out


async def get_holdings_news(per_coin: int = 3) -> list[dict]:
    global _HOLD_CACHE
    now = time.time()
    if _HOLD_CACHE and now - _HOLD_CACHE[0] < _HOLD_TTL:
        return _HOLD_CACHE[1]

    # one search per distinct symbol, even if held in several accounts
    seen: dict[str, dict] = {}
    for h in _load_holdings():
        seen.setdefault(h["symbol"].upper(), h)

    async with httpx.AsyncClient() as client:
        groups = await asyncio.gather(
            *(_fetch_google(client, sym, _query_for(h), per_coin) for sym, h in seen.items())
        )

    cutoff = datetime.now(timezone.utc).timestamp() - _MAX_AGE_DAYS * 86400
    titles: set[str] = set()
    merged: list[dict] = []
    for item in (i for g in groups for i in g):
        key = item["title"].lower()
        if key in titles:
            continue
        if item["published"]:
            try:
                if datetime.fromisoformat(item["published"]).timestamp() < cutoff:
                    continue
            except ValueError:
                pass
        titles.add(key)
        merged.append(item)

    merged.sort(key=lambda i: i["published"] or "", reverse=True)
    # Don't cache an empty result (likely a transient failure).
    if merged:
        _HOLD_CACHE = (now, merged)
    elif _HOLD_CACHE:
        return _HOLD_CACHE[1]
    return merged
