"""Paper-trading engine: replays closed daily candles through the six-dot rules.

The same function produces the backtest (from 2021) and the paper account (from the day
paper trading started), so what the paper account does always matches the test.
Signals are read on a candle's close and filled at the next candle's open.
"""

from __future__ import annotations

from .strategy import TOP_N, all_green, coin_signals, trend_broken

# Trading venue: Hyperliquid spot (no ID check, trade-only API wallet).
EXCHANGE = "Hyperliquid"
COST = 0.0012  # 0.07% taker fee + 0.05% slippage, each side
MIN_ORDER = 10.0  # Hyperliquid minimum order, USD
# Coins with a Hyperliquid spot market (UBTC, UETH, USOL, UZEC, ONEAR, HYPE, UENA, UPUMP, UXPL, HPENGU).
TRADEABLE = ["BTC", "ETH", "SOL", "ZEC", "NEAR", "HYPE", "ENA", "PUMP", "XPL", "PENGU"]
MIN_VOL = 20e6  # a coin must trade $20M a day on average to count as "big"

# Two sleeves: a Bitcoin core, and a slice spread over the biggest coins.
SLEEVES = [
    {"key": "core", "label": "Bitcoin core", "share": 0.7, "slots": 1, "coins": ["BTC"]},
    {"key": "satellite", "label": "Top-10 coins", "share": 0.3, "slots": 5, "coins": TRADEABLE},
]


def prepare(candles: dict[str, list[list[float]]]) -> dict:
    """Compute every coin's daily dots, then mark which coins were top-10 each day."""
    info = {}
    for coin, rows in candles.items():
        if len(rows) < 400:
            continue
        info[coin] = {"rows": rows, "sig": coin_signals(rows), "idx": {r[0]: k for k, r in enumerate(rows)}}
    days = sorted({r[0] for v in info.values() for r in v["rows"]})
    for t in days:
        live = [(v["sig"][v["idx"][t]]["vol30"], c) for c, v in info.items()
                if t in v["idx"] and v["sig"][v["idx"][t]]]
        for vol30, c in sorted(live, reverse=True)[:TOP_N]:
            if vol30 >= MIN_VOL:
                info[c]["sig"][info[c]["idx"][t]]["big"] = True
    return {"coins": info, "days": days}


def _day(iso_ms: int) -> str:
    import time
    return time.strftime("%Y-%m-%d", time.gmtime(iso_ms / 1000))


def run_sleeve(prep: dict, sleeve: dict, start_ms: int, cash: float, live: dict | None = None) -> dict:
    """Replay closed days from start_ms. The first decision is taken at the close of the day
    before start_ms. If `live` holds today's still-forming candles ({coin: row}), today's
    fills happen at its open and positions are valued at the current price."""
    info, K = prep["coins"], sleeve["slots"]
    allowed = sleeve["coins"]
    days = [t for t in prep["days"] if t >= start_ms]
    pos: dict[str, dict] = {}
    trades: list[dict] = []
    curve: list[tuple[int, float]] = []

    def close(c: str, t: int, px: float, reason: str) -> None:
        nonlocal cash
        p = pos.pop(c)
        value = p["units"] * px * (1 - COST)
        cash += value
        trades.append({"coin": c, "sleeve": sleeve["key"], "entry_date": _day(p["t"]), "entry_price": p["entry"],
                       "cost": p["cost"], "entry_stop": p["stop0"],
                       "exit_date": _day(t), "exit_price": px, "reason": reason,
                       "pnl": value - p["cost"], "pnl_pct": (value / p["cost"] - 1) * 100})

    def sig(c: str, t: int) -> dict | None:
        k = info[c]["idx"].get(t)
        return info[c]["sig"][k] if k is not None else None

    def fill(queue: list, t: int, bar: dict, prev_sig: dict) -> None:
        """Carry out yesterday's decisions at today's open. bar/prev_sig map coin -> row / signal."""
        nonlocal cash
        for act, c in queue:
            if c not in bar:
                continue
            o = bar[c][1]
            if act == "sell" and c in pos:
                close(c, t, o, "Trend turned")
            elif act == "buy" and c not in pos and len(pos) < K and prev_sig.get(c):
                equity = cash + sum(p["units"] * (bar[x][1] if x in bar else p["last"]) for x, p in pos.items())
                slot = min(cash, equity / K)
                if slot > MIN_ORDER:
                    cash -= slot
                    stop = o - 3 * prev_sig[c]["atr"]
                    pos[c] = {"units": slot * (1 - COST) / o, "cost": slot, "entry": o, "t": t, "high": o,
                              "stop": stop, "stop0": stop, "last": o}

    def scan(t: int) -> list[tuple[str, str]]:
        """End-of-day decisions for the next open."""
        queue = [("sell", c) for c in pos if (s := sig(c, t)) and trend_broken(s)]
        free = K - len(pos) + len(queue)
        cands = [(s["strength"], c) for c in info
                 if c not in pos and (not allowed or c in allowed) and (s := sig(c, t)) and all_green(s)]
        return queue + [("buy", c) for _, c in sorted(cands, reverse=True)[:max(free, 0)]]

    before = [t for t in prep["days"] if t < start_ms]
    queue = scan(before[-1]) if before else []
    prev = before[-1] if before else None
    for t in days:
        bar = {c: v["rows"][v["idx"][t]] for c, v in info.items() if t in v["idx"]}
        fill(queue, t, bar, {c: sig(c, prev) for c in bar} if prev else {})
        # stops during the day, then trail them up from the close
        for c in list(pos):
            if c not in bar:
                continue
            o, _h, low, cl = bar[c][1:5]
            p = pos[c]
            p["last"] = cl
            if low <= p["stop"]:
                close(c, t, min(o, p["stop"]), "Stop hit")
            else:
                p["high"] = max(p["high"], cl)
                p["stop"] = max(p["stop"], p["high"] - 3 * sig(c, t)["atr"])
        queue = scan(t)
        prev = t
        curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    # today, still forming: fill at its open, check stops against its low so far, value at the current price
    if live and prev is not None:
        t = max(r[0] for r in live.values())
        if t > prev and t >= start_ms:
            bar = {c: r for c, r in live.items() if r[0] == t and c in info}
            fill(queue, t, bar, {c: sig(c, prev) for c in bar})
            queue = []
            for c in list(pos):
                if c in bar:
                    pos[c]["last"] = bar[c][4]
                    if bar[c][3] <= pos[c]["stop"]:
                        close(c, t, min(bar[c][1], pos[c]["stop"]), "Stop hit")
            curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    open_pos = [{"coin": c, "sleeve": sleeve["key"], "entry_date": _day(p["t"]), "entry_price": p["entry"],
                 "cost": p["cost"], "entry_stop": p["stop0"],
                 "last_price": p["last"], "stop": p["stop"], "value": p["units"] * p["last"],
                 "pnl": p["units"] * p["last"] - p["cost"], "pnl_pct": (p["units"] * p["last"] / p["cost"] - 1) * 100}
                for c, p in pos.items()]
    pending = [{"action": a, "coin": c, "sleeve": sleeve["key"]} for a, c in queue]
    return {"curve": curve, "trades": trades, "positions": open_pos, "pending": pending, "cash": cash}


def run_account(prep: dict, start_ms: int, capital: float, live: dict | None = None) -> dict:
    """Run both sleeves with their share of the capital and combine them."""
    parts = [run_sleeve(prep, s, start_ms, capital * s["share"], live) for s in SLEEVES]
    curve = [(t, sum(p["curve"][i][1] for p in parts)) for i, (t, _) in enumerate(parts[0]["curve"])]
    return {
        "curve": curve,
        "trades": sorted((x for p in parts for x in p["trades"]), key=lambda x: x["exit_date"]),
        "positions": [x for p in parts for x in p["positions"]],
        "pending": [x for p in parts for x in p["pending"]],
        "cash": sum(p["cash"] for p in parts),
    }


def hold(prep: dict, coin: str, start_ms: int, capital: float) -> list[tuple[int, float]]:
    rows = [r for r in prep["coins"][coin]["rows"] if r[0] >= start_ms]
    return [(r[0], capital * r[4] / rows[0][1]) for r in rows] if rows else []


def stats(curve: list[tuple[int, float]], trades: list[dict] | None = None) -> dict:
    import time
    if not curve:
        return {}
    start = curve[0][1]
    peak, worst = 0.0, 0.0
    years: dict[int, float] = {}
    for t, e in curve:
        peak = max(peak, e)
        worst = max(worst, 1 - e / peak if peak else 0)
        years[time.gmtime(t / 1000).tm_year] = e
    yearly, last = [], start
    for y in sorted(years):
        yearly.append({"year": y, "return_pct": (years[y] / last - 1) * 100})
        last = years[y]
    out = {"start": start, "end": curve[-1][1], "return_pct": (curve[-1][1] / start - 1) * 100,
           "worst_drop_pct": worst * 100, "yearly": yearly}
    if trades is not None:
        months = max(len(curve) / 30.44, 1)
        out.update(trades=len(trades), trades_per_month=len(trades) / months,
                   win_rate_pct=100 * sum(x["pnl"] > 0 for x in trades) / max(len(trades), 1))
    return out
