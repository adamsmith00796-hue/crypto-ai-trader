"""Daily candles from Binance's free public market-data API (no key, read-only), plus
Hyperliquid's own public API for coins Binance doesn't list (HYPE).

Candles are cached on disk in backend/data/candles/ and topped up incrementally, so
after the first download (about a minute) each refresh only fetches the last few days.
Only CLOSED daily candles are kept; the live, still-forming candle is returned separately.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import httpx

BASE = "https://data-api.binance.vision/api/v3/"
HL_INFO = "https://api.hyperliquid.xyz/info"
HL_ONLY = ["HYPE"]  # coins tradeable on Hyperliquid but not on Binance
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
CANDLE_DIR = DATA_DIR / "candles"
UNIVERSE_SIZE = 100
FIRST_DAY_MS = 1483228800000  # 2017-01-01

# Stablecoins, gold and tokenised stocks: not crypto trend trades.
EXCLUDE = {
    "USDC", "FDUSD", "TUSD", "BUSD", "DAI", "USDP", "EUR", "AEUR", "USDE", "PAXG", "XAUT", "WBTC", "WBETH",
    "XUSD", "USD1", "BFUSD", "RLUSD", "U", "SNDKB", "CRCLB", "SPCXB", "MSTRB", "NVDAB", "QQQB",
}


def _get(client: httpx.Client, path: str, params: dict | None = None):
    r = client.get(BASE + path, params=params, timeout=30)
    r.raise_for_status()
    return r.json()


def pick_universe(client: httpx.Client) -> list[str]:
    tickers = [t for t in _get(client, "ticker/24hr") if t["symbol"].endswith("USDT")]
    coins: list[str] = []
    for t in sorted(tickers, key=lambda t: -float(t["quoteVolume"])):
        base = t["symbol"][:-4]
        if not base.isascii() or not base.isalnum() or base in EXCLUDE or base.endswith(("UP", "DOWN", "BULL", "BEAR")):
            continue
        coins.append(base)
        if len(coins) == UNIVERSE_SIZE:
            break
    if "BTC" not in coins:
        coins.insert(0, "BTC")
    return coins


def _load(coin: str) -> list[list[float]]:
    path = CANDLE_DIR / f"{coin}.json"
    return json.loads(path.read_text()) if path.exists() else []


def update_coin(client: httpx.Client, coin: str) -> tuple[list[list[float]], list[float] | None]:
    """Returns (closed daily candles, live candle or None)."""
    rows = _load(coin)
    start = rows[-1][0] + 1 if rows else FIRST_DAY_MS
    now_ms = time.time() * 1000
    live = None
    while True:
        batch = _get(client, "klines", {"symbol": f"{coin}USDT", "interval": "1d", "limit": 1000, "startTime": start})
        for b in batch:
            row = [b[0], float(b[1]), float(b[2]), float(b[3]), float(b[4]), float(b[7])]
            if b[6] < now_ms:  # close time passed: candle is final
                rows.append(row)
            else:
                live = row
        if len(batch) < 1000:
            break
        start = batch[-1][0] + 1
    CANDLE_DIR.mkdir(parents=True, exist_ok=True)
    (CANDLE_DIR / f"{coin}.json").write_text(json.dumps(rows))
    return rows, live


def update_hl_coin(client: httpx.Client, coin: str) -> tuple[list[list[float]], list[float] | None]:
    """Hyperliquid daily candles (whole history each time, it's small)."""
    now_ms = time.time() * 1000
    r = client.post(HL_INFO, json={"type": "candleSnapshot", "req": {
        "coin": coin, "interval": "1d", "startTime": FIRST_DAY_MS, "endTime": int(now_ms)}}, timeout=30)
    r.raise_for_status()
    rows, live = [], None
    for k in r.json():
        close = float(k["c"])
        row = [k["t"], float(k["o"]), float(k["h"]), float(k["l"]), close, float(k["v"]) * close]
        if k["T"] < now_ms:
            rows.append(row)
        else:
            live = row
    CANDLE_DIR.mkdir(parents=True, exist_ok=True)
    (CANDLE_DIR / f"{coin}.json").write_text(json.dumps(rows))
    return rows, live


def refresh_all() -> tuple[dict[str, list[list[float]]], dict[str, list[float]]]:
    """Top up every coin in the universe. Returns closed candles and today's live candles."""
    candles: dict[str, list[list[float]]] = {}
    live: dict[str, list[float]] = {}
    with httpx.Client() as client:
        coins = pick_universe(client)
        for coin in coins + [c for c in HL_ONLY if c not in coins]:
            try:
                rows, now = update_hl_coin(client, coin) if coin in HL_ONLY else update_coin(client, coin)
            except httpx.HTTPError:
                rows, now = _load(coin), None  # keep what we have if one coin fails
            if rows:
                candles[coin] = rows
            if now:
                live[coin] = now
    return candles, live
