"""Telegram alerts for the paper account: one message per buy and per sell, nothing else.

Uses the existing Telegram bot's credentials: TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID from
backend/.env if set there, otherwise from ~/telegram-claude-bot/.env. Sent alerts are
remembered in backend/data/alerts_sent.json so each buy or sell is only messaged once.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import httpx

from .data import DATA_DIR

ENV_FILES = [Path(__file__).resolve().parent.parent.parent / ".env", Path.home() / "telegram-claude-bot" / ".env"]
SENT_FILE = DATA_DIR / "alerts_sent.json"
LOCAL_TZ = ZoneInfo("Australia/Sydney")
WAKE_HOUR, SLEEP_HOUR = 7, 22  # early breakout alerts are held overnight and sent from 7am
BREAKOUTS_PER_DAY = 3
log = logging.getLogger(__name__)


def _credentials() -> tuple[str, str] | None:
    for f in ENV_FILES:
        if not f.exists():
            continue
        env: dict[str, str] = {}
        for line in f.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
        token = os.environ.get("TELEGRAM_BOT_TOKEN") or env.get("TELEGRAM_BOT_TOKEN")
        chat = os.environ.get("TELEGRAM_CHAT_ID") or env.get("TELEGRAM_CHAT_ID")
        if token and chat:
            return token, chat
    return None


def _money(x: float) -> str:
    sign = "-" if x < 0 else ""
    x = abs(x)
    return f"{sign}${x:,.0f}" if x >= 100 else f"{sign}${x:,.2f}" if x >= 1 else f"{sign}${x:.4g}"


def _where(x: dict) -> str:
    return {"core": "paper, Bitcoin core", "moonshot": "paper, 🚀 MOONSHOT"}.get(x["sleeve"], "paper, top-10 slice")


def _buy_text(p: dict) -> str:
    return (f"🟢 BUY {p['coin']} ({_where(p)})\n"
            f"Price {_money(p['entry_price'])} · amount {_money(p['cost'])}\n"
            + (f"Hard stop {_money(p['stop'])} · 20-day breakout on big volume" if p["sleeve"] == "moonshot"
               else f"Stop {_money(p['stop'])} · all six dots green"))


def _sell_text(t: dict) -> str:
    icon = "✅" if t["pnl"] >= 0 else "🔴"
    return (f"{icon} SELL {t['coin']} ({_where(t)})\n"
            f"Bought {_money(t['entry_price'])} on {t['entry_date']}, sold {_money(t['exit_price'])}\n"
            f"Result {_money(t['pnl'])} ({t['pnl_pct']:+.1f}%) · {t['reason'].lower()}")


def events(paper: dict) -> list[tuple[str, str]]:
    """Every buy and sell in the paper account, as (unique key, message)."""
    out = []
    for t in sorted(paper["trades"], key=lambda t: (t["exit_date"], t["entry_date"])):
        buy_key = f"buy:{t['sleeve']}:{t['coin']}:{t['entry_date']}"
        out.append((buy_key, _buy_text({**t, "stop": t["entry_stop"]})))
        out.append((f"sell:{t['sleeve']}:{t['coin']}:{t['exit_date']}", _sell_text(t)))
    if paper.get("halted"):
        out.append((f"halt:{paper['halted']}", f"🛑 SAFETY SWITCH (paper)\nThe account fell 40% from its peak on {paper['halted']}.\n"
                                                 "Everything is being sold and trading is paused until you restart it."))
    for p in paper["positions"]:
        out.append((f"buy:{p['sleeve']}:{p['coin']}:{p['entry_date']}", _buy_text({**p, "stop": p["entry_stop"]})))
    return out


def notify(paper: dict) -> None:
    """Send any buy or sell alerts not sent yet. Unsent ones are retried next refresh."""
    creds = _credentials()
    if not creds or not paper.get("started"):
        return
    sent = set(json.loads(SENT_FILE.read_text())) if SENT_FILE.exists() else set()
    token, chat = creds
    with httpx.Client(timeout=15) as client:
        for key, text in events(paper):
            if key in sent:
                continue
            try:
                r = client.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text})
                r.raise_for_status()
            except httpx.HTTPError as e:
                log.warning("Telegram alert failed, will retry: %s", type(e).__name__)
                break
            sent.add(key)
            SENT_FILE.write_text(json.dumps(sorted(sent)))


def _breakout_text(h: dict, btc_uptrend: bool) -> str:
    btc = "Bitcoin is in an uptrend ✅" if btc_uptrend else "⚠️ Bitcoin is NOT in an uptrend, the rules would skip this"
    if "closes_ms" in h:  # today's candle, still forming
        closes = datetime.fromtimestamp(h["closes_ms"] / 1000, LOCAL_TZ)
        hours = max((h["closes_ms"] / 1000 - time.time()) / 3600, 0)
        return (f"⏰ EARLY BREAKOUT: {h['coin']} (not on Hyperliquid, the bot can't trade it)\n"
                f"Now {_money(h['close'])} ({h['gain_1d_pct']:+.1f}% today), above its 20-day high and already on "
                f"{h['volume_x']:g}x a normal day's volume.\n"
                f"Not confirmed yet: the day closes at {closes.strftime('%-I%p').lower()}, {hours:.0f} hours away, and it can fall back before then.\n"
                f"Moonshot rules would put the hard stop 15% lower ({_money(h['stop'])}), then trail 30% below the peak.\n"
                f"{btc}\nYour call, most breakouts fizzle. Not advice.")
    return (f"🚀 BREAKOUT ALERT: {h['coin']} (not on Hyperliquid, the bot can't trade it)\n"
            f"Closed at {_money(h['close'])} ({h['gain_1d_pct']:+.1f}% on the day), a new 20-day high on "
            f"{h['volume_x']:g}x normal volume.\n"
            f"Moonshot rules would buy at the next open, hard stop -15% ({_money(h['stop'])}), then trail 30% below the peak.\n"
            f"{btc}\nYour call, most breakouts fizzle. Not advice.")


def notify_breakouts(scan: dict) -> None:
    """Telegram alerts for breakouts on coins Hyperliquid doesn't list (alert only), at most
    BREAKOUTS_PER_DAY per daily candle; the rest are on the dashboard.

    Early alerts go out as soon as a coin qualifies on today's unfinished candle, but only between
    WAKE_HOUR and SLEEP_HOUR local time, so anything that broke out overnight arrives at 7am.
    A coin alerted early is not alerted again when that day closes."""
    if not _credentials():
        return
    sent = set(json.loads(SENT_FILE.read_text())) if SENT_FILE.exists() else set()
    awake = WAKE_HOUR <= datetime.now(LOCAL_TZ).hour < SLEEP_HOUR
    for h in scan.get("breakouts", []) + (scan.get("early", []) if awake else []):
        key = f"breakout:{h['coin']}:{h['day']}"
        if key in sent or sum(k.startswith("breakout:") and k.endswith(f":{h['day']}") for k in sent) >= BREAKOUTS_PER_DAY:
            continue
        if send(_breakout_text(h, scan["btc_uptrend"])):
            sent.add(key)
            SENT_FILE.write_text(json.dumps(sorted(sent)))


def send(text: str) -> bool:
    """Send one message straight away (used for live orders). Returns False if it couldn't."""
    creds = _credentials()
    if not creds:
        return False
    token, chat = creds
    try:
        httpx.post(f"https://api.telegram.org/bot{token}/sendMessage", json={"chat_id": chat, "text": text},
                   timeout=15).raise_for_status()
        return True
    except httpx.HTTPError as e:
        log.warning("Telegram alert failed: %s", type(e).__name__)
        return False
