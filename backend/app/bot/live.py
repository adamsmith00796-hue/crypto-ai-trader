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
import time
from pathlib import Path

from . import alerts, engine, moonshot
from .data import DATA_DIR

ENV_FILE = Path(__file__).resolve().parent.parent.parent / ".env"
STATE_FILE = DATA_DIR / "live.json"
LEDGER_FILE = DATA_DIR / "live_ledger.json"
ORDER_LOG = DATA_DIR / "live_orders.jsonl"
MAX_ACCOUNT_USD = 1000.0
MIN_ORDER_USD = 10.0
SLIPPAGE = 0.02
MAIN_SHARE, MOON_SHARE = 0.8, 0.2  # the real plan: 80% six-dot bot, 20% moonshot pot
BAND = 0.3  # only adjust a coin when it is 30% away from where the rules want it (avoids churning fees)
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
             **safety) -> tuple[dict[str, float], float, dict]:
    """USD the rules hold per coin right now across both pots (a coin can sit in several), the
    rules' own account value, and the main bot's run (for the safety switch status)."""
    run = engine.run_account(prep, start_ms, capital * MAIN_SHARE, live_candles, **safety)
    moon = moonshot.run(candles, start_ms, capital * MOON_SHARE, live_candles)
    held: dict[str, float] = {}
    for p in run["positions"] + moon["positions"]:
        held[p["coin"]] = held.get(p["coin"], 0.0) + p["value"]
    equity = (run["curve"][-1][1] if run["curve"] else capital * MAIN_SHARE) + \
             (moon["curve"][-1][1] if moon["curve"] else capital * MOON_SHARE)
    return held, equity, run


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
    for coin, want in sorted(targets_usd.items(), key=lambda x: -x[1]):
        have = holdings_usd.get(coin, 0.0)
        if want > 0 and have < want * (1 - BAND):
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
        self.info = Info(URLS[network], skip_ws=True)
        self.exchange = Exchange(EthAccount.from_key(key), URLS[network], account_address=address) if key else None

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


def _load(path: Path, default):
    return json.loads(path.read_text()) if path.exists() else default


def sync(prep: dict, candles: dict, live_candles: dict, safety: float, no_buy_days: set[int]) -> dict:
    """One pass: read the account, work out orders, place them (unless off / dry-run)."""
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

        targets, engine_equity, run = _targets(prep, candles, live_candles, state["start_ms"], state["capital"], safety=safety,
                                               safety_from_ms=state.get("safety_reset_ms", state["start_ms"]),
                                               no_buy_days=no_buy_days)
        scale = equity / engine_equity if engine_equity > 0 else 0.0
        targets_usd = {c: v * scale for c, v in targets.items() if acct is None or c in px}
        out.update(targets=targets_usd, halted=run["halted"])
        orders = plan_orders(holdings, usdc, targets_usd)
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
            key = f"{network}:{today}:{o['coin']}:{o['side']}"
            entry = ledger.get(key, {"done": False, "tries": 0})
            if entry["done"] or entry["tries"] >= MAX_TRIES:
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
                alerts.send(f"⚠️ {label} order FAILED ({entry['tries']}/{MAX_TRIES}): {o['side']} {o['coin']}\n{r['error']}")
            ledger[key] = entry
            LEDGER_FILE.write_text(json.dumps(dict(list(ledger.items())[-500:])))
            with ORDER_LOG.open("a") as f:
                f.write(json.dumps({"t": time.time(), "network": network, **o}) + "\n")
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
    result = sync(engine.prepare(candles), candles, live_c, service.SAFETY, news_brake.brake_days())
    json.dump(result, sys.stdout, indent=1, default=str)
