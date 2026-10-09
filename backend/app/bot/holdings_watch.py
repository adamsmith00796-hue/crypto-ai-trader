"""Telegram alert when one of Adam's long-term holdings comes back near (or below) his average buy price,
so he can consider buying more. Separate from the bot: these coins are his own, the bot never trades them.

Holdings and buy prices live in backend/data/holdings.json (data/ is never committed):
  [{"symbol": "BTC", "coingecko_id": "bitcoin", "quantity": 1.833, "avg_buy_price": 30014.93}, ...]
Prices come from CoinGecko's free API, one call for all coins, every refresh (5 minutes).

Each coin alerts once per zone as it falls through them: NEAR (within 10% above the buy price), AT/BELOW
(at or under it), DEEP (20%+ under it). Once it climbs back 20% above the buy price, the zones re-arm.
Alerts go to Adam's private chat only, never the shared channel.
"""

from __future__ import annotations

import json
import logging

import httpx

from . import alerts
from .data import DATA_DIR

HOLDINGS_FILE = DATA_DIR / "holdings.json"
STATE_FILE = DATA_DIR / "holdings_alerts.json"
ZONES = [(0.10, "NEAR YOUR BUY-IN"), (0.0, "AT/BELOW YOUR BUY-IN"), (-0.20, "20%+ BELOW YOUR BUY-IN")]
REARM = 0.20
log = logging.getLogger(__name__)


def _load(path, default):
    return json.loads(path.read_text()) if path.exists() else default


def zone(gap: float) -> int:
    """Deepest zone reached for a price this far above (+) or below (-) the buy price; -1 = none."""
    return max((i for i, (limit, _) in enumerate(ZONES) if gap <= limit), default=-1)


def notify() -> None:
    holdings = [h for h in _load(HOLDINGS_FILE, []) if h.get("avg_buy_price") and h.get("coingecko_id")]
    if not holdings:
        return
    try:
        r = httpx.get("https://api.coingecko.com/api/v3/simple/price", timeout=20,
                      params={"ids": ",".join(h["coingecko_id"] for h in holdings), "vs_currencies": "usd"})
        r.raise_for_status()
        prices = {k: v["usd"] for k, v in r.json().items() if "usd" in v}
    except (httpx.HTTPError, ValueError) as e:
        log.warning("holdings prices failed: %s", type(e).__name__)
        return
    state = _load(STATE_FILE, {})
    changed = False
    for h in holdings:
        px, buy, sym = prices.get(h["coingecko_id"]), h["avg_buy_price"], h["symbol"]
        if not px:
            continue
        gap = px / buy - 1
        done = state.get(sym, -1)
        if gap >= REARM and done != -1:
            state[sym], changed = -1, True
            continue
        z = zone(gap)
        if z > done:
            where = f"{abs(gap) * 100:.0f}% {'above' if gap >= 0 else 'below'}"
            text = (f"📉 {ZONES[z][1]}: {sym}\n"
                    f"Now {alerts._money(px)}, {where} your average buy price of {alerts._money(buy)}.\n"
                    f"You hold {h['quantity']:,.4g} {sym} (worth {alerts._money(px * h['quantity'])}).\n"
                    "Worth a look if you want to add to it. Your call, not advice.")
            if alerts.send(text):  # private chat only
                state[sym], changed = z, True
    if changed:
        STATE_FILE.write_text(json.dumps(state))
