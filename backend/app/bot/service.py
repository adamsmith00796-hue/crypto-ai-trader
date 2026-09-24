"""Keeps the bot's view of the market fresh and builds what the dashboard shows.

Paper trading only: no exchange keys, no real orders.
"""

from __future__ import annotations

import asyncio
import json
import time

from . import alerts, data, engine
from .strategy import DOTS, all_green, coin_signals, trend_broken

CAPITAL = 200.0
BACKTEST_START_MS = 1609459200000  # 2021-01-01
REFRESH_SECONDS = 5 * 60
PAPER_FILE = data.DATA_DIR / "paper.json"
DAY_MS = 86_400_000

_state: dict = {"ready": False, "message": "Downloading price history, first run takes about a minute"}


def _paper_start(latest_closed_ms: int) -> int:
    """Paper trading starts from the first day that closes after it was switched on."""
    if PAPER_FILE.exists():
        return json.loads(PAPER_FILE.read_text())["start_ms"]
    start = latest_closed_ms + DAY_MS
    data.DATA_DIR.mkdir(parents=True, exist_ok=True)
    PAPER_FILE.write_text(json.dumps({"start_ms": start, "capital": CAPITAL, "created": time.time()}))
    return start


def _rule_200(prep: dict, start_ms: int, capital: float) -> list[tuple[int, float]]:
    """Benchmark: hold Bitcoin only while yesterday's close was above its 200-day average."""
    rows = prep["coins"]["BTC"]["rows"]
    cash, units, curve = capital, 0.0, []
    for i in range(200, len(rows)):
        if rows[i][0] < start_ms:
            continue
        above = rows[i - 1][4] > sum(r[4] for r in rows[i - 200:i]) / 200
        if above and not units:
            units, cash = cash * (1 - engine.COST) / rows[i][1], 0.0
        elif not above and units:
            cash, units = units * rows[i][1] * (1 - engine.COST), 0.0
        curve.append((rows[i][0], cash + units * rows[i][4]))
    return curve


def _sample(curve: list[tuple[int, float]], every: int) -> list[list[float]]:
    pts = curve[::every]
    if curve and pts[-1] != curve[-1]:
        pts.append(curve[-1])
    return [[t, round(v, 2)] for t, v in pts]


def _window(curve: list[tuple[int, float]], days: int) -> float | None:
    if len(curve) <= days:
        return None
    return (curve[-1][1] / curve[-1 - days][1] - 1) * 100


def build(candles: dict, live: dict) -> dict:
    prep = engine.prepare(candles)
    btc = prep["coins"]["BTC"]
    last_t = btc["rows"][-1][0]

    bt = engine.run_account(prep, BACKTEST_START_MS, CAPITAL)
    hold_btc = engine.hold(prep, "BTC", BACKTEST_START_MS, CAPITAL)
    rule = _rule_200(prep, BACKTEST_START_MS, CAPITAL)

    start = _paper_start(last_t)
    paper = engine.run_account(prep, start, CAPITAL, live)
    if not paper["curve"]:
        paper = None  # today's candle not available yet

    # Statuses come from the paper account only. Before it starts, all-green coins show BUY,
    # meaning the paper account will buy them at its first open.
    held = {p["coin"] for p in paper["positions"]} if paper else set()
    pending = {p["coin"]: p["action"] for p in paper["pending"]} if paper else {}
    scanner = []
    for coin, v in prep["coins"].items():
        s = v["sig"][-1] if v["rows"][-1][0] == last_t else None
        if not s or coin not in engine.TRADEABLE and coin not in held:
            continue
        if coin in held:
            status = "SELL" if pending.get(coin) == "sell" or trend_broken(s) else "IN TRADE"
        else:
            # BUY = queued for tomorrow's open; READY = all green but the bot's slots are full
            status = ("BUY" if pending.get(coin) == "buy" or (not paper and all_green(s))
                      else "READY" if all_green(s) else "WATCHING")
        # Live dots: the same rules with today's unfinished candle as if it closed now. Display only,
        # the bot still acts on the finished day at 10am AEST.
        now_sig = coin_signals(v["rows"] + [live[coin]])[-1] if coin in live else None
        dots = {k: bool(now_sig[k] if now_sig and k != "big" else s[k]) for k, _, _ in DOTS}
        scanner.append({
            "coin": coin, "price": live[coin][4] if coin in live else v["rows"][-1][4], "status": status,
            "dots": dots, "green": sum(dots.values()),
            "dots_at_close": {k: bool(s[k]) for k, _, _ in DOTS},
            "strength": round(s["strength"], 2),
        })
    order = {"IN TRADE": 0, "SELL": 1, "BUY": 2, "READY": 3, "WATCHING": 4}
    scanner.sort(key=lambda x: (order[x["status"]], -x["green"], -x["strength"]))

    return {
        "ready": True,
        "mode": "paper",
        "capital": CAPITAL,
        "updated_at": time.time(),
        "last_candle": engine._day(last_t),
        "coins_scanned": len(prep["coins"]),
        "dots": [{"key": k, "label": label, "desc": desc} for k, label, desc in DOTS],
        "sleeves": [{k: s[k] for k in ("key", "label", "share", "slots")} for s in engine.SLEEVES],
        "cost_per_side_pct": engine.COST * 100,
        "exchange": engine.EXCHANGE,
        "scanner": scanner,
        "paper": {
            "start_date": engine._day(start),
            "started": paper is not None,
            "stats": engine.stats(paper["curve"], paper["trades"]) if paper else None,
            "curve": _sample(paper["curve"], 1) if paper else [],
            "positions": paper["positions"] if paper else [],
            "pending": paper["pending"] if paper else [],
            "trades": paper["trades"][::-1] if paper else [],
            "cash": paper["cash"] if paper else CAPITAL,
        },
        "backtest": {
            "start_date": engine._day(BACKTEST_START_MS),
            "bot": engine.stats(bt["curve"], bt["trades"]),
            "hold_btc": engine.stats(hold_btc),
            "rule_200": engine.stats(rule),
            "windows": {
                label: {"bot": _window(bt["curve"], d), "hold_btc": _window(hold_btc, d)}
                for label, d in (("90 days", 90), ("12 months", 365))
            },
            "curves": {"bot": _sample(bt["curve"], 7), "hold_btc": _sample(hold_btc, 7), "rule_200": _sample(rule, 7)},
            "positions": bt["positions"],
            "recent_trades": bt["trades"][::-1][:25],
        },
    }


async def refresh_loop() -> None:
    global _state
    while True:
        try:
            candles, live = await asyncio.to_thread(data.refresh_all)
            _state = await asyncio.to_thread(build, candles, live)
            await asyncio.to_thread(alerts.notify, _state["paper"])
        except Exception as e:  # keep serving the last good result
            if not _state.get("ready"):
                _state = {"ready": False, "message": f"Price download failed, retrying: {e}"}
        await asyncio.sleep(REFRESH_SECONDS)


def status() -> dict:
    return _state
