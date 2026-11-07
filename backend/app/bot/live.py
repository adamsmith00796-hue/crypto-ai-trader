"""Live trading on Hyperliquid spot: makes the real account hold what the six-dot rules hold.

Each refresh it runs the same engine as the paper account (from the day live trading started,
with the real starting balance), works out what the rules hold right now, and places market
orders so the Hyperliquid account matches: sell what the rules no longer hold, buy what they do.
Because it compares targets with real balances, a missed day (server down) simply catches up.

Settings, all in backend/.env (gitignored, never committed, never logged):
  HL_MODE             off (default) | dry-run | testnet | live
  HL_ACCOUNT_ADDRESS  the PUBLIC address of your main Hyperliquid wallet
  HL_API_PRIVATE_KEY  the private key of a Hyperliquid API wallet ("agent"). An API wallet can
                      trade but CANNOT withdraw. Create it in Hyperliquid under More > API.

Guards: refuses to trade an account worth more than MAX_ACCOUNT_USD (wrong wallet protection),
never repeats the same coin/side on the same day, skips orders under Hyperliquid's $10 minimum,
and follows the engine's safety switch and news brake.
"""

from __future__ import annotations

import json
import logging
import math
import os
import threading
import time
from pathlib import Path

from . import alerts, engine, moonshot
from .data import DATA_DIR, HL_ONLY

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
STATE_FILE = DATA_DIR / "live.json"
LEDGER_FILE = DATA_DIR / "live_ledger.json"
ORDER_LOG = DATA_DIR / "live_orders.jsonl"
EQUITY_FILE = DATA_DIR / "live_equity.json"  # account value at the first check of each UTC day
MAX_ACCOUNT_USD = 1000.0
MIN_ORDER_USD = 10.0
SLIPPAGE = 0.02
PRICE_CHECK = 0.03  # hold a BUY when Binance (signals) and Hyperliquid (trades) disagree by more than this
FALLBACK_STOP = 0.20  # a real position the replay lost track of is still sold if it falls this far below its buy price
TIMEOUT = 15  # seconds per Hyperliquid request; without it one hung connection stops all trading
STALL_SECONDS = 600  # a pass running this long means trading has stalled: alert
# Moonshot pot retired 10 Oct 2026: small-coin breakouts lost money on unseen 2024+ data in every version
# tested (-63% to -79%) while the main bot made +174%. It makes no new buys from MOON_STOPPED_MS; bets
# it already holds (PUMP) are kept at their current size until the moonshot sell rules exit them, at Adam's
# request. Everything else follows the main bot at 100%.
MOON_SHARE = 0.2  # only to replay the old pot's open bets to their exit
MOON_STOPPED_MS = 1791590400000  # 2026-10-10
BAND = 0.3  # only adjust a coin when it is 30% away from where the rules want it (avoids churning fees)
IDLE_CASH = 0.10  # ...unless over 10% of the account sits in cash the rules want invested: then top up
# Real buys from this day on are fed back into the replay as facts (engine `entries`): 2 Nov 2026, a
# clean start. The HYPE and ZEC bought and wrongly sold on 29 Oct UTC stay closed, not bought back.
ENTRIES_FROM_MS = 1793577600000
SELL_ALL_TRIES = 12  # a full sell (exit or stop) keeps retrying through the day instead of giving up after 3
MAX_TRIES = 3  # attempts per coin/side/day; a failed stop-loss sell is retried, not dropped
URLS = {"testnet": "https://api.hyperliquid-testnet.xyz", "live": "https://api.hyperliquid.xyz"}
# Our coin name -> Hyperliquid spot token (Unit-bridged coins are prefixed with U)
TOKENS = {"BTC": "UBTC", "ETH": "UETH", "SOL": "USOL", "ZEC": "UZEC", "NEAR": "ONEAR", "HYPE": "HYPE",
          "ENA": "UENA", "PUMP": "UPUMP", "XPL": "UXPL", "PENGU": "HPENGU"}
log = logging.getLogger(__name__)


def settings() -> dict:
    env: dict[str, str] = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    get = lambda k, d="": os.environ.get(k) or env.get(k, d)  # noqa: E731
    return {"mode": get("HL_MODE", "off").lower(), "address": get("HL_ACCOUNT_ADDRESS"), "key": get("HL_API_PRIVATE_KEY")}


def _day(ms: float) -> str:
    return time.strftime("%Y-%m-%d", time.gmtime(ms / 1000))


def _targets(prep: dict, candles: dict, live_candles: dict, start_ms: int, capital: float,
             hourly: dict | None = None, entries: dict | None = None, **safety) -> tuple[dict[str, float], float, dict, dict]:
    """USD the main bot holds per coin right now, its own account value, its run (for the safety switch
    status), and the retired moonshot pot's run (its open bets are kept as they are until they exit)."""
    run = engine.run_account(prep, start_ms, capital, live_candles, hourly=hourly, entries=entries, **safety)
    moon = moonshot.run(candles, start_ms, capital * MOON_SHARE, live_candles, no_new_after=MOON_STOPPED_MS)
    held: dict[str, float] = {}
    for p in run["positions"]:
        held[p["coin"]] = held.get(p["coin"], 0.0) + p["value"]
    equity = run["curve"][-1][1] if run["curve"] else capital
    return held, equity, run, moon


def plan_orders(holdings_usd: dict[str, float], usdc: float, targets_usd: dict[str, float]) -> list[dict]:
    """Make the account hold what the rules hold, ignoring small differences (BAND) so price
    drift doesn't cause fee-burning trades. Sells first so their USDC funds the buys."""
    orders = []
    for coin, have in holdings_usd.items():
        want = targets_usd.get(coin, 0.0)
        if want == 0.0 and have >= MIN_ORDER_USD:
            orders.append({"coin": coin, "side": "sell", "usd": have, "all": True})
        elif want > 0 and have > want * (1 + BAND) and have - want >= MIN_ORDER_USD:
            orders.append({"coin": coin, "side": "sell", "usd": have - want, "all": False})
    cash = usdc + sum(o["usd"] for o in orders)
    equity = usdc + sum(holdings_usd.values())
    idle = equity > 0 and cash / equity > IDLE_CASH and sum(targets_usd.values()) > equity * (1 - IDLE_CASH)
    for coin, want in sorted(targets_usd.items(), key=lambda x: -x[1]):
        have = holdings_usd.get(coin, 0.0)
        if want > 0 and (have < want * (1 - BAND) or idle):
            usd = min(want - have, cash * 0.995)
            if usd >= MIN_ORDER_USD:
                orders.append({"coin": coin, "side": "buy", "usd": usd, "all": False})
                cash -= usd
    return orders


class Account:
    """Thin wrapper over the official hyperliquid-python-sdk."""

    def __init__(self, network: str, address: str, key: str):
        from eth_account import Account as EthAccount
        from hyperliquid.exchange import Exchange
        from hyperliquid.info import Info
        self.address = address
        self.info = Info(URLS[network], skip_ws=True, timeout=TIMEOUT)
        self.exchange = Exchange(EthAccount.from_key(key), URLS[network], account_address=address, timeout=TIMEOUT) if key else None

    def pair(self, coin: str) -> str | None:
        name = f"{TOKENS[coin]}/USDC"
        return name if name in self.info.name_to_coin else None

    def prices(self) -> dict[str, float]:
        mids = self.info.all_mids()
        out = {}
        for coin in TOKENS:
            pair = self.pair(coin)
            if pair and self.info.name_to_coin[pair] in mids:
                out[coin] = float(mids[self.info.name_to_coin[pair]])
        return out

    def balances(self) -> tuple[float, dict[str, float]]:
        """(USDC, {coin: token amount})."""
        by_token = {b["coin"]: float(b["total"]) for b in self.info.spot_user_state(self.address)["balances"]}
        return by_token.get("USDC", 0.0), {c: by_token.get(t, 0.0) for c, t in TOKENS.items() if by_token.get(t)}

    def market(self, coin: str, is_buy: bool, size: float) -> dict:
        pair = self.pair(coin)
        decimals = self.info.asset_to_sz_decimals[self.info.name_to_asset(pair)]
        size = math.floor(size * 10 ** decimals) / 10 ** decimals
        if size <= 0:
            return {"ok": False, "error": "size rounds to zero"}
        resp = self.exchange.market_open(pair, is_buy, size, slippage=SLIPPAGE)
        status = (resp.get("response", {}).get("data", {}).get("statuses") or [{}])[0] if resp.get("status") == "ok" else {}
        if "filled" in status:
            f = status["filled"]
            return {"ok": True, "size": float(f["totalSz"]), "price": float(f["avgPx"]), "oid": f.get("oid")}
        return {"ok": False, "error": status.get("error") or str(resp)[:300]}


def round_trips() -> list[dict]:
    """Each real trade from first buy to final sell, with its profit or loss (average cost; part sells pro rata)."""
    out, held = [], {}
    for f in fills():
        c, p = f["coin"], held.get(f["coin"])
        if f["side"] == "buy":
            p = held.setdefault(c, {"size": 0.0, "cost": 0.0, "spent": 0.0, "got": 0.0, "t": f["t"]})
            p["size"] += f["size"]
            p["cost"] += f["usd"]
        elif p and p["size"] > 0:
            share = min(1.0, f["size"] / p["size"])
            used = p["cost"] * share
            p["size"] -= p["size"] * share
            p["cost"] -= used
            p["spent"] += used
            p["got"] += f["usd"]
            if share > 0.999:  # sold out: the trade is closed
                out.append({"coin": c, "opened": p["t"], "closed": f["t"], "cost": p["spent"], "pnl": p["got"] - p["spent"],
                            "pnl_pct": (p["got"] / p["spent"] - 1) * 100 if p["spent"] else 0.0})
                del held[c]
    return out


def history(n: int = 12) -> list[dict]:
    """The last n filled real orders, newest first (from the order log)."""
    return fills()[::-1][:n]


def fills() -> list[dict]:
    """Every filled real order, oldest first (from the order log)."""
    if not ORDER_LOG.exists():
        return []
    out = []
    for line in ORDER_LOG.read_text().splitlines():
        try:
            o = json.loads(line)
        except ValueError:
            continue
        r = o.get("result") or {}
        if r.get("ok") and o.get("network") == "live":
            out.append({"t": int(o["t"] * 1000), "side": o["side"], "coin": o["coin"],
                        "usd": r["size"] * r["price"], "size": r["size"], "price": r["price"]})
    return out


def price_mismatch(orders: list[dict], px: dict[str, float], live_candles: dict) -> dict[str, tuple[float, float]]:
    """Coins whose order should wait because the price the rules saw (Binance) and the price it would trade at
    (Hyperliquid) disagree by more than PRICE_CHECK: one of the two feeds has a bad tick. {coin: (binance, hl)}.
    Buys only: a sell must never be held up by a price gap (a lasting gap on a thin coin would block its stop)."""
    out = {}
    for o in orders:
        c = o["coin"]
        if o["side"] != "buy" or c in HL_ONLY or c not in live_candles or c not in px:  # HYPE's signals already come from Hyperliquid
            continue
        seen, trade = live_candles[c][4], px[c]
        if seen > 0 and abs(trade / seen - 1) > PRICE_CHECK:
            out[c] = (seen, trade)
    return out


def _warn_once(network: str, what: str, text: str) -> None:
    """Telegram warning, at most once a day per distinct problem."""
    warned = _load(LEDGER_FILE, {})
    key = f"{network}:{_day(time.time() * 1000)}:warn:{what}"
    if not warned.get(key):
        alerts.send(text)
        warned[key] = {"done": True, "tries": 1}
        LEDGER_FILE.write_text(json.dumps(dict(list(warned.items())[-500:])))


def bad_tick_sells(orders: list[dict], run: dict, px: dict[str, float]) -> list[str]:
    """Full sells from today's disaster stop where Hyperliquid's price is well above the crash level the
    replay sold at: the crash was probably one bad Binance tick. They wait; the daily-close stop still works."""
    today = _day(time.time() * 1000)
    crash = {x["coin"]: x["exit_price"] for x in run["trades"] if x["exit_date"] == today and x["reason"] == "Disaster stop"}
    return [o["coin"] for o in orders if o["side"] == "sell" and o["all"] and o["coin"] in crash
            and o["coin"] in px and px[o["coin"]] > crash[o["coin"]] * 1.10]


def unexplained_sells(orders: list[dict], run: dict, buys: list[dict], moon: dict | None = None,
                      px: dict[str, float] | None = None) -> list[str]:
    """Full sells the replay has no exit for: it holds nothing of the coin, yet no rule (trend, stop,
    safety switch) closed the bot's last real buy of it. That means the replay changed its mind about
    the past (a data gap, a changed coin list...), not that a rule fired, so the sale must not happen."""
    if run["halted"]:
        return []
    last_buy = {b["coin"]: _day(b["t"]) for b in buys if b["side"] == "buy"}
    paid = {b["coin"]: b["price"] for b in buys if b["side"] == "buy"}
    exited = {}
    for x in run["trades"] + (moon or {}).get("trades", []):
        exited[x["coin"]] = max(exited.get(x["coin"], ""), x["exit_date"])
    out = []
    for o in orders:
        c = o["coin"]
        if o["side"] != "sell" or not o["all"] or exited.get(c, "") >= last_buy.get(c, ""):  # no recorded buy: nothing to protect
            continue
        if px and c in paid and px[c] <= paid[c] * (1 - FALLBACK_STOP):
            continue  # the replay lost this position, so it has no stop of its own: fall back to a hard one
        out.append(c)
    return out


def open_trades(run: dict, buys: list[dict], px: dict[str, float], holdings: dict[str, float]) -> list[dict]:
    """The coins really held, for the dashboard: what was really paid, the price now and the rules' stop."""
    paid = {b["coin"]: b["price"] for b in buys if b["side"] == "buy"}
    out = []
    for p in run["positions"]:
        c = p["coin"]
        if holdings.get(c, 0.0) >= MIN_ORDER_USD and c in paid and c in px:
            out.append({"coin": c, "paid": paid[c], "now": px[c], "stop": p["stop"], "value": holdings[c],
                        "pnl_pct": (px[c] / paid[c] - 1) * 100})
    return out


def _load(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


_busy = threading.Lock()  # a refresh that timed out keeps running in its thread; never let two passes overlap
_busy_since = 0.0


def sync(prep: dict, candles: dict, live_candles: dict, safety: float, no_buy_days: set[int] | dict[int, int],
         hourly: dict | None = None) -> dict:
    """One pass: read the account, work out orders, place them (unless off / dry-run)."""
    global _busy_since
    if not _busy.acquire(blocking=False):
        stuck = time.time() - _busy_since
        if stuck > STALL_SECONDS:
            _warn_once("live", "stalled", f"🚨 Trading has stalled: one pass has been running for {stuck / 60:.0f} minutes. "
                                          "No buys, sells or stops until it clears. Claude needs to check the server.")
            return {"mode": settings()["mode"], "orders": [], "error": f"TRADING STALLED for {stuck / 60:.0f} min"}
        return {"mode": settings()["mode"], "orders": [], "error": "Previous pass still running: skipped"}
    _busy_since = time.time()
    try:
        return _sync(prep, candles, live_candles, safety, no_buy_days, hourly)
    finally:
        _busy.release()


def _sync(prep: dict, candles: dict, live_candles: dict, safety: float, no_buy_days: set[int] | dict[int, int],
          hourly: dict | None = None) -> dict:
    cfg = settings()
    mode = cfg["mode"]
    if mode not in ("dry-run", "testnet", "live"):
        return {"mode": "off"}
    out: dict = {"mode": mode, "orders": [], "error": None}
    try:
        network = "live" if mode in ("live", "dry-run") else "testnet"
        acct = Account(network, cfg["address"], cfg["key"] if mode != "dry-run" else "") if cfg["address"] else None
        if acct:
            usdc, amounts = acct.balances()
            px = acct.prices()
        else:  # dry-run with no wallet yet: pretend a fresh $200 account
            usdc, amounts, px = 200.0, {}, {}
        holdings = {c: a * px.get(c, 0.0) for c, a in amounts.items()}
        equity = usdc + sum(holdings.values())
        out.update(network=network, usdc=usdc, holdings=holdings, equity=equity)

        state = _load(STATE_FILE, None) if mode != "dry-run" else None
        if state is None or state.get("network") != network:  # first run on this network: start today
            state = {"network": network, "start_ms": int(time.time() * 1000) // 86_400_000 * 86_400_000,
                     "capital": equity, "created": time.time()}
            if mode != "dry-run":
                DATA_DIR.mkdir(parents=True, exist_ok=True)
                STATE_FILE.write_text(json.dumps(state))
        out["started"] = _day(state["start_ms"])

        done = fills()
        entries: dict[str, list[int]] = {}
        for f in done:
            if f["side"] == "buy" and f["t"] >= ENTRIES_FROM_MS:
                entries.setdefault(f["coin"], []).append(f["t"])
        targets, engine_equity, run, moon = _targets(prep, candles, live_candles, state["start_ms"], state["capital"],
                                                     hourly=hourly, entries=entries, safety=safety, no_buy_days=no_buy_days,
                                                     safety_from_ms=state.get("safety_reset_ms", state["start_ms"]))
        kept = {p["coin"]: holdings.get(p["coin"], 0.0) for p in moon["positions"]}  # old moonshot bets: hold as they are
        scale = (equity - sum(kept.values())) / engine_equity if engine_equity > 0 else 0.0
        targets_usd = {c: v * scale for c, v in targets.items() if acct is None or c in px}
        for c, v in kept.items():
            targets_usd[c] = targets_usd.get(c, 0.0) + v
        out.update(targets=targets_usd, halted=run["halted"], history=history(), capital=state["capital"],
                   start_ms=state["start_ms"], positions=open_trades(run, done, px, holdings))
        if mode != "dry-run":
            today_key = _day(time.time() * 1000)
            days = _load(EQUITY_FILE, {})
            if today_key not in days:
                days[today_key] = equity
                EQUITY_FILE.write_text(json.dumps(dict(sorted(days.items())[-400:])))
            out["day_start"] = days[today_key]
        problems = []
        for _ in range(3):  # anything held back keeps its current holding, then plan again so buys aren't funded by it
            orders = plan_orders(holdings, usdc, targets_usd)
            blocked = unexplained_sells(orders, run, done, moon, px)
            wick = bad_tick_sells(orders, run, px)
            odd = price_mismatch(orders, px, live_candles)
            if not (blocked or wick or odd):
                break
            for c in [*blocked, *wick, *odd]:
                targets_usd[c] = holdings.get(c, 0.0)
            if blocked:
                problems.append(f"Held back selling {', '.join(blocked)}: no exit rule fired (replay mismatch)")
                if mode != "dry-run":
                    _warn_once(network, ",".join(blocked), f"⚠️ Held back selling {', '.join(blocked)}: the rules didn't call "
                               f"for it. Only a {FALLBACK_STOP:.0%} drop below its buy price will sell it now. Claude needs to check.")
            if wick:
                problems.append(f"Held a disaster-stop sale of {', '.join(wick)}: Hyperliquid's price never crashed")
                if mode != "dry-run":
                    _warn_once(network, "wick:" + ",".join(wick), f"⚠️ Disaster stop on {', '.join(wick)} looks like a bad price "
                               "tick (Hyperliquid's price is fine). Holding; the daily-close stop still applies.")
            if odd:
                detail = ", ".join(f"{c} Binance ${b:,.4g} vs Hyperliquid ${h:,.4g}" for c, (b, h) in odd.items())
                problems.append(f"Waiting to buy {', '.join(odd)}: prices disagree ({detail})")
                if mode != "dry-run":
                    _warn_once(network, "price:" + ",".join(odd), f"⚠️ Buy held: prices disagree by over {PRICE_CHECK:.0%} "
                               f"({detail}). It retries every 5 minutes.")
        if problems:
            out["error"] = " · ".join(dict.fromkeys(problems))
        out["orders"] = orders

        if equity > MAX_ACCOUNT_USD:
            out["error"] = f"Account worth ${equity:,.0f}, above the ${MAX_ACCOUNT_USD:,.0f} safety limit: not trading"
            return out
        if mode == "dry-run" or not orders:
            return out
        if not cfg["key"]:
            out["error"] = "No HL_API_PRIVATE_KEY set"
            return out

        today = _day(time.time() * 1000)
        ledger = _load(LEDGER_FILE, {})  # {"network:day:coin:side": {"done": bool, "tries": n}}
        for o in orders:
            sell_all = o["side"] == "sell" and o["all"]
            key = f"{network}:{today}:{o['coin']}:{'sell_all' if sell_all else o['side']}"
            entry = ledger.get(key, {"done": False, "tries": 0})
            # a full sell is never "done": once it fills the coin is gone and isn't planned again, and a part fill sells the rest
            if (entry["done"] and not sell_all) or entry["tries"] >= (SELL_ALL_TRIES if sell_all else MAX_TRIES):
                o["result"] = {"ok": False, "error": "already done today" if entry["done"] else "gave up for today"}
                continue
            price = px[o["coin"]]
            size = amounts.get(o["coin"], 0.0) if o["all"] else o["usd"] / price
            o["result"] = r = acct.market(o["coin"], o["side"] == "buy", size)
            label = "TESTNET" if network == "testnet" else "LIVE"
            if r["ok"]:
                alerts.send(f"{'🟢 BUY' if o['side'] == 'buy' else '🔴 SELL'} {o['coin']} ({label})\n"
                            f"{r['size']:g} at ${r['price']:,.4g} = ${r['size'] * r['price']:,.2f}")
            entry = {"done": r["ok"], "tries": entry["tries"] + 1}
            if not r["ok"]:
                alerts.send(f"⚠️ {label} order FAILED ({entry['tries']}/{SELL_ALL_TRIES if sell_all else MAX_TRIES}): "
                            f"{o['side']} {o['coin']}\n{r['error']}")
            ledger[key] = entry
            LEDGER_FILE.write_text(json.dumps(dict(list(ledger.items())[-500:])))
            with ORDER_LOG.open("a") as f:
                f.write(json.dumps({"t": time.time(), "network": network, **o}) + "\n")
        # show the account as it is after trading, not as it was before
        usdc, amounts = acct.balances()
        px = acct.prices()
        holdings = {c: a * px.get(c, 0.0) for c, a in amounts.items()}
        out.update(usdc=usdc, holdings=holdings, equity=usdc + sum(holdings.values()),
                   positions=open_trades(run, fills(), px, holdings))
    except Exception as e:  # never let the live side take the paper bot down
        log.warning("live sync failed: %s", type(e).__name__)
        out["error"] = f"{type(e).__name__}: {e}"[:300]
    return out


if __name__ == "__main__":
    # python -m app.bot.live : show what live trading would do right now, without placing orders
    import sys
    from . import data, news_brake, service
    os.environ["HL_MODE"] = "dry-run"
    candles, live_c = data.refresh_all()
    result = sync(engine.prepare(candles), candles, live_c, service.SAFETY, news_brake.brake_days(),
                  data.refresh_hourly(engine.TRADEABLE))
    json.dump(result, sys.stdout, indent=1, default=str)
