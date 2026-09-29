"""Moonshot pot: small, high-risk breakout bets on speculative Hyperliquid spot coins.

Separate from the six-dot bot, with its own money and rules. Treat the pot as money that can go to zero.

"Let winners run" version, chosen 27 Sep 2026 when Adam asked for a more aggressive pot: no selling half
at +100% and a 30% (not 25%) trailing stop. Backtested on mid/small Binance coins it was the only
aggressive variant that beat the balanced rules on unseen 2024+ data ($200 -> $252 vs $235, worst drop
59%). Bigger/fewer bets and faster entries only helped in the 2021 mania and nearly wiped out after.

  Buy   when a coin closes at a new 20-day high on 2x+ its normal volume, while Bitcoin is above
        its 100-day average. Filled at the next daily open. Up to 5 bets, each 1/5 of the pot.
  Sell  hard stop 15% below entry (any time in the day)
        trailing stop: a close 30% below the highest close since buying (winners are left to run)
        time stop: after 30 days if not up at least 10%
"""

from __future__ import annotations

from . import engine

COINS = ["ENA", "PUMP", "XPL", "PENGU", "KNTQ", "DRV", "HYPE", "ZEC", "NEAR"]
SLOTS, STOP, TRAIL, TAKE, DAYS_MAX = 5, 0.15, 0.30, 0.0, 30  # TAKE 0 = never sell half early
MIN_VOL = 1e6  # average daily dollar volume over 30 days
COST = 0.003   # fees plus extra slippage on thin coins, each side
DAY_MS = 86_400_000


def _btc_up(rows: list[list[float]]) -> dict[int, bool]:
    cl = [r[4] for r in rows]
    return {r[0]: i >= 99 and cl[i] > sum(cl[i - 99:i + 1]) / 100 for i, r in enumerate(rows)}


def _setup(rows: list[list[float]], k: int) -> dict | None:
    """Breakout check on closed candle k: new 20-day high on 2x volume, with enough trading."""
    if k < 30:
        return None
    hi20 = max(r[2] for r in rows[k - 20:k])
    vol20 = sum(r[5] for r in rows[k - 20:k]) / 20
    vol30 = sum(r[5] for r in rows[k - 29:k + 1]) / 30
    close = rows[k][4]
    return {"high20": hi20, "vol_x": rows[k][5] / vol20 if vol20 else 0.0, "vol30": vol30,
            "breakout": close > hi20 and rows[k][5] > 2 * vol20 and vol30 >= MIN_VOL,
            "gain20": close / rows[k - 20][4] - 1}


def run(candles: dict, start_ms: int, capital: float, live: dict | None = None) -> dict:
    btc_up = _btc_up(candles["BTC"])
    coins = {c: {"rows": candles[c], "idx": {r[0]: k for k, r in enumerate(candles[c])}} for c in COINS if c in candles}
    days = sorted({r[0] for c in coins.values() for r in c["rows"] if r[0] >= start_ms})
    cash, pos, trades, curve = capital, {}, [], []

    def sell(c: str, frac: float, px: float, t: int, why: str) -> None:
        nonlocal cash
        p = pos[c]
        units = p["units"] * frac
        value = units * px * (1 - COST)
        cash += value
        p["got"] += value
        p["units"] -= units
        if frac == 1:
            trades.append({"coin": c, "sleeve": "moonshot", "entry_date": engine._day(p["t"]), "entry_price": p["entry"],
                           "cost": p["cost"], "entry_stop": p["entry"] * (1 - STOP), "exit_date": engine._day(t),
                           "exit_price": px, "reason": why, "pnl": p["got"] - p["cost"],
                           "pnl_pct": (p["got"] / p["cost"] - 1) * 100})
            del pos[c]

    def scan(t: int) -> list[str]:
        if not btc_up.get(t):
            return []
        cands = []
        for c, v in coins.items():
            k = v["idx"].get(t)
            s = _setup(v["rows"], k) if k is not None else None
            if c not in pos and s and s["breakout"]:
                cands.append((s["gain20"], c))
        return [c for _, c in sorted(cands, reverse=True)[:max(SLOTS - len(pos), 0)]]

    def fill(queue: list[str], t: int, bar: dict) -> None:
        nonlocal cash
        for c in queue:
            if c in bar and c not in pos and len(pos) < SLOTS:
                equity = cash + sum(p["units"] * (bar[x][1] if x in bar else p["last"]) for x, p in pos.items())
                amount = min(cash, equity / SLOTS)
                if amount > engine.MIN_ORDER:
                    o = bar[c][1]
                    cash -= amount
                    pos[c] = {"units": amount * (1 - COST) / o, "entry": o, "cost": amount, "peak": o, "last": o,
                              "t": t, "age": 0, "took_half": False, "got": 0.0}

    def intraday(c: str, row: list[float], t: int) -> bool:
        """Hard stop and take-half during the day. Returns True if the position is gone."""
        o, h, low = row[1], row[2], row[3]
        p = pos[c]
        if low <= p["entry"] * (1 - STOP):
            sell(c, 1, min(o, p["entry"] * (1 - STOP)), t, "Hard stop -15%")
            return True
        if TAKE and not p["took_half"] and h >= p["entry"] * (1 + TAKE):
            sell(c, 0.5, max(o, p["entry"] * (1 + TAKE)), t, "Half taken at +100%")
            p["took_half"] = True
        return False

    prev = max((t for c in coins.values() for t in c["idx"] if t < start_ms), default=None)
    queue = scan(prev) if prev else []
    for t in days:
        bar = {c: v["rows"][v["idx"][t]] for c, v in coins.items() if t in v["idx"]}
        fill(queue, t, bar)
        for c in list(pos):
            if c not in bar or intraday(c, bar[c], t):
                continue
            p, close = pos[c], bar[c][4]
            p["age"] += 1
            p["last"] = close
            p["peak"] = max(p["peak"], close)
            if close <= p["peak"] * (1 - TRAIL):
                sell(c, 1, close, t, f"Trailing stop -{TRAIL:.0%}")
            elif p["age"] >= DAYS_MAX and close < p["entry"] * 1.10:
                sell(c, 1, close, t, "30-day time stop")
        queue = scan(t)
        prev = t
        curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    if live and prev is not None:  # today, still forming
        t = max(r[0] for r in live.values())
        if t > prev and t >= start_ms:
            bar = {c: r for c, r in live.items() if r[0] == t and c in coins}
            fill(queue, t, bar)
            queue = []
            for c in list(pos):
                if c in bar and not intraday(c, bar[c], t):
                    pos[c]["last"] = bar[c][4]
            curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    watch = []
    for c, v in coins.items():
        k = len(v["rows"]) - 1
        s = _setup(v["rows"], k)
        price = live[c][4] if live and c in live else v["rows"][-1][4]
        status = "IN TRADE" if c in pos else "BUY" if c in queue else "WATCHING"
        watch.append({"coin": c, "price": price, "status": status,
                      "to_breakout_pct": (s["high20"] / price - 1) * 100 if s else None,
                      "volume_x": s["vol_x"] if s else None, "thin": bool(s and s["vol30"] < MIN_VOL)})
    open_pos = [{"coin": c, "sleeve": "moonshot", "entry_date": engine._day(p["t"]), "entry_price": p["entry"],
                 "cost": p["cost"], "entry_stop": p["entry"] * (1 - STOP), "last_price": p["last"],
                 "stop": max(p["entry"] * (1 - STOP), p["peak"] * (1 - TRAIL)), "value": p["units"] * p["last"],
                 "pnl": p["units"] * p["last"] + p["got"] - p["cost"],
                 "pnl_pct": ((p["units"] * p["last"] + p["got"]) / p["cost"] - 1) * 100}
                for c, p in pos.items()]
    last_btc = candles["BTC"][-1][0]
    return {"curve": curve, "trades": trades, "positions": open_pos, "cash": cash, "watch": watch,
            "pending": [{"action": "buy", "coin": c, "sleeve": "moonshot"} for c in queue],
            "btc_uptrend": bool(btc_up.get(last_btc)), "halted": None}


def elsewhere(candles: dict) -> dict:
    """Breakouts by the same rule on coins Hyperliquid doesn't list (alert only, never traded).
    Checked on the last closed daily candle across the top-100 Binance coins."""
    from .live import TOKENS
    btc_rows = candles["BTC"]
    btc_up = _btc_up(btc_rows).get(btc_rows[-1][0], False)
    day = btc_rows[-1][0]
    hits = []
    for coin, rows in candles.items():
        if coin in COINS or coin in TOKENS or not rows or rows[-1][0] != day:
            continue
        s = _setup(rows, len(rows) - 1)
        if s and s["breakout"]:
            close = rows[-1][4]
            hits.append({"coin": coin, "close": close, "volume_x": round(s["vol_x"], 1),
                         "gain_1d_pct": round((close / rows[-2][4] - 1) * 100, 1),
                         "stop": close * (1 - STOP), "day": engine._day(day)})
    hits.sort(key=lambda h: -h["volume_x"])
    return {"btc_uptrend": btc_up, "day": engine._day(day), "breakouts": hits}
