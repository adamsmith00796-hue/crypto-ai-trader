"""Portfolio holdings.

Real holdings live in `config/portfolio.json`, which is gitignored on
purpose (same pattern as crypto-tax-tracker: this repo holds code, not
your financial data). `config/portfolio.example.json` shows the shape.

Automated balance-fetching (reading wallet addresses on-chain, pulling
exchange balances via API) is not wired up yet — see the README's
"Roadmap" section. For now this reads static holdings you maintain in
the config file yourself, prices them live via CoinGecko, and totals
them up. That alone already removes the manual-math part of updating
CoinMarketCap by hand.
"""

from __future__ import annotations

from typing import Any

from .coinbase import get_coinbase
from .coinspot import get_coinspot
from .market import _cached_get, COINGECKO_BASE
from .swyftx import get_swyftx

from .config import REAL_CONFIG, load_holdings as _load_holdings, load_settings


async def get_portfolio() -> dict[str, Any]:
    holdings = _load_holdings()
    coin_ids = sorted({h["coingecko_id"] for h in holdings})

    prices = await _cached_get(
        f"{COINGECKO_BASE}/simple/price",
        {"ids": ",".join(coin_ids), "vs_currencies": "usd"},
    )

    rows = []
    total = 0.0
    for h in holdings:
        price = prices.get(h["coingecko_id"], {}).get("usd", 0)
        value = price * h["quantity"]
        total += value
        rows.append(
            {
                "label": h["label"],
                "source": h["source"],
                "symbol": h["symbol"],
                "quantity": h["quantity"],
                "price": price,
                "value": round(value, 2),
            }
        )

    # Live exchange balances. CoinMarketCap-style tracker rows ("portfolio:*")
    # are mirrors of custody locations, so where an exchange reports the same
    # coin we trust the exchange and drop the tracker row (no double counting).
    connections: dict[str, Any] = {}
    for name, fetch in (("coinspot", get_coinspot), ("swyftx", get_swyftx), ("coinbase", get_coinbase)):
        res = await fetch()
        replaced: list[str] = []
        overlap: list[str] = []
        if res["connected"]:
            live = [h for h in res["holdings"] if h["value"] >= 1]
            by_sym = {h["symbol"]: h for h in live}
            kept = []
            for r in rows:
                h = by_sym.get(r["symbol"].upper())
                if r["source"].startswith("portfolio:") and h:
                    # Tracker row is a mirror only if quantities agree (within 3%).
                    if abs(h["quantity"] - r["quantity"]) <= 0.03 * r["quantity"]:
                        replaced.append(r["symbol"])
                        total -= r["value"]
                        continue
                    overlap.append(r["symbol"])  # exchange holds only part; keep both
                kept.append(r)
            rows = kept + live
            total += sum(h["value"] for h in live)
        connections[name] = {"connected": res["connected"], "error": res["error"], "replaced": replaced, "possible_overlap": overlap}

    rows.sort(key=lambda r: r["value"], reverse=True)

    # Positions vs. your average buy price (USD). Gain % = price / avg - 1,
    # the same definition CoinMarketCap shows as Profit/Loss %.
    threshold = load_settings()["alert_gain_pct"]
    avg_by_sym = {h["symbol"].upper(): h["avg_buy_price"] for h in _load_holdings() if h.get("avg_buy_price")}
    positions = []
    for sym, avg in avg_by_sym.items():
        mine = [r for r in rows if r["symbol"].upper() == sym]
        qty = sum(r["quantity"] for r in mine)
        val = sum(r["value"] for r in mine)
        if qty <= 0 or val <= 0:
            continue
        px = val / qty
        gain = (px / avg - 1) * 100
        positions.append(
            {
                "symbol": sym,
                "quantity": qty,
                "avg_buy_price": avg,
                "price": px,
                "value": round(val, 2),
                "profit": round((px - avg) * qty, 2),
                "gain_pct": round(gain, 2),
                "alert": gain >= threshold,
            }
        )
    positions.sort(key=lambda p: p["gain_pct"], reverse=True)

    return {
        "positions": positions,
        "alert_gain_pct": threshold,
        "total_value": round(total, 2),
        "holdings": rows,
        "using_example_data": not REAL_CONFIG.exists(),
        "connections": connections,
    }
