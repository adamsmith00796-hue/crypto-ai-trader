"""Read-only CoinSpot balances.

Uses CoinSpot's read-only API (`/api/v2/ro/...`), which cannot trade or
withdraw. Credentials come from backend/.env (gitignored), never from code.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from pathlib import Path
from typing import Any

import httpx

from .fx import aud_to_usd

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
BALANCES_URL = "https://www.coinspot.com.au/api/v2/ro/my/balances"

_cache: tuple[float, dict[str, Any]] | None = None
_TTL = 60


def _load_env() -> dict[str, str]:
    """Tiny .env reader so we don't need an extra dependency."""
    out: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return {**out, **{k: v for k, v in os.environ.items() if k.startswith("COINSPOT_")}}


async def get_coinspot() -> dict[str, Any]:
    """Return {"connected": bool, "error": str|None, "holdings": [...]}. Never raises."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < _TTL:
        return _cache[1]

    env = _load_env()
    key, secret = env.get("COINSPOT_API_KEY"), env.get("COINSPOT_API_SECRET")
    if not key or not secret:
        return {"connected": False, "error": "no credentials", "holdings": []}

    body = json.dumps({"nonce": int(time.time() * 1000)}, separators=(",", ":"))
    sign = hmac.new(secret.encode(), body.encode(), hashlib.sha512).hexdigest()
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                BALANCES_URL,
                content=body,
                headers={"Content-Type": "application/json", "key": key, "sign": sign},
            )
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        if _cache:
            return _cache[1]
        return {"connected": False, "error": f"request failed: {type(e).__name__}", "holdings": []}

    if data.get("status") != "ok":
        return {"connected": False, "error": str(data.get("message") or data.get("status")), "holdings": []}

    raw = data.get("balances", [])
    pairs: list[tuple[str, dict]] = []
    if isinstance(raw, dict):
        pairs = list(raw.items())
    else:
        for entry in raw:
            pairs.extend(entry.items())

    fx = await aud_to_usd()
    if fx is None:
        return {"connected": False, "error": "AUD to USD rate unavailable", "holdings": []}
    holdings = []
    for sym, b in pairs:
        qty = float(b.get("balance", 0) or 0)
        aud = float(b.get("audbalance", 0) or 0)
        if qty <= 0:
            continue
        holdings.append(
            {
                "label": "CoinSpot",
                "source": "exchange:coinspot",
                "symbol": sym.upper(),
                "quantity": qty,
                "price": (float(b.get("rate", 0) or 0) if sym.upper() != "AUD" else 1.0) * fx,
                "value": round(aud * fx, 2),
            }
        )
    result = {"connected": True, "error": None, "holdings": holdings}
    _cache = (now, result)
    return result
