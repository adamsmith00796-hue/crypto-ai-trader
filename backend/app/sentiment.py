"""Market sentiment — the Crypto Fear & Greed Index (alternative.me, free/no key)."""

from __future__ import annotations

import httpx

FNG_URL = "https://api.alternative.me/fng/"


async def get_sentiment() -> dict:
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(FNG_URL, params={"limit": 7})
        resp.raise_for_status()
        data = resp.json()["data"]

    latest = data[0]
    history = [{"value": int(d["value"]), "label": d["value_classification"]} for d in reversed(data)]
    return {
        "value": int(latest["value"]),
        "label": latest["value_classification"],  # e.g. "Extreme Fear" .. "Extreme Greed"
        "history_7d": history,
    }
