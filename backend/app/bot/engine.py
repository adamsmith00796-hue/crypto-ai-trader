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
# Stops only count on a daily CLOSE below them, so brief intraday spikes don't shake trades out
# (Krown TA101 idea; improved every test, see research_notes/Krown TA101 rules.md).
CLOSE_STOP = True
# Disaster stop: checked all day (every 5 minutes live), sells if price crashes this far BELOW the
# normal stop, so a flash crash can't run on until the daily close. Normal dips are left alone.
# freqtrade-style protections, tested 18 Oct 2026 and left OFF: no setting beat "off" on unseen 2024+ data
# (best seen-data pick, 3-day cooldown + pause after 3 stops in 14 days, made +134% vs +188% unseen).
COOLDOWN_DAYS = 0      # after selling a coin, wait this many days before buying it again (0 = off)
STOP_GUARD = (0, 0)    # (stops, days): after this many stop-outs within this many days, pause new buys (0 = off)
# Buy the hour a coin's dots turn green during the day (needs hourly candles), not only after a green
# daily close. Added 30 Oct 2026 at Adam's request: on 2 years of hourly data it made about the same
# ($2,269 vs $2,298 per $1,000) with a similar worst drop, so it is neutral, but it catches days like HYPE +17%.
INTRADAY_BUYS = True
TAKE_HALF = 0.0  # sell half once a close is this far above entry (0 = off). Tested 30 Oct 2026: +100% did best on unseen data but worse on 2021-23, so it fails the pick-on-seen rule
ATR_MULT = 2.5  # trailing stop distance in average daily ranges (ATR); was 3.0 until 11 Oct 2026
DISASTER = 0.20  # 20%: never triggered on 2021-26 history (free insurance); 10% would have cost ~16%
TRADEABLE = ["BTC", "ETH", "SOL", "ZEC", "NEAR", "HYPE", "ENA", "PUMP", "XPL", "PENGU"]
MIN_VOL = 20e6  # a coin must trade $20M a day on average to count as "big"

# Two sleeves: a Bitcoin core, and a slice spread over the biggest coins. 11 Oct 2026: a 54-setup search
# chosen on 2021-23 only picked 30% BTC / 70% in 3 coins with a 2.5x ATR stop; on unseen 2024+ it made
# +213% vs +174% for the old 50/50 with 3x, worst drop 35% vs 37%, and still led with ZEC removed.
SLEEVES = [
    {"key": "core", "label": "Bitcoin core", "share": 0.3, "slots": 1, "coins": ["BTC"]},
    {"key": "satellite", "label": "Top-10 coins", "share": 0.7, "slots": 3, "coins": TRADEABLE},
]


def prepare(candles: dict[str, list[list[float]]]) -> dict:
    """Compute every coin's daily dots, then mark which coins were top-10 each day."""
    info = {}
    for coin, rows in candles.items():
        if len(rows) < 400:
            continue
        info[coin] = {"rows": rows, "sig": coin_signals(rows), "idx": {r[0]: k for k, r in enumerate(rows)}}
    days = sorted({r[0] for v in info.values() for r in v["rows"]})
    # Market weather: new buys only while Bitcoin closes above its 200-day average (added 11 Oct 2026:
    # unseen 2024+ +233% vs +213%, worst drop 26% vs 35%; bear markets start below this line)
    regime: dict[int, bool] = {}
    if "BTC" in info:
        cl = [r[4] for r in info["BTC"]["rows"]]
        for k, r in enumerate(info["BTC"]["rows"]):
            regime[r[0]] = k >= 199 and cl[k] > sum(cl[k - 199:k + 1]) / 200
    for v in info.values():
        for r, sg in zip(v["rows"], v["sig"]):
            if sg:
                sg["btc_regime"] = regime.get(r[0], False)
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


def live_green(v: dict, k: int, hours: list[list[float]]) -> bool:
    """Would day k be a buy if it closed at the latest hourly price? v = one coin's prepared data,
    k = index of the day being formed, hours = that day's hourly candles so far. Trend, Momentum and
    Breakout use today's price; Weekly, Big coin and the Bitcoin weather come from yesterday's close."""
    if k < 120 or not hours:
        return False
    prev = v["sig"][k - 1]
    if not prev or not (prev["weekly"] and prev["big"] and prev.get("btc_regime", True)):
        return False
    rows, px = v["rows"], hours[-1][4]
    if not px > (sum(r[4] for r in rows[k - 99:k]) + px) / 100 or not px > rows[k - 28][4]:
        return False
    hi_t, lo_t = max(h[2] for h in hours), min(h[3] for h in hours)
    halves = 0
    for n in (20, 55, 100):
        w = rows[k - n + 1:k]
        halves += px > (max([r[2] for r in w] + [hi_t]) + min([r[3] for r in w] + [lo_t])) / 2
    return halves >= 2


def run_sleeve(prep: dict, sleeve: dict, start_ms: int, cash: float, live: dict | None = None,
               halt_ms: int | None = None, no_buy_days: set[int] | None = None,
               hourly: dict | None = None) -> dict:
    """Replay closed days from start_ms. The first decision is taken at the close of the day
    before start_ms. If `live` holds today's still-forming candles ({coin: row}), today's
    fills happen at its open and positions are valued at the current price.
    halt_ms: from this day's close, sell everything and stop (safety switch).
    no_buy_days: days whose close makes no new buys (news brake); sells and stops still work.
    hourly: {coin: {day_ms: [hourly candles]}}. On days it covers, a coin is also bought the hour its
    dots turn green during the day (INTRADAY_BUYS), not only at the next open after a green close."""
    info, K = prep["coins"], sleeve["slots"]
    allowed = sleeve["coins"]
    days = [t for t in prep["days"] if t >= start_ms]
    pos: dict[str, dict] = {}
    trades: list[dict] = []
    curve: list[tuple[int, float]] = []
    last_exit: dict[str, int] = {}
    stop_days: list[int] = []

    def close(c: str, t: int, px: float, reason: str) -> None:
        nonlocal cash
        p = pos.pop(c)
        value = p["units"] * px * (1 - COST)
        cash += value
        last_exit[c] = t
        if "stop" in reason.lower():
            stop_days.append(t)
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
            if act in ("sell", "halt") and c in pos:
                close(c, t, o, "Trend turned" if act == "sell" else "Safety switch")
            elif act == "buy" and c not in pos and len(pos) < K and prev_sig.get(c):
                equity = cash + sum(p["units"] * (bar[x][1] if x in bar else p["last"]) for x, p in pos.items())
                slot = min(cash, equity / K)
                if slot > MIN_ORDER:
                    cash -= slot
                    stop = o - ATR_MULT * prev_sig[c]["atr"]
                    pos[c] = {"units": slot * (1 - COST) / o, "cost": slot, "entry": o, "t": t, "high": o,
                              "stop": stop, "stop0": stop, "last": o}

    def intraday_buys(t: int, k_of) -> None:
        """Buy, hour by hour through day t, any coin whose dots turn green before the close."""
        nonlocal cash
        if not hourly or (halt_ms is not None and t >= halt_ms) or (no_buy_days and t in no_buy_days):
            return
        coins = [c for c in (allowed or info) if c in info and t in hourly.get(c, {})]
        for h in range(max((len(hourly[c][t]) for c in coins), default=0)):
            free = K - len(pos)
            if free <= 0:
                return
            cands = []
            for c in coins:
                hrs, k = hourly[c][t][:h + 1], k_of(c)
                if c not in pos and k is not None and len(hrs) == h + 1 and live_green(info[c], k, hrs):
                    cands.append((info[c]["sig"][k - 1]["strength"], c, hrs[-1][4], info[c]["sig"][k - 1]["atr"]))
            for _, c, px, atr in sorted(cands, reverse=True)[:free]:
                equity = cash + sum(p["units"] * p["last"] for p in pos.values())
                slot = min(cash, equity / K)
                if slot > MIN_ORDER:
                    cash -= slot
                    stop = px - ATR_MULT * atr
                    pos[c] = {"units": slot * (1 - COST) / px, "cost": slot, "entry": px, "t": t, "high": px,
                              "stop": stop, "stop0": stop, "last": px}

    def scan(t: int) -> list[tuple[str, str]]:
        """End-of-day decisions for the next open."""
        if halt_ms is not None and t >= halt_ms:
            return [("halt", c) for c in pos]
        queue = [("sell", c) for c in pos if (s := sig(c, t)) and trend_broken(s)]
        if no_buy_days and t in no_buy_days:
            return queue
        if STOP_GUARD[0] and sum(t - STOP_GUARD[1] * 86_400_000 < d <= t for d in stop_days) >= STOP_GUARD[0]:
            return queue
        free = K - len(pos) + len(queue)
        cands = [(s["strength"], c) for c in info
                 if c not in pos and (not allowed or c in allowed) and (s := sig(c, t)) and all_green(s)
                 and t - last_exit.get(c, -10**15) >= COOLDOWN_DAYS * 86_400_000]
        return queue + [("buy", c) for _, c in sorted(cands, reverse=True)[:max(free, 0)]]

    before = [t for t in prep["days"] if t < start_ms]
    queue = scan(before[-1]) if before else []
    prev = before[-1] if before else None
    for t in days:
        bar = {c: v["rows"][v["idx"][t]] for c, v in info.items() if t in v["idx"]}
        fill(queue, t, bar, {c: sig(c, prev) for c in bar} if prev else {})
        if INTRADAY_BUYS:
            intraday_buys(t, lambda c: info[c]["idx"].get(t))
        # stops during the day, then trail them up from the close
        for c in list(pos):
            if c not in bar:
                continue
            o, _h, low, cl = bar[c][1:5]
            p = pos[c]
            p["last"] = cl
            crash = p["stop"] * (1 - DISASTER)
            if DISASTER and low <= crash:
                close(c, t, min(o, crash), "Disaster stop")
            elif CLOSE_STOP and cl <= p["stop"]:
                close(c, t, cl, "Stop hit")
            elif not CLOSE_STOP and low <= p["stop"]:
                close(c, t, min(o, p["stop"]), "Stop hit")
            else:
                if TAKE_HALF and not p.get("half") and cl >= p["entry"] * (1 + TAKE_HALF):
                    sold = p["units"] / 2
                    cash += sold * cl * (1 - COST)
                    p["units"] -= sold; p["cost"] /= 2; p["half"] = True
                p["high"] = max(p["high"], cl)
                p["stop"] = max(p["stop"], p["high"] - ATR_MULT * sig(c, t)["atr"])
        queue = scan(t)
        prev = t
        curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    # today, still forming: fill at its open, value at the current price
    if live and prev is not None:
        t = max(r[0] for r in live.values())
        if t > prev and t >= start_ms:
            bar = {c: r for c, r in live.items() if r[0] == t and c in info}
            fill(queue, t, bar, {c: sig(c, prev) for c in bar})
            if INTRADAY_BUYS:
                intraday_buys(t, lambda c: len(info[c]["rows"]) if info[c]["rows"][-1][0] < t else None)
            queue = []
            for c in list(pos):
                if c in bar:
                    pos[c]["last"] = bar[c][4]
                    crash = pos[c]["stop"] * (1 - DISASTER)
                    if DISASTER and bar[c][3] <= crash:  # a crash is acted on straight away
                        close(c, t, min(bar[c][1], crash), "Disaster stop")
                    elif not CLOSE_STOP and bar[c][3] <= pos[c]["stop"]:  # close-only stops wait for the close
                        close(c, t, min(bar[c][1], pos[c]["stop"]), "Stop hit")
            curve.append((t, cash + sum(p["units"] * p["last"] for p in pos.values())))

    open_pos = [{"coin": c, "sleeve": sleeve["key"], "entry_date": _day(p["t"]), "entry_price": p["entry"],
                 "cost": p["cost"], "entry_stop": p["stop0"],
                 "last_price": p["last"], "stop": p["stop"], "value": p["units"] * p["last"],
                 "pnl": p["units"] * p["last"] - p["cost"], "pnl_pct": (p["units"] * p["last"] / p["cost"] - 1) * 100}
                for c, p in pos.items()]
    pending = [{"action": a, "coin": c, "sleeve": sleeve["key"]} for a, c in queue]
    return {"curve": curve, "trades": trades, "positions": open_pos, "pending": pending, "cash": cash}


def _combine(parts: list[dict]) -> list[tuple[int, float]]:
    return [(t, sum(p["curve"][i][1] for p in parts)) for i, (t, _) in enumerate(parts[0]["curve"])]


def safety_trip(curve: list[tuple[int, float]], limit: float, from_ms: int = 0) -> int | None:
    """First day (closed days only) the account sits `limit` or more below its peak since from_ms."""
    peak = 0.0
    for t, v in curve[:-1] if len(curve) > 1 else curve:  # last point may be today's unfinished day
        if t < from_ms:
            continue
        peak = max(peak, v)
        if peak and v <= peak * (1 - limit):
            return t
    return None


def run_account(prep: dict, start_ms: int, capital: float, live: dict | None = None,
                safety: float | None = None, safety_from_ms: int = 0, no_buy_days: set[int] | None = None,
                hourly: dict | None = None) -> dict:
    """Run both sleeves with their share of the capital and combine them. With `safety`, the whole
    account is sold and stopped the first time it falls that fraction below its peak."""
    def go(halt_ms: int | None) -> list[dict]:
        return [run_sleeve(prep, s, start_ms, capital * s["share"], live, halt_ms, no_buy_days, hourly) for s in SLEEVES]
    parts = go(None)
    halted = safety_trip(_combine(parts), safety, safety_from_ms) if safety else None
    if halted is not None:
        parts = go(halted)
    curve = _combine(parts)
    return {
        "halted": _day(halted) if halted is not None else None,
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
