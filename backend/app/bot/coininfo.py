"""A coin's full name and the network it lives on, for the breakout alerts (so a Tangem swap can be
judged at a glance: same-network swaps are quick, cross-network ones are slow).

From CoinGecko's free public API (no key), looked up once per coin and cached in
backend/data/coin_info.json. Any failure just leaves the extra line out of the alert.
"""

from __future__ import annotations

import json
import logging

import httpx

from .data import DATA_DIR

CACHE_FILE = DATA_DIR / "coin_info.json"
API = "https://api.coingecko.com/api/v3/"
# CoinGecko network ids -> plain names; these are also the ones listed as "also on", most popular first
NETWORKS = {"ethereum": "Ethereum", "binance-smart-chain": "BNB Chain", "solana": "Solana",
            "arbitrum-one": "Arbitrum", "base": "Base", "polygon-pos": "Polygon", "avalanche": "Avalanche",
            "optimistic-ethereum": "Optimism", "tron": "Tron", "cardano": "Cardano", "the-open-network": "TON",
            "sui": "Sui", "aptos": "Aptos", "near-protocol": "NEAR", "hedera-hashgraph": "Hedera"}
log = logging.getLogger(__name__)


def _lookup(client: httpx.Client, symbol: str) -> dict | None:
    found = [c for c in client.get(API + "search", params={"query": symbol}).json().get("coins", [])
             if c["symbol"].upper() == symbol.upper()]
    if not found:
        return None
    best = min(found, key=lambda c: c.get("market_cap_rank") or 10**9)
    d = client.get(API + f"coins/{best['id']}", params={
        "localization": "false", "tickers": "false", "market_data": "false",
        "community_data": "false", "developer_data": "false"}).json()
    name = d.get("name") or best["name"]
    home = d.get("asset_platform_id")
    if home and (home.replace("-", " ") in name.lower() or name.lower() in home.replace("-", " ")):
        home = None  # e.g. Moonriver is listed as living on "moonriver": that's its own chain
    also = [NETWORKS[p] for p in NETWORKS if p in (d.get("platforms") or {}) and p != home]
    return {"name": name,
            "network": NETWORKS.get(home, home.replace("-", " ").title()) if home else None,
            "also_on": also[:4]}


def get(symbol: str) -> dict | None:
    """{"name", "network" (None = its own chain), "also_on": [...]}, or None if unknown."""
    cache = json.loads(CACHE_FILE.read_text()) if CACHE_FILE.exists() else {}
    if symbol not in cache:
        try:
            with httpx.Client(timeout=20, headers={"accept": "application/json"}) as client:
                cache[symbol] = _lookup(client, symbol)
        except (httpx.HTTPError, ValueError, KeyError) as e:
            log.warning("coin info lookup failed for %s: %s", symbol, type(e).__name__)
            return None
        CACHE_FILE.write_text(json.dumps(cache, indent=1))
    return cache[symbol]


def describe(symbol: str) -> tuple[str, str]:
    """(" (Full Name)", "Network: ...\\n") for an alert, or empty strings if unknown."""
    info = get(symbol)
    if not info:
        return "", ""
    where = f"{info['network']} token" if info["network"] else "its own blockchain"
    also = f" (also on {', '.join(info['also_on'])})" if info["also_on"] else ""
    return f" ({info['name']})", f"Network: {where}{also}\n"
