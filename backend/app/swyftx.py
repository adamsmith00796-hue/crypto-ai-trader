"""Read-only Swyftx balances (API key from backend/.env, never from code).

The key is exchanged for a short-lived access token; the scopes on the key
decide what it can do, and this module only calls balance/price endpoints.
"""

from __future__ import annotations

import time
from typing import Any

import httpx

from .coinspot import _load_env
from .fx import aud_to_usd

BASE = "https://api.swyftx.com.au"
_HEADERS = {"User-Agent": "crypto-info-hub/1.0"}

_cache: tuple[float, dict[str, Any]] | None = None
_TTL = 60
_codes: dict[int, str] = {}


async def get_swyftx() -> dict[str, Any]:
    """Return {"connected", "error", "holdings"}. Never raises."""
    global _cache
    now = time.time()
    if _cache and now - _cache[0] < _TTL:
        return _cache[1]

    key = _load_env().get("SWYFTX_API_KEY")
    if not key:
        return {"connected": False, "error": "no credentials", "holdings": []}

    try:
        async with httpx.AsyncClient(timeout=15, headers=_HEADERS) as client:
            auth = await client.post(f"{BASE}/auth/refresh/", json={"apiKey": key})
            auth.raise_for_status()
            client.headers["Authorization"] = "Bearer " + auth.json()["accessToken"]

            bal = (await client.get(f"{BASE}/user/balance/")).raise_for_status().json()
            if not _codes:
                assets = (await client.get(f"{BASE}/markets/assets/")).raise_for_status().json()
                _codes.update({a["id"]: a["code"] for a in assets})
            rates = (await client.get(f"{BASE}/live-rates/1/")).raise_for_status().json()
    except (httpx.HTTPError, KeyError, ValueError) as e:
        if _cache:
            return _cache[1]
        return {"connected": False, "error": f"request failed: {type(e).__name__}", "holdings": []}

    fx = await aud_to_usd()
    if fx is None:
        return {"connected": False, "error": "AUD to USD rate unavailable", "holdings": []}
    holdings = []
    for b in bal:
        qty = float(b.get("availableBalance") or 0) + float(b.get("stakingBalance") or 0)
        if qty <= 0:
            continue
        asset_id = b["assetId"]
        sym = _codes.get(asset_id, f"#{asset_id}")
        price = 1.0 if asset_id == 1 else float((rates.get(str(asset_id)) or {}).get("midPrice") or 0)
        holdings.append(
            {
                "label": "Swyftx",
                "source": "exchange:swyftx",
                "symbol": sym.upper(),
                "quantity": qty,
                "price": price * fx,
                "value": round(qty * price * fx, 2),
            }
        )
    result = {"connected": True, "error": None, "holdings": holdings}
    _cache = (now, result)
    return result
