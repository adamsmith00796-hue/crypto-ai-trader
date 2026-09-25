"""Keeps the bot's view of the market fresh and builds what the dashboard shows.

Paper trading only: no exchange keys, no real orders.
"""

from __future__ import annotations

import asyncio
import json
import time

import csv
import io

from . import alerts, data, engine, news_brake
from .strategy import DOTS, all_green, coin_signals, trend_broken

CAPITAL = 200.0
BACKTEST_START_MS = 1609459200000  # 2021-01-01
REFRESH_SECONDS = 5 * 60
PAPER_FILE = data.DATA_DIR / "paper.json"
DAY_MS = 86_400_000
# Safety switch: sell everything and stop if the account falls this far below its peak. The worst
# drop in the track record is about 37%, so 40% only trips on something unusual. Restart by setting
# "safety_reset_ms" in data/paper.json to the restart day (ask Claude).
SAFETY = 0.40

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


def _paper_settings() -> dict:
    return json.loads(PAPER_FILE.read_text()) if PAPER_FILE.exists() else {}


def _health(paper: dict | None, bt: dict, hold_btc: list, bt_stats: dict) -> dict:
    """Is the bot behaving like it did in testing? Re-checked on every refresh with the latest prices."""
    bot_6m, btc_6m = _window(bt["curve"], 182), _window(hold_btc, 182)
    drop_now = 0.0
    if paper and paper["curve"]:
        peak = max(v for _, v in paper["curve"])
        drop_now = (1 - paper["curve"][-1][1] / peak) * 100
    worst = bt_stats["worst_drop_pct"]
    if paper and paper.get("halted"):
        verdict, note = "STOPPED", f"Safety switch tripped on {paper['halted']}: everything sold, trading paused"
    elif drop_now > worst:
        verdict, note = "WARNING", f"Down {drop_now:.0f}% from its peak, worse than anything in testing ({worst:.0f}%)"
    elif bot_6m is not None and btc_6m is not None and bot_6m < btc_6m - 10:
        verdict, note = "WATCH", f"Trailing just holding Bitcoin over 6 months ({bot_6m:+.0f}% vs {btc_6m:+.0f}%)"
    else:
        verdict, note = "ON TRACK", "Behaving within its tested range"
    return {"verdict": verdict, "note": note, "drop_now_pct": drop_now, "worst_tested_pct": worst,
            "safety_limit_pct": SAFETY * 100, "bot_6m_pct": bot_6m, "btc_6m_pct": btc_6m}


def build(candles: dict, live: dict, brake: dict | None = None) -> dict:
    prep = engine.prepare(candles)
    btc = prep["coins"]["BTC"]
    last_t = btc["rows"][-1][0]

    bt = engine.run_account(prep, BACKTEST_START_MS, CAPITAL)
    hold_btc = engine.hold(prep, "BTC", BACKTEST_START_MS, CAPITAL)
    rule = _rule_200(prep, BACKTEST_START_MS, CAPITAL)

    start = _paper_start(last_t)
    paper = engine.run_account(prep, start, CAPITAL, live, safety=SAFETY,
                               safety_from_ms=_paper_settings().get("safety_reset_ms", start),
                               no_buy_days=news_brake.brake_days())
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
            "halted": paper["halted"] if paper else None,
        },
        "health": _health(paper, bt, hold_btc, engine.stats(bt["curve"])),
        "news_brake": brake or {"on": False, "headlines": [], "crisis_headlines_24h": 0},
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


async def _refresh_once() -> None:
    global _state
    candles, live = await asyncio.to_thread(data.refresh_all)
    brake = await asyncio.to_thread(news_brake.check)
    _state = await asyncio.to_thread(build, candles, live, brake)
    await asyncio.to_thread(alerts.notify, _state["paper"])


async def refresh_loop() -> None:
    """Refresh every REFRESH_SECONDS of real (wall-clock) time. Survives the Mac sleeping: a refresh
    stuck on a network call dropped by sleep is abandoned after 4 minutes, and the wait between
    refreshes is checked against the wall clock, so a wake-up triggers a refresh straight away."""
    global _state
    while True:
        started = time.time()
        try:
            await asyncio.wait_for(_refresh_once(), timeout=240)
        except Exception as e:  # includes timeouts; keep serving the last good result
            if not _state.get("ready"):
                _state = {"ready": False, "message": f"Price download failed, retrying: {e}"}
        while time.time() - started < REFRESH_SECONDS:
            await asyncio.sleep(15)


def status() -> dict:
    return _state


def tax_csv() -> str:
    """Every closed paper trade, one row each, for an accountant. Amounts in USD."""
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["Coin", "Strategy", "Date bought", "Buy price (USD)", "Amount spent (USD)", "Date sold",
                "Sell price (USD)", "Proceeds after fees (USD)", "Profit/loss (USD)", "Days held", "Reason sold"])
    paper = _state.get("paper") or {}
    for t in sorted(paper.get("trades", []), key=lambda t: (t["exit_date"], t["coin"])):
        held = (time.mktime(time.strptime(t["exit_date"], "%Y-%m-%d")) - time.mktime(time.strptime(t["entry_date"], "%Y-%m-%d"))) / 86400
        w.writerow([t["coin"], "Bitcoin core" if t["sleeve"] == "core" else "Top coins", t["entry_date"],
                    f"{t['entry_price']:.6g}", f"{t['cost']:.2f}", t["exit_date"], f"{t['exit_price']:.6g}",
                    f"{t['cost'] + t['pnl']:.2f}", f"{t['pnl']:.2f}", int(held), t["reason"]])
    return out.getvalue()
